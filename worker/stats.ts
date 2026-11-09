import { Hono } from "hono";
import { z } from "zod";
import type { StudyMode } from "./activity";
import { COUNT_COLUMNS, SET_COLUMNS, toSetJson, type CountRow, type SetRow, type SetSummary } from "./sets";
import { previousDay, streakThrough } from "./streak";
import type { AppEnv } from "./types";
import { localDayString, validate } from "./validate";

/** One day of the series: what happened that day. A quiet day is all zeros. */
export type DayStats = {
  day: string;
  cards: number;
  correct: number;
  wrong: number;
  learned: number;
  seconds: number;
};

/** The dashboard's numbers and series (the Statistics page). */
export type Stats = {
  sets: number;
  cards: number;
  /** The share of cards known ("know it"), 0..1. */
  learningRate: number;
  streak: number;
  learnedToday: number;
  totalSeconds: number;
  /** Cards learned before the window starts: the series starts counting from there. */
  learnedBefore: number;
  /** One entry per local day, oldest first, gaps filled with zeros. */
  days: DayStats[];
};

/** A set with the moment and mode it was last studied in ("quick resume"). */
export type RecentSet = SetSummary & { lastStudiedAt: number; mode: StudyMode };
export type RecentStats = {
  /** Newest first: the first one is what "quick resume" continues. */
  studied: RecentSet[];
};

const statsQuery = z.object({
  /** The client's today: the window ends here (see localDayString). */
  day: localDayString,
  /** How many days the series covers, today included. */
  days: z.coerce.number().int().min(1).max(400).optional(),
});

const SUMMARY_SELECT = `SELECT
    (SELECT COUNT(*) FROM sets WHERE user_id = ?1) AS sets,
    (SELECT COUNT(*) FROM terms WHERE user_id = ?1) AS cards,
    (SELECT COUNT(*) FROM term_state WHERE user_id = ?1 AND status = 'know_it') AS known,
    (SELECT COALESCE(SUM(seconds), 0) FROM day_stats WHERE user_id = ?1) AS seconds,
    COALESCE((SELECT learned FROM day_stats WHERE user_id = ?1 AND day = ?2), 0) AS learned_today,
    (SELECT COALESCE(SUM(learned), 0) FROM day_stats WHERE user_id = ?1 AND day < ?3) AS learned_before`;

type SummaryRow = {
  sets: number;
  cards: number;
  known: number;
  seconds: number;
  learned_today: number;
  learned_before: number;
};

export const statsRoutes = new Hono<AppEnv>()
  // The numbers and the per-day series behind the Statistics page. Every
  // value is scoped to the user; a day without data comes back as zeros so
  // the graphs can draw their gaps.
  .get("/stats", validate("query", statsQuery), async (c) => {
    const user = c.get("user");
    const { day, days = 90 } = c.req.valid("query");
    const db = c.env.DB;
    // The window: `days` local days ending on `day`, oldest first.
    const window: string[] = [];
    for (let cursor = day, i = 0; i < days; i++, cursor = previousDay(cursor)) window.push(cursor);
    window.reverse();
    const start = window[0]!;
    const [summaryResult, activityResult, streak] = await Promise.all([
      db.prepare(SUMMARY_SELECT).bind(user.id, day, start).first<SummaryRow>(),
      db
        .prepare(
          "SELECT day, cards, correct, wrong, learned, seconds FROM day_stats WHERE user_id = ? AND day >= ? AND day <= ?",
        )
        .bind(user.id, start, day)
        .all<DayStats>(),
      streakThrough(db, user.id, day),
    ]);
    const summary = summaryResult!;
    // Gaps in the series are days without data: zeros keep the days lined up.
    const byDay = new Map(activityResult.results.map((row) => [row.day, row]));
    const series = window.map((date) => {
      const row = byDay.get(date);
      return {
        day: date,
        cards: row?.cards ?? 0,
        correct: row?.correct ?? 0,
        wrong: row?.wrong ?? 0,
        learned: row?.learned ?? 0,
        seconds: row?.seconds ?? 0,
      };
    });
    const stats: Stats = {
      sets: summary.sets,
      cards: summary.cards,
      learningRate: summary.cards ? summary.known / summary.cards : 0,
      streak: streak.streak,
      learnedToday: summary.learned_today,
      totalSeconds: summary.seconds,
      learnedBefore: summary.learned_before,
      days: series,
    };
    return c.json(stats, 200);
  })

  // The set "quick resume" continues on Home: the last studied one, with the
  // moment and mode it was last studied in.
  .get("/stats/recent", async (c) => {
    const user = c.get("user");
    type StudiedRow = SetRow & CountRow & { last_studied_at: number; last_mode: StudyMode };
    const { results } = await c.env.DB.prepare(
      `SELECT ${SET_COLUMNS}, ${COUNT_COLUMNS}, a.last_studied_at, a.last_mode
         FROM sets s
         JOIN set_activity a ON a.set_id = s.id AND a.user_id = s.user_id
        WHERE s.user_id = ?
        ORDER BY a.last_studied_at DESC, s.id DESC
        LIMIT 8`,
    )
      .bind(user.id)
      .all<StudiedRow>();
    const recent: RecentStats = {
      studied: results.map((row) => ({
        ...toSetJson(row),
        lastStudiedAt: row.last_studied_at,
        mode: row.last_mode,
      })),
    };
    return c.json(recent, 200);
  });
