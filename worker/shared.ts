// Constants and tiny helpers both the worker and the UI need. No imports
// here: the UI bundles this file, and anything it imports would land in the
// browser too.

/** Correct answers in a row that learn a term ("know it"). */
export const MASTERY = 2;

/** Where a term stands, the same on every screen. */
export type TermProgress = "new" | "learning" | "known";

/**
 * Known = marked "know it". Learning = marked "still learning", or not marked
 * yet but answered right at least once. Everything else is new. GET /sets
 * counts the same way in SQL (worker/sets.ts).
 */
export function termProgress(term: { status: string | null; streak: number }): TermProgress {
  if (term.status === "know_it") return "known";
  if (term.status === "still_learning" || term.streak > 0) return "learning";
  return "new";
}

/**
 * Spaced repetition: days until a term comes back, by review step
 * (term_stats.review_step). The step only moves when a due term is answered
 * (worker/study.ts), so answering early or cramming in Learn changes nothing.
 * One table for both sides: intervalSql() is built from it.
 */
export const INTERVAL_DAYS = [1, 2, 4, 7, 14, 30];

/** Days until a term on this review step comes back. */
export function intervalDays(step: number): number {
  return INTERVAL_DAYS[Math.min(Math.max(Math.floor(step), 0), INTERVAL_DAYS.length - 1)] ?? 30;
}

/** SQL: the days a term on the review step in `stepColumn` waits. Same as intervalDays(). */
export function intervalSql(stepColumn: string): string {
  const cases = INTERVAL_DAYS.map((days, step) => `WHEN ${stepColumn} <= ${step} THEN ${days}`).join(" ");
  return `CASE ${cases} ELSE ${INTERVAL_DAYS[INTERVAL_DAYS.length - 1]} END`;
}

/** Languages a set's terms / definitions can be in. `null` = not set. */
export const LANGUAGES = ["en", "de", "fr", "it", "es"] as const;
export type Language = (typeof LANGUAGES)[number];
