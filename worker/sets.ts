import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "./types";
import { validate } from "./validate";

/** Languages a set's terms / definitions can be in. `null` = not set. */
export const LANGUAGES = ["en", "de", "fr", "it", "es"] as const;
export const languageSchema = z.enum(LANGUAGES);

const idParam = z.object({ id: z.coerce.number().int().positive() });
const searchQuery = z.object({ q: z.string().trim().max(200).optional() });

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
    const user = c.get("user");
    const { id } = c.req.valid("param");
    const db = c.env.DB;
    const set = await db
      .prepare(`SELECT ${SET_COLUMNS} FROM sets WHERE id = ? AND user_id = ?`)
      .bind(id, user.id)
      .first<SetRow>();
    if (!set) return c.json({ error: "not_found" as const }, 404);
    const { results: terms } = await db
      .prepare("SELECT id, term, definition, position FROM terms WHERE set_id = ? AND user_id = ? ORDER BY position")
      .bind(id, user.id)
      .all<TermRow>();
    return c.json({ ...toSetJson({ ...set, term_count: terms.length }), terms }, 200);
  });
