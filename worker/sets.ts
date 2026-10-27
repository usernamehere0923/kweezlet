import { Hono } from "hono";
import { z } from "zod";
import { ownsFolder } from "./folders";
import { notifyLater } from "./live";
import { LANGUAGES, type Language } from "./languages";
import { termProgress } from "./progress";
import { allIdsOwned, ownedTermIds, termStatements } from "./setTerms";
import type { Status, TermStatus } from "./study";
import type { AppEnv } from "./types";
import { idParam, validate, validationError } from "./validate";

const languageSchema = z.enum(LANGUAGES);

/** Which side a set's questions ask for; "both" asks either way round. */
export const ANSWER_WITH = ["both", "term", "definition"] as const;
export type AnswerWith = (typeof ANSWER_WITH)[number];

const searchQuery = z.object({
  q: z.string().trim().max(200).optional(),
  /** Only the sets in this folder, or in none. */
  folder: z.union([z.literal("none"), z.coerce.number().int().positive()]).optional(),
});
const termShape = z.object({
  /** Present when the term already exists: it is updated, not re-inserted. */
  id: z.coerce.number().int().positive().optional(),
  term: z.string().trim().min(1).max(1000),
  definition: z.string().trim().min(1).max(1000),
});
const setBody = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional(),
  termLang: languageSchema.nullish(),
  defLang: languageSchema.nullish(),
  /** Left out: a new set asks both ways, an edited one keeps its choice. */
  answerWith: z.enum(ANSWER_WITH).optional(),
  /** null takes the set out of its folder; left out, an edit keeps it. */
  folderId: z.number().int().positive().nullish(),
  terms: z.array(termShape).min(1).max(500),
});

type SetRow = {
  id: number;
  title: string;
  description: string;
  term_lang: string | null;
  def_lang: string | null;
  answer_with: string;
  folder_id: number | null;
  created_at: number;
  updated_at: number;
};
type TermRow = {
  id: number;
  term: string;
  definition: string;
  position: number;
  status: Status | null;
  starred: number;
  streak: number;
};

/** The columns of SetRow, from the set row `s`. */
const SET_COLUMNS =
  "s.id, s.title, s.description, s.term_lang, s.def_lang, s.answer_with, s.folder_id, s.created_at, s.updated_at";

/** Joins a term `t` to the user's mark (ts) and answer stats (st) for it. */
const TERM_PROGRESS_JOINS = `LEFT JOIN term_state ts ON ts.term_id = t.id AND ts.user_id = t.user_id
      LEFT JOIN term_stats st ON st.term_id = t.id AND st.user_id = t.user_id`;

/**
 * Per set: how many terms are known / learning. The same rule as
 * termProgress() in worker/progress.ts, in SQL. `s` is the set row.
 */
const progressCount = (where: string) =>
  `(SELECT COUNT(*) FROM terms t
      ${TERM_PROGRESS_JOINS}
     WHERE t.set_id = s.id AND t.user_id = s.user_id AND (${where}))`;
const KNOWN_COUNT = progressCount("ts.status = 'know_it'");
const LEARNING_COUNT = progressCount("ts.status = 'still_learning' OR (ts.status IS NULL AND st.streak > 0)");

/** The columns of CountRow, for the set row `s`. */
const COUNT_COLUMNS = `(SELECT COUNT(*) FROM terms t WHERE t.set_id = s.id AND t.user_id = s.user_id) AS term_count,
       ${KNOWN_COUNT} AS known_count, ${LEARNING_COUNT} AS learning_count`;

type CountRow = { term_count: number; known_count: number; learning_count: number };

function toSetJson(row: SetRow & CountRow) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    // Written through languageSchema, so the text is a known language or null.
    termLang: row.term_lang as Language | null,
    defLang: row.def_lang as Language | null,
    // Written through the CHECK in migrations/0010_answer_with.sql.
    answerWith: row.answer_with as AnswerWith,
    folderId: row.folder_id,
    termCount: row.term_count,
    /** Terms known / learning (termProgress); the rest are new. */
    knownCount: row.known_count,
    learningCount: row.learning_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** title, description, term_lang, def_lang from a request body, in that order. */
function setFields(body: z.infer<typeof setBody>) {
  return [body.title, body.description ?? "", body.termLang ?? null, body.defLang ?? null] as const;
}

/** Turns a search word into a LIKE pattern that treats % _ \ as plain text. */
function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
}

// The JSON shapes of the routes below. The UI imports these as types.
export type SetSummary = ReturnType<typeof toSetJson>;
export type SetTerm = {
  id: number;
  term: string;
  definition: string;
  position: number;
  status: TermStatus;
  starred: boolean;
  /** Correct answers in a row in Learn mode (worker/study.ts). */
  streak: number;
};
export type SetDetail = SetSummary & {
  terms: SetTerm[];
  /** The user's best Match time for this set, in seconds (worker/match.ts). */
  bestSeconds: number | null;
};

/** The set with all its terms, or null when it is not the user's. One round trip. */
async function loadSetDetail(db: D1Database, userId: number, id: number): Promise<SetDetail | null> {
  const [setRows, termRows] = await db.batch([
    db
      .prepare(
        `SELECT ${SET_COLUMNS}, mb.seconds AS best_seconds
           FROM sets s
           LEFT JOIN match_best mb ON mb.set_id = s.id AND mb.user_id = s.user_id
          WHERE s.id = ? AND s.user_id = ?`,
      )
      .bind(id, userId),
    db
      .prepare(
        `SELECT t.id, t.term, t.definition, t.position, ts.status, COALESCE(ts.starred, 0) AS starred,
                COALESCE(st.streak, 0) AS streak
           FROM terms t
           ${TERM_PROGRESS_JOINS}
          WHERE t.set_id = ? AND t.user_id = ?
          ORDER BY t.position`,
      )
      .bind(id, userId),
  ]);
  const set = setRows!.results[0] as (SetRow & { best_seconds: number | null }) | undefined;
  if (!set) return null;
  const terms = termRows!.results as TermRow[];
  // The terms are here already: count them instead of asking SQL again.
  const counts: CountRow = { term_count: terms.length, known_count: 0, learning_count: 0 };
  for (const term of terms) {
    const progress = termProgress(term);
    if (progress === "known") counts.known_count++;
    else if (progress === "learning") counts.learning_count++;
  }
  return {
    ...toSetJson({ ...set, ...counts }),
    terms: terms.map((row) => ({ ...row, status: row.status ?? "unseen", starred: !!row.starred })),
    bestSeconds: set.best_seconds,
  };
}

export const setRoutes = new Hono<AppEnv>()
  // All my sets, newest change first. q searches titles, descriptions and terms.
  .get("/sets", validate("query", searchQuery), async (c) => {
    const user = c.get("user");
    const { q = "", folder } = c.req.valid("query");
    const like = likePattern(q);
    // Without a search word every set matches: skip the LIKE scan over all terms.
    const search = q
      ? `AND (s.title LIKE ? ESCAPE '\\' OR s.description LIKE ? ESCAPE '\\'
              OR EXISTS (SELECT 1 FROM terms t WHERE t.set_id = s.id AND t.user_id = s.user_id
                           AND (t.term LIKE ? ESCAPE '\\' OR t.definition LIKE ? ESCAPE '\\')))`
      : "";
    const inFolder = folder === undefined ? "" : folder === "none" ? "AND s.folder_id IS NULL" : "AND s.folder_id = ?";
    const { results } = await c.env.DB.prepare(
      `SELECT ${SET_COLUMNS}, ${COUNT_COLUMNS}
         FROM sets s
        WHERE s.user_id = ? ${inFolder} ${search}
        ORDER BY s.updated_at DESC, s.id DESC`,
    )
      .bind(user.id, ...(typeof folder === "number" ? [folder] : []), ...(q ? [like, like, like, like] : []))
      .all<SetRow & CountRow>();
    return c.json(results.map(toSetJson), 200);
  })

  // One set with all its terms, in order.
  .get("/sets/:id", validate("param", idParam), async (c) => {
    const { id } = c.req.valid("param");
    const detail = await loadSetDetail(c.env.DB, c.get("user").id, id);
    return detail ? c.json(detail, 200) : c.json({ error: "not_found" as const }, 404);
  })

  // Create a set with its terms.
  .post("/sets", validate("json", setBody), async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");
    const db = c.env.DB;
    // A new set's terms are new terms; it cannot adopt existing ones.
    if (body.terms.some((t) => t.id !== undefined)) {
      return validationError(c, { terms: "invalid_value" });
    }
    if (body.folderId && !(await ownsFolder(db, user.id, body.folderId))) {
      return validationError(c, { folderId: "invalid_value" });
    }
    // One batch: a failed term insert must not leave an empty set behind. Inside
    // the batch the new set is the user's highest id, so the terms find it.
    const [created] = await db.batch<{ id: number }>([
      db
        .prepare(
          // The folder through a lookup: one deleted meanwhile leaves the set in none.
          `INSERT INTO sets (user_id, title, description, term_lang, def_lang, answer_with, folder_id)
           VALUES (?, ?, ?, ?, ?, ?, (SELECT id FROM folders WHERE id = ? AND user_id = ?)) RETURNING id`,
        )
        .bind(user.id, ...setFields(body), body.answerWith ?? "both", body.folderId ?? null, user.id),
      ...body.terms.map((t, position) =>
        db
          .prepare(
            `INSERT INTO terms (user_id, set_id, term, definition, position)
             VALUES (?, (SELECT MAX(id) FROM sets WHERE user_id = ?), ?, ?, ?)`,
          )
          .bind(user.id, user.id, t.term, t.definition, position),
      ),
    ]);
    const setId = created!.results[0]!.id;
    notifyLater(c, "sets");
    // The set was just written, so the reload cannot miss it.
    return c.json((await loadSetDetail(db, user.id, setId))!, 201);
  })

  // Replace a set's data. Terms with an id are updated in place.
  .patch("/sets/:id", validate("param", idParam), validate("json", setBody), async (c) => {
    const user = c.get("user");
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const db = c.env.DB;
    const ownedIds = await ownedTermIds(db, user.id, id);
    if (!ownedIds) return c.json({ error: "not_found" as const }, 404);
    if (!allIdsOwned(body.terms, ownedIds)) {
      return validationError(c, { terms: "invalid_value" });
    }
    if (body.folderId && !(await ownsFolder(db, user.id, body.folderId))) {
      return validationError(c, { folderId: "invalid_value" });
    }
    // One batch: the set and its terms change together or not at all.
    await db.batch([
      db
        .prepare(
          `UPDATE sets SET title = ?, description = ?, term_lang = ?, def_lang = ?,
                answer_with = COALESCE(?, answer_with),
                folder_id = IIF(?, (SELECT id FROM folders WHERE id = ? AND user_id = ?), folder_id),
                updated_at = unixepoch()
            WHERE id = ? AND user_id = ?`,
        )
        .bind(
          ...setFields(body),
          body.answerWith ?? null,
          body.folderId === undefined ? 0 : 1,
          body.folderId ?? null,
          user.id,
          id,
          user.id,
        ),
      ...termStatements(db, user.id, id, body.terms, ownedIds),
    ]);
    notifyLater(c, "sets");
    // The set exists (checked above), so the reload cannot miss it.
    return c.json((await loadSetDetail(db, user.id, id))!, 200);
  })

  // Delete a set; its terms go with it.
  .delete("/sets/:id", validate("param", idParam), async (c) => {
    const user = c.get("user");
    const { id } = c.req.valid("param");
    const deleted = await c.env.DB.prepare("DELETE FROM sets WHERE id = ? AND user_id = ?").bind(id, user.id).run();
    if (!deleted.meta.changes) return c.json({ error: "not_found" as const }, 404);
    notifyLater(c, "sets");
    return c.json({ ok: true as const }, 200);
  });
