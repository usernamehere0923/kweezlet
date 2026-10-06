import { env, exports } from "cloudflare:workers";
import { hashPassword, randomHex } from "../worker/crypto";

export const BASE = "http://kweezlet.test";

export async function addUser(username: string, password: string): Promise<number> {
  const salt = randomHex(16);
  const row = await env.DB.prepare("INSERT INTO users (username, password_hash, salt) VALUES (?, ?, ?) RETURNING id")
    .bind(username, await hashPassword(password, salt), salt)
    .first<{ id: number }>();
  return row!.id;
}

export function api(path: string, init: RequestInit & { cookie?: string; json?: unknown } = {}) {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set("Cookie", init.cookie);
  if (init.json !== undefined) headers.set("Content-Type", "application/json");
  return exports.default.fetch(
    new Request(BASE + path, {
      ...init,
      headers,
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    }),
  );
}

/** Logs in and returns the Cookie header value for later requests. */
export async function login(username: string, password: string): Promise<string> {
  const res = await api("/api/login", { method: "POST", json: { username, password } });
  if (res.status !== 200) throw new Error(`login failed: ${res.status}`);
  return res.headers.get("Set-Cookie")!.split(";")[0];
}
