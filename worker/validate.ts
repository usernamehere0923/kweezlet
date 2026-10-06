import { zValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import type { ZodType } from "zod";

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
      return c.json({ error: "validation" as const, fields }, 400);
    }
  });
}
