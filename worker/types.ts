import { z } from "zod";

export const LOCALES = ["en", "de-CH"] as const;
export const localeSchema = z.enum(LOCALES);
export type Locale = z.infer<typeof localeSchema>;

/** Account levels (migrations/0007_user_level.sql). The first account is admin, the rest standard. */
export const LEVELS = ["admin", "pro", "standard"] as const;
export type Level = (typeof LEVELS)[number];

/** The logged-in user, available in every protected route as c.get("user"). */
export type User = { id: number; username: string; locale: Locale; level: Level };

export type AppEnv = {
  Bindings: Env;
  Variables: { user: User; sessionTokenHash: string };
};
