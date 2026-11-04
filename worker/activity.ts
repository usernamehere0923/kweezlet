import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "./types";
import { localDayString, validate } from "./validate";

/** The study modes a session can belong to (set_activity.last_mode). */
export const STUDY_MODES = ["flashcards", "learn", "test", "match", "review"] as const;
export type StudyMode = (typeof STUDY_MODES)[number];

/**
 * One flush of a study session (src/lib/studyTime.ts): how long the user was
 * actively studying and, for the modes that send no per-answer requests
 * (flashcards, test, match), how many cards went by. Learn and Review count
 * their answers server-side in worker/study.ts and send only time here.
 * Counters are client-measured on purpose: study time can only be known by
 * the device, and the counts are statistics, not billing.
 */
const activityBody = z.object({
  day: localDayString,
  seconds: z.number().int().min(0).max(3600).optional(),
  cards: z.number().int().min(0).max(10_000).optional(),
  correct: z.number().int().min(0).max(10_000).optional(),
  wrong: z.number().int().min(0).max(10_000).optional(),
  learned: z.number().int().min(0).max(10_000).optional(),
  /** The set that was studied, with its mode: "recently used" / "quick resume". */
  setId: z.number().int().positive().optional(),
  mode: z.enum(STUDY_MODES).optional(),
});

export const activityRoutes = new Hono<AppEnv>().post("/study/activity", validate("json", activityBody), async (c) => {
  const user = c.get("user");
  const { day, seconds = 0, cards = 0, correct = 0, wrong = 0, learned = 0, setId, mode } = c.req.valid("json");
  const db = c.env.DB;
  const statements = [
    // Only provided counters move: one flush adds what happened since the last.
    db
      .prepare(
        `INSERT INTO day_stats (user_id, day, cards, correct, wrong, learned, seconds) VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (user_id, day) DO UPDATE SET
             cards = cards + excluded.cards, correct = correct + excluded.correct, wrong = wrong + excluded.wrong,
             learned = learned + excluded.learned, seconds = seconds + excluded.seconds`,
      )
      .bind(user.id, day, cards, correct, wrong, learned, seconds),
  ];
  if (seconds + cards + correct + wrong + learned > 0) {
    // Real activity is a study day too: the streak survives even when the
    // day request of useStudyDay fails (both write the same table).
    statements.push(
      db.prepare("INSERT INTO study_days (user_id, day) VALUES (?, ?) ON CONFLICT DO NOTHING").bind(user.id, day),
    );
  }
  if (setId !== undefined && mode !== undefined) {
    // The set must be the user's own (like every write on user data); a set
    // that is gone or someone else's records nothing.
    statements.push(
      db
        .prepare(
          `INSERT INTO set_activity (user_id, set_id, last_studied_at, last_mode)
               SELECT ?2, id, unixepoch(), ?3 FROM sets WHERE id = ?1 AND user_id = ?2
               ON CONFLICT (user_id, set_id) DO UPDATE SET last_studied_at = unixepoch(), last_mode = excluded.last_mode`,
        )
        .bind(setId, user.id, mode),
    );
  }
  await db.batch(statements);
  return c.json({ ok: true }, 200);
});
