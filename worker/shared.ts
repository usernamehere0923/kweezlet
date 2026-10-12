// Constants and tiny helpers both the worker and the UI need. No imports
// here: the UI bundles this file, and anything it imports would land in the
// browser too.

/** Correct answers in a row that learn a term ("know it"). */
export const MASTERY = 2;

/**
 * Spaced repetition: days until a term comes back for review, by correct
 * answers in a row (term_stats.streak). One table for both sides: the SQL in
 * dueSql() and intervalSql() is built from it, the tests check both against it.
 */
export const INTERVAL_DAYS = [1, 2, 4, 7, 14, 30];

/** Days until a term with this many correct answers in a row is due again. */
export function intervalDays(streak: number): number {
  return INTERVAL_DAYS[Math.min(Math.max(Math.floor(streak), 0), INTERVAL_DAYS.length - 1)] ?? 30;
}

/**
 * True when a term last seen at `lastSeenAt` (epoch seconds, null = never
 * answered) is due again at `now`. Mirrors dueSql() for the tests.
 */
export function isDue(lastSeenAt: number | null, streak: number, now: number): boolean {
  return lastSeenAt === null || now >= lastSeenAt + intervalDays(streak) * 86_400;
}

/** SQL: the days a term in `${stats}.streak` waits before it is due again. */
export function intervalSql(streakColumn: string): string {
  const cases = INTERVAL_DAYS.map((days, streak) => `WHEN ${streak} THEN ${days}`).join(" ");
  return `CASE ${streakColumn} ${cases} ELSE ${INTERVAL_DAYS[INTERVAL_DAYS.length - 1]} END`;
}

/** SQL: 1 when the term's stats row (alias `stats`) says it is due now, else 0. */
export function dueSql(stats = "st"): string {
  return `(${stats}.term_id IS NULL OR ${stats}.last_seen_at + ${intervalSql(`${stats}.streak`)} * 86400 <= unixepoch())`;
}

/** Languages a set's terms / definitions can be in. `null` = not set. */
export const LANGUAGES = ["en", "de", "fr", "it", "es"] as const;
export type Language = (typeof LANGUAGES)[number];
