import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "./types";
import { localDayString, validate } from "./validate";

/** The user's own today, YYYY-MM-DD (see localDayString in worker/validate.ts). */
const dayBody = z.object({ day: localDayString });

/** The day before, YYYY-MM-DD. */
export function previousDay(day: string): string {
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

/** The user's study days up to and including `day`, newest first. */
async function studyDaysUpTo(db: D1Database, userId: number, day: string): Promise<string[]> {
  const { results } = await db
    .prepare("SELECT day FROM study_days WHERE user_id = ? AND day <= ? ORDER BY day DESC")
    .bind(userId, day)
    .all<{ day: string }>();
  return results.map((row) => row.day);
}

/**
 * The streak as the UI shows it: before studying today the run up to yesterday
 * still counts — it only breaks when a day ends without study.
 */
export async function streakThrough(
  db: D1Database,
  userId: number,
  day: string,
): Promise<{ streak: number; studiedToday: boolean }> {
  const days = await studyDaysUpTo(db, userId, day);
  const studiedToday = days[0] === day;
  return { streak: streakOf(days, studiedToday ? day : previousDay(day)), studiedToday };
}

export const streakRoutes = new Hono<AppEnv>()
  // The streak for Home, before studying. Today not studied yet still shows
  // the run up to yesterday: it only breaks when today ends without study.
  .get("/study/streak", validate("query", dayBody), async (c) => {
    const { day } = c.req.valid("query");
    return c.json(await streakThrough(c.env.DB, c.get("user").id, day), 200);
  })

  // "I studied today": remember the day and answer the new streak length.
  // Days after it (another device already past midnight) don't count.
  .post("/study/day", validate("json", dayBody), async (c) => {
    const user = c.get("user");
    const { day } = c.req.valid("json");
    const db = c.env.DB;
    // No notifyLater here: it would reload the study page that sent this in
    // the middle of the first flip. The mark or answer that follows notifies.
    await db
      .prepare("INSERT INTO study_days (user_id, day) VALUES (?, ?) ON CONFLICT DO NOTHING")
      .bind(user.id, day)
      .run();
    return c.json({ streak: streakOf(await studyDaysUpTo(db, user.id, day), day) }, 200);
  });
