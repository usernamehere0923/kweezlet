import { Hono } from "hono";
import { z } from "zod";
import { constantTimeEqual, hashPassword, randomHex } from "./crypto";
import { exportUserData } from "./export";
import { notify } from "./live";
import { localeSchema, type AppEnv } from "./types";
import { validate } from "./validate";

export const accountRoutes = new Hono<AppEnv>()
  .get("/", (c) => {
    const { username, locale } = c.get("user");
    return c.json({ username, locale }, 200);
  })

  .patch("/settings", validate("json", z.object({ locale: localeSchema })), async (c) => {
    const user = c.get("user");
    const { locale } = c.req.valid("json");
    await c.env.DB.prepare("UPDATE users SET locale = ? WHERE id = ?").bind(locale, user.id).run();
    await notify(c.env, user.id, "settings");
    return c.json({ locale }, 200);
  })

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
        return c.json({ error: "validation" as const, fields: { current: "wrong_password" } }, 400);
      }
      const salt = randomHex(16);
      await db.batch([
        db
          .prepare("UPDATE users SET password_hash = ?, salt = ? WHERE id = ?")
          .bind(await hashPassword(next, salt), salt, user.id),
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
