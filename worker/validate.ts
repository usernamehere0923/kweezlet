import { zValidator } from "@hono/zod-validator";
import type { Context, ValidationTargets } from "hono";
import { z, type ZodType } from "zod";

/**
 * zValidator with one error shape for the whole app:
 *   400 { error: "validation", fields: { password: "too_small" } }
 * The UI turns each code into a translated message (see i18n "validation.*").
 */
export function validate<T extends ZodType, Target extends keyof ValidationTargets>(target: Target, schema: T) {
  return zValidator(target, schema, (result, c) => {
    if (!result.success) {
      const fields: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".") || "_";
        fields[key] ??= issue.code;
      }
      return validationError(c, fields);
    }
  });
}

/** The app's 400 answer: one code per field, e.g. { terms: "invalid_value" }. */
export function validationError<Fields extends Record<string, string>>(c: Context, fields: Fields) {
  return c.json({ error: "validation" as const, fields }, 400);
}

/** The `:id` in a route path: a positive whole number. */
export const idParam = z.object({ id: z.coerce.number().int().positive() });

/**
 * A local day, YYYY-MM-DD. The client computes it in the user's timezone.
 * Not just the shape: 2026-02-31 would poison the streak (see streakOf).
 */
export const localDayString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((day) => {
    const time = new Date(`${day}T00:00:00Z`).getTime();
    return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === day;
  });
