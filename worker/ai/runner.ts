import { DurableObject } from "cloudflare:workers";
import { normalizeAnswer } from "../grading";
import { notify } from "../live";
import { ExtractError, parseResult, type AiCardResult, type DraftCard } from "./extract";
import { fakeZai } from "./fake";
import { addUsage, MODEL, NO_USAGE, type Usage } from "./prices";
import { MAX_OUTPUT_TOKENS, repairMessages, runMessages, type AiPage, type RunOptions } from "./prompt";
import { verifyCards, type PageTexts } from "./verify";
import { callZai, ZaiError, type ZaiCall, type ZaiErrorKind, type ZaiResult } from "./zai";

export type AiAction = "create" | "regenerate" | "more";

/** One run. Everything else it needs (pages, options, cards) is in D1. */
export type AiJob = {
  userId: number;
  draftId: number;
  action: AiAction;
  /** The user's locale: the language to translate into when the material has no translation. */
  userLanguage: string;
  /** "More cards" only: the pages of this run and its own instruction. */
  pages?: number[];
  instructions?: string;
  /** Local dev only (ZAI_FAKE): the stand-in AI answers, z.ai is never called. */
  fake: boolean;
  startedAt: number;
};

/** An alarm runs at most 15 minutes (Cloudflare's limit): a job older than this died with it. */
const STALE_JOB_MS = 20 * 60_000;

/**
 * One instance per user: runs that user's AI jobs, one at a time. A run takes
 * 20-120 s, so it does not wait inside a request (Safari in the background
 * kills it): the route stores the draft and hands the job over, the alarm
 * calls z.ai and writes the result to D1, the user's devices hear "ai".
 * Being one object per user is also the lock: two taps cannot pay twice.
 */
export class AiRunner extends DurableObject<Env> {
  /** Starts a run; false when one is already going (the route answers 409). */
  async start(job: AiJob): Promise<boolean> {
    const running = await this.ctx.storage.get<AiJob>("job");
    if (running && job.startedAt - running.startedAt < STALE_JOB_MS) return false;
    await this.ctx.storage.deleteAll();
    await this.ctx.storage.put("job", job);
    await this.env.DB.prepare(
      "UPDATE ai_drafts SET status = 'running', error = NULL, updated_at = unixepoch() WHERE id = ? AND user_id = ?",
    )
      .bind(job.draftId, job.userId)
      .run();
    await this.ctx.storage.setAlarm(Date.now());
    return true;
  }

  /**
   * Never throws: the runtime retries a throwing alarm, and a retry after the
   * z.ai call would pay twice. So "called" is stored before the call; a retry
   * that finds it fails the draft instead of calling again.
   */
  async alarm(): Promise<void> {
    const job = await this.ctx.storage.get<AiJob>("job");
    if (!job) return;
    try {
      if (await this.ctx.storage.get("called")) {
        await finishRun(this.env.DB, job, { kind: "ai_server" }, NO_SPEND);
      } else {
        await this.ctx.storage.put("called", true);
        const call = job.fake ? (c: ZaiCall) => fakeZai(c) : (c: ZaiCall) => callZai(this.env.ZAI_API_KEY, c);
        await runJob(this.env.DB, job, call);
      }
    } catch (err) {
      console.error("AI run failed", err);
    } finally {
      await this.ctx.storage.deleteAll();
    }
    await notify(this.env, job.userId, "ai", { draftId: job.draftId }).catch(() => {});
  }
}

/** What a run cost: summed over its calls (the run plus a repair retry). */
type Spend = { calls: number; usage: Usage; costNanos: number; durationMs: number };
const NO_SPEND: Spend = { calls: 0, usage: NO_USAGE, costNanos: 0, durationMs: 0 };

type DraftRow = {
  kind: RunOptions["kind"];
  max_cards: number;
  instructions: string;
  set_id: number | null;
  cards_json: string;
};
type PageRow = { n: number; text: string | null; image: string | null };

/**
 * One run, start to end: options and material from D1, the call (plus one
 * repair retry when the answer is unreadable), the quote check, and for "More
 * cards" the dedup against the draft and its target set. Writes the outcome
 * and the usage row, whatever happens; throws only when D1 itself fails.
 */
export async function runJob(db: D1Database, job: AiJob, call: (c: ZaiCall) => Promise<ZaiResult>): Promise<void> {
  const [draftRes, pagesRes] = await db.batch([
    db
      .prepare("SELECT kind, max_cards, instructions, set_id, cards_json FROM ai_drafts WHERE id = ? AND user_id = ?")
      .bind(job.draftId, job.userId),
    db
      .prepare("SELECT n, text, image FROM ai_draft_pages WHERE draft_id = ? AND user_id = ? ORDER BY n")
      .bind(job.draftId, job.userId),
  ]);
  const draft = draftRes!.results[0] as DraftRow | undefined;
  if (!draft) return; // deleted while it waited
  const pages = pagesRes!.results as PageRow[];
  const current = JSON.parse(draft.cards_json) as DraftCard[];
  const more = job.action === "more";

  const existing = more ? [...current, ...(await setTerms(db, job.userId, draft.set_id))] : [];
  const options: RunOptions = {
    kind: draft.kind,
    maxCards: draft.max_cards,
    userLanguage: job.userLanguage,
    instructions: more ? (job.instructions ?? "") : draft.instructions,
    existing: existing.map((card) => `${card.term} — ${card.definition}`).join("\n"),
  };
  const material: AiPage[] = pages
    .filter((page) => !more || job.pages?.includes(page.n))
    .map((page) => (page.text !== null ? { n: page.n, text: page.text } : { n: page.n, image: page.image! }));

  let spend = NO_SPEND;
  const count = (result: ZaiResult) => {
    spend = {
      calls: spend.calls + 1,
      usage: addUsage(spend.usage, result.usage),
      costNanos: spend.costNanos + result.costNanos,
      durationMs: spend.durationMs + result.durationMs,
    };
  };
  let result: AiCardResult;
  try {
    const messages = runMessages(options, { kind: "pages", pages: material });
    const first = await call({ messages, maxTokens: MAX_OUTPUT_TOKENS });
    count(first);
    try {
      result = parseResult(first.content);
    } catch (err) {
      if (!(err instanceof ExtractError)) throw err;
      const repair = repairMessages(messages, first.content, err.message);
      const second = await call({ messages: repair, maxTokens: MAX_OUTPUT_TOKENS });
      count(second);
      result = parseResult(second.content);
    }
  } catch (err) {
    // A call that went out counts, even a failed one: z.ai may have billed it.
    if (err instanceof ZaiError && err.sent) {
      count({ content: "", usage: err.usage, costNanos: err.costNanos, durationMs: err.durationMs });
    }
    const kind: ZaiErrorKind = err instanceof ZaiError ? err.kind : "ai_server";
    if (!(err instanceof ZaiError) && !(err instanceof ExtractError)) console.error("AI run failed", err);
    await finishRun(db, job, { kind }, spend);
    return;
  }

  // Only text pages can prove a quote: scans and photos stay unverified.
  const texts: PageTexts = new Map(pages.flatMap((page) => (page.text !== null ? [[page.n, page.text]] : [])));
  const made = verifyCards(result.cards, texts);
  const fresh = more ? withoutRepeats(made, existing) : made;
  await finishRun(
    db,
    job,
    {
      result,
      cards: more ? [...current, ...fresh] : fresh,
      added: fresh.length,
      skipped: made.length - fresh.length,
    },
    spend,
  );
}

/** The terms of the draft's target set, so "More cards" does not repeat them either. */
async function setTerms(db: D1Database, userId: number, setId: number | null) {
  if (setId === null) return [];
  const { results } = await db
    .prepare("SELECT term, definition FROM terms WHERE set_id = ? AND user_id = ?")
    .bind(setId, userId)
    .all<{ term: string; definition: string }>();
  return results;
}

/**
 * New cards minus those that repeat a known one: same term or same definition
 * as written answers compare (normalizeAnswer), also among the new cards.
 */
function withoutRepeats(cards: DraftCard[], known: { term: string; definition: string }[]): DraftCard[] {
  const seen = new Set(
    known.flatMap((card) => [`t:${normalizeAnswer(card.term)}`, `d:${normalizeAnswer(card.definition)}`]),
  );
  return cards.filter((card) => {
    const keys = [`t:${normalizeAnswer(card.term)}`, `d:${normalizeAnswer(card.definition)}`];
    if (keys.some((key) => seen.has(key))) return false;
    for (const key of keys) seen.add(key);
    return true;
  });
}

type Outcome = { kind: ZaiErrorKind } | { result: AiCardResult; cards: DraftCard[]; added: number; skipped: number };

/**
 * The draft's new state and the usage row, in one batch. A failed run keeps
 * its cards (a failed "More cards" loses nothing). The usage row stays even
 * when the draft was deleted meanwhile (draft_id then NULL).
 */
async function finishRun(db: D1Database, job: AiJob, outcome: Outcome, spend: Spend): Promise<void> {
  const statements: D1PreparedStatement[] = [];
  if ("kind" in outcome) {
    statements.push(
      db
        .prepare(
          "UPDATE ai_drafts SET status = 'failed', error = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?",
        )
        .bind(outcome.kind, job.draftId, job.userId),
    );
  } else {
    const { result } = outcome;
    statements.push(
      db
        .prepare(
          `UPDATE ai_drafts SET status = 'ready', error = NULL, cards_json = ?, notes = ?, added = ?, skipped = ?,
             updated_at = unixepoch()
           WHERE id = ? AND user_id = ?`,
        )
        .bind(JSON.stringify(outcome.cards), result.notes, outcome.added, outcome.skipped, job.draftId, job.userId),
    );
    // "More cards" adds to the draft; a create or regenerate also names it.
    if (job.action !== "more") {
      statements.push(
        db
          .prepare(
            "UPDATE ai_drafts SET made_kind = ?, title = ?, term_lang = ?, def_lang = ? WHERE id = ? AND user_id = ?",
          )
          .bind(result.kind, result.title, result.term_lang, result.def_lang, job.draftId, job.userId),
      );
    }
  }
  if (spend.calls > 0) {
    statements.push(
      db
        .prepare(
          `INSERT INTO ai_usage (user_id, action, model, calls, input_tokens, cached_tokens, output_tokens, cost_nanos, duration_ms, draft_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT id FROM ai_drafts WHERE id = ? AND user_id = ?))`,
        )
        .bind(
          job.userId,
          job.action,
          job.fake ? "fake" : MODEL,
          spend.calls,
          spend.usage.promptTokens,
          spend.usage.cachedTokens,
          spend.usage.completionTokens,
          spend.costNanos,
          spend.durationMs,
          job.draftId,
          job.userId,
        ),
    );
  }
  await db.batch(statements);
}
