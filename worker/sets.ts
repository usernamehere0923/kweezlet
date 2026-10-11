import { Hono } from "hono";
import { z } from "zod";
import { notify } from "./live";
import type { AppEnv } from "./types";
import { validate } from "./validate";

/** Languages a set's terms / definitions can be in. `null` = not set. */
export const LANGUAGES = ["en", "de", "fr", "it", "es"] as const;
export const languageSchema = z.enum(LANGUAGES);

const idParam = z.object({ id: z.coerce.number().int().positive() });
const searchQuery = z.object({ q: z.string().trim().max(200).optional() });
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
  terms: z.array(termShape).min(1).max(500),
});

type SetRow = {
  id: number;
  title: string;
  description: string;
  term_lang: string | null;
  def_lang: string | null;
  created_at: number;
  updated_at: number;
};
type TermRow = { id: number; term: string; definition: string; position: number };

function toSetJson(row: SetRow & { term_count?: number }) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    termLang: row.term_lang,
    defLang: row.def_lang,
    termCount: row.term_count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Turns a search word into a LIKE pattern that treats % _ \ as plain text. */
function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
}

const SET_COLUMNS = "id, title, description, term_lang, def_lang, created_at, updated_at";

/** The set with all its terms, or null when it is not the user's. */
async function loadSetDetail(db: D1Database, userId: number, id: number) {
  const set = await db
    .prepare(`SELECT ${SET_COLUMNS} FROM sets WHERE id = ? AND user_id = ?`)
    .bind(id, userId)
    .first<SetRow>();
  if (!set) return null;
  const { results: terms } = await db
    .prepare("SELECT id, term, definition, position FROM terms WHERE set_id = ? AND user_id = ? ORDER BY position")
    .bind(id, userId)
    .all<TermRow>();
  return { ...toSetJson({ ...set, term_count: terms.length }), terms };
}

/**
 * Makes the stored terms exactly the given list: new ones are inserted, given
 * ids are updated (their id survives, so study progress sticks to the term),
 * ids that disappear are deleted. Returns false when a given id is not one of
 * this user's terms in this set.
 */
async function replaceTerms(
  db: D1Database,
  userId: number,
  setId: number,
  terms: z.infer<typeof termShape>[],
): Promise<boolean> {
  const { results: existing } = await db
    .prepare("SELECT id FROM terms WHERE set_id = ? AND user_id = ?")
    .bind(setId, userId)
    .all<{ id: number }>();
  const known = new Set(existing.map((row) => row.id));
  if (terms.some((t) => t.id !== undefined && !known.has(t.id))) return false;

  const keep = new Set(terms.flatMap((t) => (t.id === undefined ? [] : [t.id])));
  const statements: D1PreparedStatement[] = existing
    .filter((row) => !keep.has(row.id))
    .map((row) => db.prepare("DELETE FROM terms WHERE id = ? AND user_id = ?").bind(row.id, userId));
  terms.forEach((t, position) => {
    statements.push(
      t.id === undefined
        ? db
            .prepare("INSERT INTO terms (user_id, set_id, term, definition, position) VALUES (?, ?, ?, ?, ?)")
            .bind(userId, setId, t.term, t.definition, position)
        : db
            .prepare(
              "UPDATE terms SET term = ?, definition = ?, position = ? WHERE id = ? AND set_id = ? AND user_id = ?",
            )
            .bind(t.term, t.definition, position, t.id, setId, userId),
    );
  });
  await db.batch(statements);
  return true;
}

export const setRoutes = new Hono<AppEnv>()
  // All my sets, newest change first. q searches titles, descriptions and terms.
  .get("/sets", validate("query", searchQuery), async (c) => {
    const user = c.get("user");
    const q = c.req.valid("query").q ?? "";
    const like = likePattern(q);
    const { results } = await c.env.DB.prepare(
      `SELECT s.id, s.title, s.description, s.term_lang, s.def_lang, s.created_at, s.updated_at,
              (SELECT COUNT(*) FROM terms t WHERE t.set_id = s.id) AS term_count
         FROM sets s
        WHERE s.user_id = ?
          AND (s.title LIKE ? ESCAPE '\\' OR s.description LIKE ? ESCAPE '\\'
               OR EXISTS (SELECT 1 FROM terms t WHERE t.set_id = s.id
                            AND (t.term LIKE ? ESCAPE '\\' OR t.definition LIKE ? ESCAPE '\\')))
        ORDER BY s.updated_at DESC, s.id DESC`,
    )
      .bind(user.id, like, like, like, like)
      .all<SetRow & { term_count: number }>();
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
    const created = await db
      .prepare(
        "INSERT INTO sets (user_id, title, description, term_lang, def_lang) VALUES (?, ?, ?, ?, ?) RETURNING id",
      )
      .bind(user.id, body.title, body.description ?? "", body.termLang ?? null, body.defLang ?? null)
      .first<{ id: number }>();
    await replaceTerms(db, user.id, created!.id, body.terms);
    await notify(c.env, user.id, "sets");
    return c.json(await loadSetDetail(db, user.id, created!.id), 201);
  })

  // Replace a set's data. Terms with an id are updated in place.
  .patch("/sets/:id", validate("param", idParam), validate("json", setBody), async (c) => {
    const user = c.get("user");
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const db = c.env.DB;
    const updated = await db
      .prepare(
        "UPDATE sets SET title = ?, description = ?, term_lang = ?, def_lang = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?",
      )
      .bind(body.title, body.description ?? "", body.termLang ?? null, body.defLang ?? null, id, user.id)
      .run();
    if (!updated.meta.changes) return c.json({ error: "not_found" as const }, 404);
    if (!(await replaceTerms(db, user.id, id, body.terms))) {
      return c.json({ error: "validation" as const, fields: { terms: "invalid_value" } }, 400);
    }
    await notify(c.env, user.id, "sets");
    return c.json(await loadSetDetail(db, user.id, id), 200);
  })

  // Delete a set; its terms go with it.
  .delete("/sets/:id", validate("param", idParam), async (c) => {
    const user = c.get("user");
    const { id } = c.req.valid("param");
    const deleted = await c.env.DB.prepare("DELETE FROM sets WHERE id = ? AND user_id = ?").bind(id, user.id).run();
    if (!deleted.meta.changes) return c.json({ error: "not_found" as const }, 404);
    await notify(c.env, user.id, "sets");
    return c.json({ ok: true as const }, 200);
  });
