import { Hono } from "hono";
import { z } from "zod";
import { constantTimeEqual, hashPassword, newPasswordHash } from "./crypto";
import { exportUserData } from "./export";
import { notifyLater } from "./live";
import { localeSchema, publicUser, themeSchema, type AppEnv } from "./types";
import { validate, validationError } from "./validate";

export const accountRoutes = new Hono<AppEnv>()
  .get("/", (c) => {
    return c.json(publicUser(c.get("user")), 200);
  })

  // Either or both; whatever is left out stays as it is. `from` (the page's
  // clientId) rides along on the notification, so the sending tab skips its
  // own echo instead of reloading /api/me in the middle of the next change.
  .patch(
    "/settings",
    validate(
      "json",
      z.object({ locale: localeSchema.optional(), theme: themeSchema.optional(), from: z.string().max(64).optional() }),
    ),
    async (c) => {
      const user = c.get("user");
      const { locale, theme, from } = c.req.valid("json");
      const db = c.env.DB;
      const updates = [
        locale && db.prepare("UPDATE users SET locale = ? WHERE id = ?").bind(locale, user.id),
        theme && db.prepare("UPDATE users SET theme = ? WHERE id = ?").bind(theme, user.id),
      ].filter((s) => !!s);
      if (updates.length) {
        await db.batch(updates);
        notifyLater(c, "settings", { from });
      }
      return c.json({ locale, theme }, 200);
    },
  )

  .post(
    "/password",
    validate("json", z.object({ current: z.string().min(1), next: z.string().min(8).max(256) })),
    async (c) => {
      const user = c.get("user");
      const { current, next } = c.req.valid("json");
      const db = c.env.DB;
      const row = await db
        .prepare("SELECT password_hash, salt FROM users WHERE id = ?")
        .bind(user.id)
        .first<{ password_hash: string; salt: string }>();
      if (!row || !constantTimeEqual(await hashPassword(current, row.salt), row.password_hash)) {
        return validationError(c, { current: "wrong_password" });
      }
      const { salt, hash } = await newPasswordHash(next);
      await db.batch([
        db.prepare("UPDATE users SET password_hash = ?, salt = ? WHERE id = ?").bind(hash, salt, user.id),
        // Log out every other device; this one stays logged in.
        db
          .prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?")
          .bind(user.id, c.get("sessionTokenHash")),
      ]);
      return c.json({ ok: true as const }, 200);
    },
  )

  .get("/export", async (c) => {
    const user = c.get("user");
    const exportedAt = new Date().toISOString();
    const body = {
      app: "kweezlet",
      exportedAt,
      username: user.username,
      tables: await exportUserData(c.env.DB, user.id),
    };
    const filename = `kweezlet-${user.username}-${exportedAt.slice(0, 10)}.json`;
    return c.json(body, 200, { "Content-Disposition": `attachment; filename="${filename}"` });
  });
