import { z } from "zod";
import { LOCALES, type Locale } from "./languages";
import { DEFAULT_THEME, isTheme, THEMES, type Theme } from "./themes";

export const localeSchema = z.enum(LOCALES);
export const themeSchema = z.enum(THEMES);

/** Account levels (migrations/0007_user_level.sql). The first account is admin, the rest standard. */
export const LEVELS = ["admin", "pro", "standard"] as const;
type Level = (typeof LEVELS)[number];

/** The logged-in user, available in every protected route as c.get("user"). */
export type User = {
  id: number;
  username: string;
  locale: Locale;
  level: Level;
  /** As stored: may name a theme that no longer exists. publicUser() fixes that. */
  theme: string;
};

/** What the UI gets about the user (login answer and /api/me): one shape for both. */
export type PublicUser = Omit<User, "id" | "theme"> & { theme: Theme };
export function publicUser({ username, locale, level, theme }: User): PublicUser {
  return { username, locale, level, theme: isTheme(theme) ? theme : DEFAULT_THEME };
}

export type AppEnv = {
  Bindings: Env;
  Variables: { user: User; sessionTokenHash: string };
};
