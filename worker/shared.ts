// Constants both the worker and the UI need. No imports here: the UI bundles
// this file, and anything it imports would land in the browser too.

/** Correct answers in a row that learn a term ("know it"). */
export const MASTERY = 2;

/** Languages a set's terms / definitions can be in. `null` = not set. */
export const LANGUAGES = ["en", "de", "fr", "it", "es"] as const;
export type Language = (typeof LANGUAGES)[number];
