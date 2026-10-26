import { DurableObject } from "cloudflare:workers";
import { normalizeAnswer } from "../grading";
import { notify } from "../live";
import { ExtractError, parseResult, type AiCardResult, type DraftCard } from "./extract";
import { fakeZai } from "./fake";
import { MAX_DRAFT_CARDS, pageStatements, withinRunLimits, type PageInput } from "./pages";
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

/** What a run changes on its draft before it starts: written by start(), under the lock. */
export type RunChanges = { kind?: RunOptions["kind"]; pages?: PageInput[] };

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
  /**
   * Starts a run; false when one is already going (the route answers 409).
   * Only once it holds the lock does it write the run's changes (a new kind,
   * new pages) and mark the draft running: a refused run changes nothing, and
   * if D1 fails here nothing is stored, so the lock stays free.
   */
  async start(job: AiJob, changes: RunChanges = {}): Promise<boolean> {
    // Nothing else reaches this object meanwhile, not even during the D1 call.
    // A throw in there would reset the whole object, so errors come out as values.
    const started = await this.ctx.blockConcurrencyWhile(async (): Promise<boolean | Error> => {
      try {
        const running = await this.ctx.storage.get<AiJob>("job");
        if (running && job.startedAt - running.startedAt < STALE_JOB_MS) return false;
        const db = this.env.DB;
        // A stale job whose alarm gave up while D1 was down may still hold a
        // paid result: write it first, the storage is wiped below.
        const leftover = running && (await this.ctx.storage.get<RunEnd>("end"));
        if (running && leftover) await finishRun(db, running, leftover.outcome, leftover.spend);
        await db.batch([
          db
            .prepare(
              `UPDATE ai_drafts SET status = 'running', error = NULL, kind = COALESCE(?, kind), updated_at = unixepoch()
                WHERE id = ? AND user_id = ?`,
            )
            .bind(changes.kind ?? null, job.draftId, job.userId),
          ...pageStatements(db, job.userId, job.draftId, changes.pages ?? []),
        ]);
        await this.ctx.storage.deleteAll();
        // Started together, so they are stored together: never a job without its alarm.
        await Promise.all([this.ctx.storage.put("job", job), this.ctx.storage.setAlarm(Date.now())]);
        return true;
      } catch (err) {
        return err instanceof Error ? err : new Error(String(err));
      }
    });
    if (started instanceof Error) throw started;
    return started;
  }

  /**
   * The runtime retries a throwing alarm (up to 6 times). A retry must never
   * call z.ai again, and must not lose what was already paid for. So:
   * - "called" is stored before the first call: a retry never calls again.
   * - the cost so far ("spend") is stored after every call, and the finished
   *   run ("end") before it is written to D1.
   * - a failed D1 write throws, the job stays, and the retry writes the stored
   *   end again. A retry with only "called" (the alarm died mid-call) fails the
   *   draft with the cost known so far.
   * The job is cleared only once D1 has the result.
   */
  async alarm(): Promise<void> {
    const storage = this.ctx.storage;
    const job = await storage.get<AiJob>("job");
    if (!job) return;
    const db = this.env.DB;
    let end = await storage.get<RunEnd>("end");
    if (!end && (await storage.get("called"))) {
      end = { outcome: { kind: "ai_server" }, spend: (await storage.get<Spend>("spend")) ?? NO_SPEND };
    }
    if (!end) {
      await storage.put("called", true);
      const call = job.fake ? (c: ZaiCall) => fakeZai(c) : (c: ZaiCall) => callZai(this.env.ZAI_API_KEY, c);
      end = (await runRun(db, job, call, (spend) => storage.put("spend", spend))) ?? undefined;
      if (end) await storage.put("end", end);
    }
    if (end) {
      try {
        await finishRun(db, job, end.outcome, end.spend);
      } catch (err) {
        console.error("AI run: writing the result failed, the alarm retries", err);
        throw err;
      }
    }
    await storage.deleteAll();
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

/** How a run ended and what it cost: everything finishRun writes. */
type RunEnd = { outcome: Outcome; spend: Spend };

/** One run, start to end, written to D1 (runRun plus finishRun). */
export async function runJob(db: D1Database, job: AiJob, call: (c: ZaiCall) => Promise<ZaiResult>): Promise<void> {
  const end = await runRun(db, job, call);
  if (end) await finishRun(db, job, end.outcome, end.spend);
}

/**
 * One run, without writing it: options and material from D1, the call (plus
 * one repair retry when the answer is unreadable), the quote check, and for
 * "More cards" the dedup against the draft and its target set. Null when the
 * draft is gone. `onSpend` hears the cost after every call that went out.
 */
async function runRun(
  db: D1Database,
  job: AiJob,
  call: (c: ZaiCall) => Promise<ZaiResult>,
  onSpend: (spend: Spend) => Promise<void> = async () => {},
): Promise<RunEnd | null> {
  const more = job.action === "more";
  // Every page's text (the quote check may find a quote anywhere), but images
  // only of the pages this run sends: six photos are megabytes.
  const runPages = more ? (job.pages ?? []) : [];
  const image = more ? `CASE WHEN n IN (${runPages.map(() => "?").join(", ") || "NULL"}) THEN image END` : "image";
  const [draftRes, pagesRes] = await db.batch([
    db
      .prepare("SELECT kind, max_cards, instructions, set_id, cards_json FROM ai_drafts WHERE id = ? AND user_id = ?")
      .bind(job.draftId, job.userId),
    db
      .prepare(`SELECT n, text, ${image} AS image FROM ai_draft_pages WHERE draft_id = ? AND user_id = ? ORDER BY n`)
      .bind(...runPages, job.draftId, job.userId),
  ]);
  const draft = draftRes!.results[0] as DraftRow | undefined;
  if (!draft) return null; // deleted while it waited
  const pages = pagesRes!.results as PageRow[];
  const current = JSON.parse(draft.cards_json) as DraftCard[];

  const existing = more ? [...current, ...(await setTerms(db, job.userId, draft.set_id))] : [];
  const options: RunOptions = {
    kind: draft.kind,
    maxCards: draft.max_cards,
    userLanguage: job.userLanguage,
    instructions: more ? (job.instructions ?? "") : draft.instructions,
    existing: existing.map((card) => `${card.term} — ${card.definition}`).join("\n"),
  };
  const material: AiPage[] = withinRunLimits(
    pages
      .filter((page) => !more || job.pages?.includes(page.n))
      .map((page) => (page.text !== null ? { n: page.n, text: page.text } : { n: page.n, image: page.image! })),
  );

  let spend = NO_SPEND;
  const count = async (result: ZaiResult) => {
    spend = {
      calls: spend.calls + 1,
      usage: addUsage(spend.usage, result.usage),
      costNanos: spend.costNanos + result.costNanos,
      durationMs: spend.durationMs + result.durationMs,
    };
    await onSpend(spend);
  };
  let result: AiCardResult;
  try {
    const messages = runMessages(options, { kind: "pages", pages: material });
    const first = await call({ messages, maxTokens: MAX_OUTPUT_TOKENS });
    await count(first);
    try {
      result = parseResult(first.content);
    } catch (err) {
      if (!(err instanceof ExtractError)) throw err;
      const repair = repairMessages(messages, first.content, err.message);
      const second = await call({ messages: repair, maxTokens: MAX_OUTPUT_TOKENS });
      await count(second);
      result = parseResult(second.content);
    }
  } catch (err) {
    // A call that went out counts, even a failed one: z.ai may have billed it.
    if (err instanceof ZaiError && err.sent) {
      await count({ content: "", usage: err.usage, costNanos: err.costNanos, durationMs: err.durationMs });
    }
    const kind: ZaiErrorKind = err instanceof ZaiError ? err.kind : "ai_server";
    if (!(err instanceof ZaiError) && !(err instanceof ExtractError)) console.error("AI run failed", err);
    return { outcome: { kind }, spend };
  }

  // Only text pages can prove a quote: scans and photos stay unverified.
  const texts: PageTexts = new Map(pages.flatMap((page) => (page.text !== null ? [[page.n, page.text]] : [])));
  const made = verifyCards(result.cards, texts);
  const unique = more ? withoutRepeats(made, existing) : made;
  // A draft holds at most 500 cards (what the review screen can edit and save).
  const fresh = more ? unique.slice(0, Math.max(0, MAX_DRAFT_CARDS - current.length)) : unique;
  const outcome: Outcome = {
    result,
    cards: more ? [...current, ...fresh] : fresh,
    added: fresh.length,
    skipped: made.length - unique.length,
  };
  return { outcome, spend };
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
