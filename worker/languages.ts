// No imports here: the UI bundles this file, and anything it imported would
// land in the browser too.

/** Languages the app itself can be shown in (Settings). */
export const LOCALES = ["en", "de-CH"] as const;
export type Locale = (typeof LOCALES)[number];

/** Languages a set's terms / definitions can be in. `null` = not set. */
export const LANGUAGES = ["en", "de", "fr", "it", "es"] as const;
export type Language = (typeof LANGUAGES)[number];
