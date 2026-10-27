// AI-made sets: drafts from material (phase 8). The run itself happens in the
// user's AiRunner (worker/ai/runner.ts); these routes store what it needs,
// hand it over, and let the user edit, save or drop the result.
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { DraftCard } from "./ai/extract";
import { MAX_DRAFT_CARDS, MAX_IMAGE_PAGES, MAX_PAGES, MAX_TEXT_CHARS, pageStatements } from "./ai/pages";
import type { AiJob, RunChanges } from "./ai/runner";
import type { ZaiErrorKind } from "./ai/zai";
import { LANGUAGES, type Language } from "./languages";
import { notifyLater } from "./live";
import type { AppEnv, User } from "./types";
import { idParam, validate, validationError } from "./validate";

/** A run's request: page images are already shrunk (max 1600 px JPEG) by the browser. */
const MAX_BODY_BYTES = 4 * 1024 * 1024;
/** Drafts nobody touched for this long are deleted when the list is next loaded. */
const DRAFT_DAYS = 30;
/** A draft still "running" this long after its last change lost its job (alarms stop at 15 min). */
const STALE_RUN_SECONDS = 20 * 60;

const kindSchema = z.enum(["auto", "vocabulary", "questions", "terms"]);
const languageSchema = z.enum(LANGUAGES);
const pageImage = z
  .string()
  .regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/)
  .max(1_500_000);
const pageSchema = z.union([
  z.object({ n: z.number().int().positive().max(10_000), text: z.string().min(1).max(MAX_TEXT_CHARS) }),
  z.object({ n: z.number().int().positive().max(10_000), image: pageImage }),
]);

/** The pages of one run: numbers unique, the image and text caps of the plan. */
const pagesSchema = z
  .array(pageSchema)
  .min(1)
  .max(MAX_PAGES)
  .superRefine((pages, ctx) => {
    const images = pages.filter((page) => "image" in page).length;
    const chars = pages.reduce((sum, page) => sum + ("text" in page ? page.text.length : 0), 0);
    if (images > MAX_IMAGE_PAGES || chars > MAX_TEXT_CHARS) {
      ctx.addIssue({ code: "too_big", origin: "array", maximum: MAX_IMAGE_PAGES, inclusive: true, input: pages });
    }
    if (new Set(pages.map((page) => page.n)).size !== pages.length) {
      ctx.addIssue({ code: "invalid_value", values: [], input: pages });
    }
  });

const createBody = z.object({
  sourceName: z.string().trim().max(200).default(""),
  kind: kindSchema.default("auto"),
  /** 0 = as many as the material supports. */
  maxCards: z.number().int().min(0).max(60).default(0),
  instructions: z.string().trim().max(500).default(""),
  /** A set to add the cards to later; also deduped against by "More cards". */
  setId: z.number().int().positive().nullable().default(null),
  pages: pagesSchema,
});
const moreBody = z.object({ pages: pagesSchema, instructions: z.string().trim().max(500).default("") });
const regenerateBody = z.object({ kind: kindSchema });
const draftCard = z.object({
  // Empty while being edited; only the cards that get saved need both sides.
  term: z.string().trim().max(1000),
  definition: z.string().trim().max(1000),
  source: z.string().max(200).default(""),
  page: z.number().int().positive().nullable().default(null),
  verified: z.boolean().default(false),
  checked: z.boolean().default(true),
});
const patchBody = z.object({
  title: z.string().trim().max(200).optional(),
  termLang: languageSchema.nullable().optional(),
  defLang: languageSchema.nullable().optional(),
  setId: z.number().int().positive().nullable().optional(),
  cards: z.array(draftCard).max(MAX_DRAFT_CARDS).optional(),
});
const saveBody = z.object({
  /** null: a new set with this title; else the checked cards go into that set. */
  setId: z.number().int().positive().nullable(),
  title: z.string().trim().max(200).default(""),
  termLang: languageSchema.nullable().default(null),
  defLang: languageSchema.nullable().default(null),
});

type DraftRow = {
  id: number;
  status: "running" | "ready" | "failed";
  error: ZaiErrorKind | null;
  source_name: string;
  kind: z.infer<typeof kindSchema>;
  made_kind: "vocabulary" | "questions" | "terms" | null;
  max_cards: number;
  title: string;
  term_lang: Language | null;
  def_lang: Language | null;
  instructions: string;
  set_id: number | null;
  notes: string;
  added: number;
  skipped: number;
  cards_json: string;
  updated_at: number;
};

/** A draft in the list: Home's "unfinished AI draft" card. */
export type DraftSummary = {
  id: number;
  status: DraftRow["status"];
  title: string;
  sourceName: string;
  cardCount: number;
  updatedAt: number;
};

/** A draft as the review screen gets it. */
export type DraftDetail = ReturnType<typeof draftDetail>;
function draftDetail(
  row: DraftRow,
  pages: { n: number; image: number }[],
  cost: { nanos: number; tokens: number; durationMs: number },
) {
  return {
    id: row.id,
    status: row.status,
    error: row.error,
    sourceName: row.source_name,
    kind: row.kind,
    madeKind: row.made_kind,
    maxCards: row.max_cards,
    title: row.title,
    termLang: row.term_lang,
    defLang: row.def_lang,
    instructions: row.instructions,
    setId: row.set_id,
    notes: row.notes,
    added: row.added,
    skipped: row.skipped,
    cards: JSON.parse(row.cards_json) as DraftCard[],
    /** The pages already used: "More cards" marks them in the picker. */
    pages: pages.map((page) => ({ n: page.n, image: page.image === 1 })),
    /** What every run of this draft cost so far. */
    cost,
    updatedAt: row.updated_at,
  };
}

/** The monthly cap in nanodollars, or null when the user has none (admins). */
function capNanos(env: Env, user: User): number | null {
  if (user.level === "admin") return null;
  return Math.round(Number(env.AI_MONTHLY_CAP_USD) * 1e9);
}

/** What the user's AI cost this calendar month (UTC), exact. */
async function monthNanos(db: D1Database, userId: number): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(cost_nanos), 0) AS nanos FROM ai_usage
        WHERE user_id = ? AND created_at >= CAST(strftime('%s', 'now', 'start of month') AS INTEGER)`,
    )
    .bind(userId)
    .first<{ nanos: number }>();
  return row!.nanos;
}

/** True when the budget is used up: checked before every run, admins skip it. */
async function overCap(c: Context<AppEnv>): Promise<boolean> {
  const cap = capNanos(c.env, c.get("user"));
  return cap !== null && (await monthNanos(c.env.DB, c.get("user").id)) >= cap;
}

/** Hosts of the local dev server: the Mac itself, or the iPhone on the same wifi. */
export function isLocalHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".local") ||
    /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname) ||
    hostname === "[::1]"
  );
}

/**
 * The stand-in AI (ZAI_FAKE=1) is for `npm run dev` only. Set anywhere else,
 * every run is refused rather than handing out canned cards: null = refuse.
 * Checked first in every route that starts a run, before anything is written.
 */
function fakeMode(c: Context<AppEnv>): boolean | null {
  if (c.env.ZAI_FAKE !== "1") return false;
  return isLocalHost(new URL(c.req.url).hostname) ? true : null;
}
const fakeRefused = (c: Context<AppEnv>) => {
  console.error("ZAI_FAKE is set outside local dev: AI runs refused");
  return c.json({ error: "server_error" as const }, 500);
};

/**
 * Hands the job to the user's AiRunner; false when a run is already going.
 * `changes` (a new kind, new pages) are written by the runner itself, only
 * once it holds the lock: a refused run changes nothing.
 */
async function startRun(
  c: Context<AppEnv>,
  fake: boolean,
  job: Omit<AiJob, "userId" | "userLanguage" | "startedAt" | "fake">,
  changes: RunChanges = {},
) {
  const user = c.get("user");
  const runner = c.env.AI_RUNNER.get(c.env.AI_RUNNER.idFromName(String(user.id)));
  return runner.start({ ...job, userId: user.id, userLanguage: user.locale, fake, startedAt: Date.now() }, changes);
}

/**
 * Housekeeping before drafts are read: a run whose job died is failed (so the
 * draft does not spin forever), and drafts untouched for 30 days go. No cron.
 */
async function tidyDrafts(db: D1Database, userId: number): Promise<void> {
  await db.batch([
    db
      .prepare(
        `UPDATE ai_drafts SET status = 'failed', error = 'ai_server'
          WHERE user_id = ? AND status = 'running' AND updated_at < unixepoch() - ?`,
      )
      .bind(userId, STALE_RUN_SECONDS),
    db
      .prepare("DELETE FROM ai_drafts WHERE user_id = ? AND status != 'running' AND updated_at < unixepoch() - ?")
      .bind(userId, DRAFT_DAYS * 86400),
  ]);
}

async function ownsSet(db: D1Database, userId: number, setId: number): Promise<boolean> {
  return !!(await db.prepare("SELECT 1 FROM sets WHERE id = ? AND user_id = ?").bind(setId, userId).first());
}

async function loadDraft(db: D1Database, userId: number, id: number): Promise<DraftRow | null> {
  return db.prepare("SELECT * FROM ai_drafts WHERE id = ? AND user_id = ?").bind(id, userId).first<DraftRow>();
}

const capError = (c: Context<AppEnv>) =>
  c.json({ error: "ai_cap" as const, capNanos: capNanos(c.env, c.get("user"))! }, 402);
const runningError = (c: Context<AppEnv>) => c.json({ error: "ai_running" as const }, 409);
const notFound = (c: Context<AppEnv>) => c.json({ error: "not_found" as const }, 404);

export const aiRoutes = new Hono<AppEnv>()
  // Start a draft from material. Answers at once; the cards follow over "ai".
  .post(
    "/ai/drafts",
    bodyLimit({ maxSize: MAX_BODY_BYTES, onError: (c) => c.json({ error: "too_large" as const }, 413) }),
    validate("json", createBody),
    async (c) => {
      const user = c.get("user");
      const body = c.req.valid("json");
      const db = c.env.DB;
      const fake = fakeMode(c);
      if (fake === null) return fakeRefused(c);
      if (await overCap(c)) return capError(c);
      if (body.setId !== null && !(await ownsSet(db, user.id, body.setId))) {
        return validationError(c, { setId: "invalid_value" });
      }
      // One batch: the draft and its pages, or nothing. Inside it the new draft
      // is the user's highest id, so the pages find it.
      const [created] = await db.batch<{ id: number }>([
        db
          .prepare(
            `INSERT INTO ai_drafts (user_id, status, source_name, kind, max_cards, instructions, set_id)
             VALUES (?, 'running', ?, ?, ?, ?, ?) RETURNING id`,
          )
          .bind(user.id, body.sourceName, body.kind, body.maxCards, body.instructions, body.setId),
        ...pageStatements(db, user.id, "latest", body.pages),
      ]);
      const id = created!.results[0]!.id;
      if (!(await startRun(c, fake, { draftId: id, action: "create" }))) {
        await db.prepare("DELETE FROM ai_drafts WHERE id = ? AND user_id = ?").bind(id, user.id).run();
        return runningError(c);
      }
      notifyLater(c, "ai");
      return c.json({ id }, 201);
    },
  )

  // My drafts, newest first: Home's "unfinished draft" card.
  .get("/ai/drafts", async (c) => {
    const userId = c.get("user").id;
    await tidyDrafts(c.env.DB, userId);
    const { results } = await c.env.DB.prepare(
      `SELECT id, status, title, source_name, json_array_length(cards_json) AS card_count, updated_at
         FROM ai_drafts WHERE user_id = ? ORDER BY updated_at DESC, id DESC`,
    )
      .bind(userId)
      .all<{
        id: number;
        status: string;
        title: string;
        source_name: string;
        card_count: number;
        updated_at: number;
      }>();
    const drafts: DraftSummary[] = results.map((row) => ({
      id: row.id,
      status: row.status as DraftRow["status"],
      title: row.title,
      sourceName: row.source_name,
      cardCount: row.card_count,
      updatedAt: row.updated_at,
    }));
    return c.json({ drafts }, 200);
  })

  .get("/ai/drafts/:id", validate("param", idParam), async (c) => {
    const userId = c.get("user").id;
    const { id } = c.req.valid("param");
    const db = c.env.DB;
    await tidyDrafts(db, userId);
    const [draftRes, pagesRes, costRes] = await db.batch([
      db.prepare("SELECT * FROM ai_drafts WHERE id = ? AND user_id = ?").bind(id, userId),
      db
        .prepare(
          "SELECT n, image IS NOT NULL AS image FROM ai_draft_pages WHERE draft_id = ? AND user_id = ? ORDER BY n",
        )
        .bind(id, userId),
      db
        .prepare(
          `SELECT COALESCE(SUM(cost_nanos), 0) AS nanos, COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens,
                  COALESCE(SUM(duration_ms), 0) AS durationMs
             FROM ai_usage WHERE draft_id = ? AND user_id = ?`,
        )
        .bind(id, userId),
    ]);
    const row = draftRes!.results[0] as DraftRow | undefined;
    if (!row) return notFound(c);
    const pages = pagesRes!.results as { n: number; image: number }[];
    const cost = costRes!.results[0] as { nanos: number; tokens: number; durationMs: number };
    return c.json(draftDetail(row, pages, cost), 200);
  })

  // Edits on the review screen, saved as the user goes.
  .patch("/ai/drafts/:id", validate("param", idParam), validate("json", patchBody), async (c) => {
    const userId = c.get("user").id;
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const db = c.env.DB;
    if (!(await loadDraft(db, userId, id))) return notFound(c);
    if (body.setId != null && !(await ownsSet(db, userId, body.setId))) {
      return validationError(c, { setId: "invalid_value" });
    }
    // Column names come from this list only, never from the request.
    const fields: [string, unknown][] = [
      ["title", body.title],
      ["term_lang", body.termLang],
      ["def_lang", body.defLang],
      ["set_id", body.setId],
      ["cards_json", body.cards && JSON.stringify(body.cards)],
    ];
    const changed = fields.filter(([, value]) => value !== undefined);
    if (changed.length > 0) {
      // The run writes the cards when it ends: an edit during it would be lost.
      // The status is checked in the UPDATE itself, so a run that starts right
      // now cannot slip in between a check and the write.
      const updated = await db
        .prepare(
          `UPDATE ai_drafts SET ${changed.map(([column]) => `${column} = ?`).join(", ")}, updated_at = unixepoch()
            WHERE id = ? AND user_id = ? AND status != 'running'`,
        )
        .bind(...changed.map(([, value]) => value), id, userId)
        .run();
      if (!updated.meta.changes) return runningError(c);
      notifyLater(c, "ai");
    }
    return c.json({ ok: true as const }, 200);
  })

  .delete("/ai/drafts/:id", validate("param", idParam), async (c) => {
    const userId = c.get("user").id;
    const { id } = c.req.valid("param");
    const deleted = await c.env.DB.prepare("DELETE FROM ai_drafts WHERE id = ? AND user_id = ?").bind(id, userId).run();
    if (!deleted.meta.changes) return notFound(c);
    notifyLater(c, "ai");
    return c.json({ ok: true as const }, 200);
  })

  // Throw the cards away and make them again, maybe as another kind.
  .post("/ai/drafts/:id/regenerate", validate("param", idParam), validate("json", regenerateBody), async (c) => {
    const userId = c.get("user").id;
    const { id } = c.req.valid("param");
    const fake = fakeMode(c);
    if (fake === null) return fakeRefused(c);
    const draft = await loadDraft(c.env.DB, userId, id);
    if (!draft) return notFound(c);
    if (draft.status === "running") return runningError(c);
    if (await overCap(c)) return capError(c);
    const changes = { kind: c.req.valid("json").kind };
    if (!(await startRun(c, fake, { draftId: id, action: "regenerate" }, changes))) return runningError(c);
    notifyLater(c, "ai");
    return c.json({ ok: true as const }, 202);
  })

  // More cards from (more) pages, without repeating the draft or its target set.
  .post(
    "/ai/drafts/:id/more",
    bodyLimit({ maxSize: MAX_BODY_BYTES, onError: (c) => c.json({ error: "too_large" as const }, 413) }),
    validate("param", idParam),
    validate("json", moreBody),
    async (c) => {
      const userId = c.get("user").id;
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const fake = fakeMode(c);
      if (fake === null) return fakeRefused(c);
      const draft = await loadDraft(c.env.DB, userId, id);
      if (!draft) return notFound(c);
      if (draft.status === "running") return runningError(c);
      // A full draft cannot take more: save or drop cards first.
      if ((JSON.parse(draft.cards_json) as unknown[]).length >= MAX_DRAFT_CARDS) {
        return validationError(c, { cards: "too_big" });
      }
      if (await overCap(c)) return capError(c);
      const job = { draftId: id, action: "more" as const, pages: body.pages.map((page) => page.n) };
      if (!(await startRun(c, fake, { ...job, instructions: body.instructions }, { pages: body.pages }))) {
        return runningError(c);
      }
      notifyLater(c, "ai");
      return c.json({ ok: true as const }, 202);
    },
  )

  // Keep the checked cards: a new set, or the end of an existing one. The draft goes.
  .post("/ai/drafts/:id/save", validate("param", idParam), validate("json", saveBody), async (c) => {
    const userId = c.get("user").id;
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const db = c.env.DB;
    const draft = await loadDraft(db, userId, id);
    if (!draft) return notFound(c);
    if (draft.status === "running") return runningError(c);
    const cards = (JSON.parse(draft.cards_json) as DraftCard[]).filter((card) => card.checked);
    if (cards.length === 0) return validationError(c, { cards: "too_small" });
    if (cards.some((card) => !card.term.trim() || !card.definition.trim())) {
      return validationError(c, { cards: "invalid_value" });
    }
    // Two saves at once (a double tap, two devices) both read the draft above.
    // So every insert only happens while the draft still exists, and the draft
    // goes last in the same batch: D1 runs batches one after the other, and the
    // second one finds no draft and writes nothing.
    const draftExists = "EXISTS (SELECT 1 FROM ai_drafts WHERE id = ? AND user_id = ?)";
    const deleteDraft = db.prepare("DELETE FROM ai_drafts WHERE id = ? AND user_id = ?").bind(id, userId);

    let setId: number;
    if (body.setId === null) {
      if (!body.title) return validationError(c, { title: "too_small" });
      if (cards.length > 500) return validationError(c, { cards: "too_big" });
      const [created] = await db.batch<{ id: number }>([
        db
          .prepare(
            `INSERT INTO sets (user_id, title, term_lang, def_lang) SELECT ?, ?, ?, ? WHERE ${draftExists} RETURNING id`,
          )
          .bind(userId, body.title, body.termLang, body.defLang, id, userId),
        ...cards.map((card, position) =>
          db
            .prepare(
              `INSERT INTO terms (user_id, set_id, term, definition, position)
               SELECT ?, (SELECT MAX(id) FROM sets WHERE user_id = ?), ?, ?, ? WHERE ${draftExists}`,
            )
            .bind(userId, userId, card.term.trim(), card.definition.trim(), position, id, userId),
        ),
        deleteDraft,
      ]);
      const made = created!.results[0];
      if (!made) return notFound(c); // the other save got there first
      setId = made.id;
    } else {
      setId = body.setId;
      const row = await db
        .prepare(
          `SELECT COUNT(t.id) AS count, COALESCE(MAX(t.position), -1) AS last FROM sets s
             LEFT JOIN terms t ON t.set_id = s.id AND t.user_id = s.user_id
            WHERE s.id = ? AND s.user_id = ?`,
        )
        .bind(setId, userId)
        .first<{ count: number; last: number }>();
      if (!row || !(await ownsSet(db, userId, setId))) return validationError(c, { setId: "invalid_value" });
      // A set holds at most 500 terms, like the set form.
      if (row.count + cards.length > 500) return validationError(c, { cards: "too_big" });
      const results = await db.batch([
        ...cards.map((card, i) =>
          db
            .prepare(
              `INSERT INTO terms (user_id, set_id, term, definition, position) SELECT ?, ?, ?, ?, ? WHERE ${draftExists}`,
            )
            .bind(userId, setId, card.term.trim(), card.definition.trim(), row.last + 1 + i, id, userId),
        ),
        db.prepare("UPDATE sets SET updated_at = unixepoch() WHERE id = ? AND user_id = ?").bind(setId, userId),
        deleteDraft,
      ]);
      if (!results.at(-1)!.meta.changes) return notFound(c); // the other save got there first
    }
    notifyLater(c, "sets");
    notifyLater(c, "ai");
    return c.json({ setId }, 200);
  })

  // Settings → "AI usage": this month against the cap, all time, the last 20 runs.
  .get("/ai/usage", async (c) => {
    const user = c.get("user");
    const db = c.env.DB;
    const [total, recent] = await db.batch([
      db.prepare("SELECT COALESCE(SUM(cost_nanos), 0) AS nanos FROM ai_usage WHERE user_id = ?").bind(user.id),
      db
        .prepare(
          `SELECT created_at, action, input_tokens, cached_tokens, output_tokens, cost_nanos FROM ai_usage
            WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 20`,
        )
        .bind(user.id),
    ]);
    type UsageRow = {
      created_at: number;
      action: AiJob["action"];
      input_tokens: number;
      cached_tokens: number;
      output_tokens: number;
      cost_nanos: number;
    };
    return c.json(
      {
        monthNanos: await monthNanos(db, user.id),
        totalNanos: (total!.results[0] as { nanos: number }).nanos,
        /** null: no limit (admins). */
        capNanos: capNanos(c.env, user),
        recent: (recent!.results as UsageRow[]).map((row) => ({
          createdAt: row.created_at,
          action: row.action,
          inputTokens: row.input_tokens,
          cachedTokens: row.cached_tokens,
          outputTokens: row.output_tokens,
          costNanos: row.cost_nanos,
        })),
      },
      200,
    );
  });
