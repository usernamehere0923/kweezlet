import { z } from "zod";

export const LOCALES = ["en", "de-CH"] as const;
export const localeSchema = z.enum(LOCALES);
export type Locale = z.infer<typeof localeSchema>;

/** The logged-in user, available in every protected route as c.get("user"). */
export type User = { id: number; username: string; locale: Locale };

export type AppEnv = {
  Bindings: Env;
  Variables: { user: User; sessionTokenHash: string };
};
