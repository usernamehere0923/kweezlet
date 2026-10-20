import { Hono } from "hono";
import { z } from "zod";
import type { Language } from "./languages";
import type { AppEnv } from "./types";
import { validate } from "./validate";

const reviewQuery = z.object({ limit: z.coerce.number().int().positive().max(100).optional() });

/** One card in the review queue: a due term, and the set it lives in. */
export type ReviewCard = {
  id: number;
  term: string;
  definition: string;
  /** Correct answers in a row (worker/study.ts). */
  streak: number;
  setId: number;
  setTitle: string;
  /** The set's languages, so the card can be spoken (worker/languages.ts). */
  termLang: Language | null;
  defLang: Language | null;
};

export type ReviewOverview = {
  /** Due terms across all sets, longest overdue first, at most `limit` of them. */
  cards: ReviewCard[];
  /** How many terms are due altogether, before the cap. */
  dueCount: number;
};

export const reviewRoutes = new Hono<AppEnv>()
  // What to review right now: every term whose interval has elapsed, across
  // all sets. Terms never answered are not in it: new terms are for Learn.
  // This only reads the schedule; answering goes through
  // POST /api/terms/:id/answer, which moves term_stats.due_at.
  .get("/review", validate("query", reviewQuery), async (c) => {
    const user = c.get("user");
    const limit = c.req.valid("query").limit ?? 20;
    // COUNT(*) OVER () sees the whole result before LIMIT caps the rows.
    const { results } = await c.env.DB.prepare(
      `SELECT t.id, t.term, t.definition, st.streak,
              t.set_id AS setId, s.title AS setTitle, s.term_lang AS termLang, s.def_lang AS defLang,
              COUNT(*) OVER () AS dueCount
         FROM terms t
         JOIN sets s ON s.id = t.set_id AND s.user_id = t.user_id
         JOIN term_stats st ON st.term_id = t.id AND st.user_id = t.user_id
        WHERE t.user_id = ? AND st.due_at <= unixepoch()
        ORDER BY st.due_at ASC, t.id ASC
        LIMIT ?`,
    )
      .bind(user.id, limit)
      .all<ReviewCard & { dueCount: number }>();
    const overview: ReviewOverview = {
      cards: results.map(({ dueCount: _dueCount, ...card }) => card),
      dueCount: results[0]?.dueCount ?? 0,
    };
    return c.json(overview, 200);
  });
