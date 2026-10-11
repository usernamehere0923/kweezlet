import { Hono } from "hono";
import { z } from "zod";
import { notify } from "./live";
import type { AppEnv } from "./types";
import { validate } from "./validate";

/** How a term can be marked. No row yet = "unseen" (see worker/sets.ts). */
export const STATUSES = ["still_learning", "know_it"] as const;
export type Status = (typeof STATUSES)[number];

const idParam = z.object({ id: z.coerce.number().int().positive() });
const stateBody = z.object({
  status: z.enum(STATUSES).nullish(),
  starred: z.boolean().nullish(),
});
const answerBody = z.object({ correct: z.boolean() });
/**
 * A local day, YYYY-MM-DD. The client computes it in the user's timezone.
 * Not just the shape: 2026-02-31 would poison the streak (see streakOf).
 */
const dayBody = z.object({
  day: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((day) => {
      const time = new Date(`${day}T00:00:00Z`).getTime();
      return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === day;
    }),
});

function previousDay(day: string): string {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10);
}

/** Days in a row, counting back from `today` (which must be in the list). */
function streakOf(days: string[], today: string): number {
  let count = 0;
  let expected = today;
  for (const day of days) {
    if (day !== expected) break;
    count += 1;
    expected = previousDay(expected);
  }
  return count;
}

export const studyRoutes = new Hono<AppEnv>()
  // Mark a term "still learning" / "know it" and/or star it. Both are kept
  // when only one is sent, so starring never undoes a mark.
  .patch("/terms/:id/state", validate("param", idParam), validate("json", stateBody), async (c) => {
    const user = c.get("user");
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const db = c.env.DB;
    const term = await db
      .prepare("SELECT set_id FROM terms WHERE id = ? AND user_id = ?")
      .bind(id, user.id)
      .first<{ set_id: number }>();
    if (!term) return c.json({ error: "not_found" as const }, 404);
    const current = await db
      .prepare("SELECT status, starred FROM term_state WHERE user_id = ? AND term_id = ?")
      .bind(user.id, id)
      .first<{ status: Status | null; starred: number }>();
    // Omitted keeps the old value, null clears it. (Two devices writing the
    // same term at the same moment can still lose one change; marking is
    // cheap to repeat, so that race is left alone.)
    const status = body.status === undefined ? (current?.status ?? null) : body.status;
    const starred = body.starred === undefined ? !!current?.starred : !!body.starred;
    await db
      .prepare(
        `INSERT INTO term_state (user_id, term_id, set_id, status, starred, updated_at) VALUES (?, ?, ?, ?, ?, unixepoch())
         ON CONFLICT (user_id, term_id) DO UPDATE SET
           status = excluded.status, starred = excluded.starred, updated_at = unixepoch()`,
      )
      .bind(user.id, id, term.set_id, status, starred ? 1 : 0)
      .run();
    await notify(c.env, user.id, "study");
    // Annotated so the status keeps its literal type for the UI's typed client.
    const result: { termId: number; status: "unseen" | Status; starred: boolean } = {
      termId: id,
      status: status ?? "unseen",
      starred,
    };
    return c.json(result, 200);
  })

  // An answer in Learn mode: counts it and moves the streak. Two correct in a
  // row learn the term ("know it"), a wrong answer drops it to "still
  // learning" — the flashcards marks follow along.
  .post("/terms/:id/answer", validate("param", idParam), validate("json", answerBody), async (c) => {
    const user = c.get("user");
    const { id } = c.req.valid("param");
    const { correct } = c.req.valid("json");
    const db = c.env.DB;
    const term = await db
      .prepare("SELECT set_id FROM terms WHERE id = ? AND user_id = ?")
      .bind(id, user.id)
      .first<{ set_id: number }>();
    if (!term) return c.json({ error: "not_found" as const }, 404);
    const stats = await db
      .prepare("SELECT correct, wrong, streak FROM term_stats WHERE user_id = ? AND term_id = ?")
      .bind(user.id, id)
      .first<{ correct: number; wrong: number; streak: number }>();
    const mark = await db
      .prepare("SELECT status FROM term_state WHERE user_id = ? AND term_id = ?")
      .bind(user.id, id)
      .first<{ status: Status | null }>();

    const next = {
      correct: (stats?.correct ?? 0) + (correct ? 1 : 0),
      wrong: (stats?.wrong ?? 0) + (correct ? 0 : 1),
      streak: correct ? (stats?.streak ?? 0) + 1 : 0,
    };
    // One correct answer leaves the user's own mark alone.
    const status: Status | null = !correct ? "still_learning" : next.streak >= 2 ? "know_it" : (mark?.status ?? null);
    const statements = [
      db
        .prepare(
          `INSERT INTO term_stats (user_id, term_id, set_id, correct, wrong, streak, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, unixepoch())
           ON CONFLICT (user_id, term_id) DO UPDATE SET
             correct = excluded.correct, wrong = excluded.wrong, streak = excluded.streak, last_seen_at = unixepoch()`,
        )
        .bind(user.id, id, term.set_id, next.correct, next.wrong, next.streak),
    ];
    if (status !== (mark?.status ?? null)) {
      statements.push(
        db
          .prepare(
            `INSERT INTO term_state (user_id, term_id, set_id, status, starred, updated_at) VALUES (?, ?, ?, ?, 0, unixepoch())
             ON CONFLICT (user_id, term_id) DO UPDATE SET status = excluded.status, updated_at = unixepoch()`,
          )
          .bind(user.id, id, term.set_id, status),
      );
    }
    await db.batch(statements);
    await notify(c.env, user.id, "study");
    const result: { termId: number; correct: number; wrong: number; streak: number; status: "unseen" | Status } = {
      termId: id,
      ...next,
      status: status ?? "unseen",
    };
    return c.json(result, 200);
  })

  // "I studied today": remember the day and answer the new streak length.
  .post("/study/day", validate("json", dayBody), async (c) => {
    const user = c.get("user");
    const { day } = c.req.valid("json");
    const db = c.env.DB;
    await db
      .prepare("INSERT INTO study_days (user_id, day) VALUES (?, ?) ON CONFLICT DO NOTHING")
      .bind(user.id, day)
      .run();
    const { results } = await db
      .prepare("SELECT day FROM study_days WHERE user_id = ? ORDER BY day DESC")
      .bind(user.id)
      .all<{ day: string }>();
    return c.json(
      {
        streak: streakOf(
          results.map((row) => row.day),
          day,
        ),
      },
      200,
    );
  });
