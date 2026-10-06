import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { z } from "zod";
import { constantTimeEqual, hashPassword, randomHex, sha256Hex } from "./crypto";
import type { AppEnv, Locale } from "./types";
import { validate } from "./validate";

const COOKIE = "kz_session";
const SESSION_DAYS = 30;
const MAX_FAILURES = 5;
const LOCKOUT_SECONDS = 15 * 60;

/** Routes under /api that work without being logged in. Everything else needs a session. */
const PUBLIC_PATHS = new Set(["/api/login"]);

const now = () => Math.floor(Date.now() / 1000);

/** Guards all of /api/*. Sets c.get("user") or answers 401. */
export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  if (PUBLIC_PATHS.has(c.req.path)) return next();
  const token = getCookie(c, COOKIE);
  if (!token) return c.json({ error: "unauthorized" as const }, 401);
  const tokenHash = await sha256Hex(token);
  const row = await c.env.DB.prepare(
    `SELECT u.id, u.username, u.locale FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
  )
    .bind(tokenHash, now())
    .first<{ id: number; username: string; locale: Locale }>();
  if (!row) return c.json({ error: "unauthorized" as const }, 401);
  c.set("user", row);
  c.set("sessionTokenHash", tokenHash);
  await next();
});

export async function createSession(db: D1Database, userId: number): Promise<string> {
  const token = randomHex(32);
  await db
    .prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(await sha256Hex(token), userId, now() + SESSION_DAYS * 86400)
    .run();
  return token;
}

// Runs for unknown usernames too, so a wrong username takes as long as a wrong password.
const DUMMY_SALT = "0".repeat(32);

const loginSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(256),
});

export const authRoutes = new Hono<AppEnv>()
  .post("/login", validate("json", loginSchema), async (c) => {
    const { username, password } = c.req.valid("json");
    const db = c.env.DB;
    const ip = c.req.header("CF-Connecting-IP") ?? "local";

    const recent = await db
      .prepare("SELECT COUNT(*) AS n FROM login_attempts WHERE (username = ? OR ip = ?) AND at > ?")
      .bind(username, ip, now() - LOCKOUT_SECONDS)
      .first<{ n: number }>();
    if ((recent?.n ?? 0) >= MAX_FAILURES) return c.json({ error: "rate_limited" as const }, 429);

    const user = await db
      .prepare("SELECT id, username, locale, password_hash, salt FROM users WHERE username = ?")
      .bind(username)
      .first<{ id: number; username: string; locale: Locale; password_hash: string; salt: string }>();
    const hash = await hashPassword(password, user?.salt ?? DUMMY_SALT);
    if (!user || !constantTimeEqual(hash, user.password_hash)) {
      await db
        .prepare("INSERT INTO login_attempts (username, ip, at) VALUES (?, ?, ?)")
        .bind(username, ip, now())
        .run();
      return c.json({ error: "invalid_credentials" as const }, 401);
    }

    await db.batch([
      db.prepare("DELETE FROM login_attempts WHERE username = ? OR at < ?").bind(username, now() - LOCKOUT_SECONDS),
      db.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now()),
    ]);
    const token = await createSession(db, user.id);
    setCookie(c, COOKIE, token, {
      httpOnly: true,
      sameSite: "Lax",
      secure: new URL(c.req.url).protocol === "https:",
      path: "/",
      maxAge: SESSION_DAYS * 86400,
    });
    return c.json({ username: user.username, locale: user.locale }, 200);
  })
  .post("/logout", async (c) => {
    await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(c.get("sessionTokenHash")).run();
    deleteCookie(c, COOKIE, { path: "/" });
    return c.json({ ok: true as const }, 200);
  });
