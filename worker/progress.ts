// No imports here: the UI bundles this file, and anything it imported would
// land in the browser too.

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
