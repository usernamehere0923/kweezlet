import { z } from "zod";
import { LOCALES, type Locale } from "./languages";

export const localeSchema = z.enum(LOCALES);

/** Account levels (migrations/0007_user_level.sql). The first account is admin, the rest standard. */
export const LEVELS = ["admin", "pro", "standard"] as const;
type Level = (typeof LEVELS)[number];

/** The logged-in user, available in every protected route as c.get("user"). */
export type User = { id: number; username: string; locale: Locale; level: Level };

/** What the UI gets about the user (login answer and /api/me): one shape for both. */
export type PublicUser = Omit<User, "id">;
export function publicUser({ username, locale, level }: User): PublicUser {
  return { username, locale, level };
}

export type AppEnv = {
  Bindings: Env;
  Variables: { user: User; sessionTokenHash: string };
};
