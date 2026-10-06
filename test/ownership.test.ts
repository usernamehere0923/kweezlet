// The pattern every business table follows: a user_id column, every query
// scoped to c.get("user").id, and the table listed in worker/export.ts.
// "notes" exists only in this test, as the example to copy.
import { env } from "cloudflare:workers";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { requireUser } from "../worker/auth";
import { exportTables, exportUserData, privateTables } from "../worker/export";
import app from "../worker/index";
import type { AppEnv } from "../worker/types";
import { addUser, api, BASE, login } from "./helpers";

async function createNotes() {
  await env.DB.exec(
    "CREATE TABLE notes (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE, text TEXT NOT NULL)",
  );
}

const withNotes = new Hono<AppEnv>()
  .get("/api/notes", requireUser, async (c) => {
    const { results } = await c.env.DB.prepare("SELECT id, text FROM notes WHERE user_id = ?")
      .bind(c.get("user").id)
      .all();
    return c.json(results, 200);
  })
  .route("/", app);

describe("data ownership", () => {
  it("a user only ever sees their own rows", async () => {
    await createNotes();
    const anna = await addUser("anna", "secret-pw");
    const ben = await addUser("ben", "secret-pw");
    await env.DB.batch([
      env.DB.prepare("INSERT INTO notes (user_id, text) VALUES (?, ?)").bind(anna, "anna's note"),
      env.DB.prepare("INSERT INTO notes (user_id, text) VALUES (?, ?)").bind(ben, "ben's note"),
    ]);
    const cookie = await login("anna", "secret-pw");
    const res = await withNotes.request(BASE + "/api/notes", { headers: { Cookie: cookie } }, env);
    expect(await res.json()).toEqual([{ id: 1, text: "anna's note" }]);
  });

  it("export contains only the caller's rows", async () => {
    await createNotes();
    const anna = await addUser("anna", "secret-pw");
    const ben = await addUser("ben", "secret-pw");
    await env.DB.prepare("INSERT INTO notes (user_id, text) VALUES (?, 'a'), (?, 'b')").bind(anna, ben).run();
    const data = await exportUserData(env.DB, anna, ["notes"]);
    expect(data).toEqual({ notes: [{ id: 1, user_id: anna, text: "a" }] });
  });
});

describe("export", () => {
  it("downloads as an attachment and holds no secrets", async () => {
    await addUser("anna", "secret-pw");
    const cookie = await login("anna", "secret-pw");
    const res = await api("/api/me/export", { cookie });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toMatch(
      /^attachment; filename="kweezlet-anna-\d{4}-\d{2}-\d{2}\.json"$/,
    );
    const text = await res.text();
    expect(JSON.parse(text)).toMatchObject({ app: "kweezlet", username: "anna" });
    expect(text).not.toMatch(/password|salt|token/);
  });

  it("every table with a user_id is in exportTables (or privateTables)", async () => {
    const { results: tables } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name != 'd1_migrations'",
    ).all<{ name: string }>();
    const results: { name: string }[] = [];
    for (const { name } of tables) {
      const { results: cols } = await env.DB.prepare(`PRAGMA table_info("${name}")`).all<{ name: string }>();
      if (cols.some((col) => col.name === "user_id")) results.push({ name });
    }
    const missing = results.map((r) => r.name).filter((t) => !exportTables.includes(t) && !privateTables.includes(t));
    expect(missing, "add these tables to exportTables in worker/export.ts").toEqual([]);
  });
});
