// No imports here: the UI bundles this file, and anything it imported would
// land in the browser too.

/**
 * The themes a user can pick in Settings, saved per account (users.theme).
 * Each one is a file src/themes/<id>.css with every --theme-* token, and a
 * name `theme.<id>` in both i18n files. How to add one: src/themes/index.css.
 */
export const THEMES = ["cardigan", "midnight-cram", "ballpoint", "unicorn-sneeze", "kung-fu"] as const;
export type Theme = (typeof THEMES)[number];

export const DEFAULT_THEME: Theme = "cardigan";

export function isTheme(value: unknown): value is Theme {
  return (THEMES as readonly unknown[]).includes(value);
}
