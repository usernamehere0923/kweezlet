// Study progress: how a user marked each term, and the days they studied.
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { exportUserData } from "../worker/export";
import { addUser } from "./helpers";

describe("study progress", () => {
  it("is part of the user's export", async () => {
    const anna = await addUser("anna", "secret-pw");
    await env.DB.prepare("INSERT INTO sets (user_id, title) VALUES (?, 'Set')").bind(anna).run();
    const set = await env.DB.prepare("SELECT id FROM sets WHERE user_id = ?").bind(anna).first<{ id: number }>();
    await env.DB.prepare(
      "INSERT INTO terms (user_id, set_id, term, definition, position) VALUES (?, ?, 'hola', 'hello', 0)",
    )
      .bind(anna, set!.id)
      .run();
    const term = await env.DB.prepare("SELECT id FROM terms WHERE user_id = ?").bind(anna).first<{ id: number }>();
    await env.DB.prepare(
      "INSERT INTO term_state (user_id, term_id, set_id, status, starred) VALUES (?, ?, ?, 'know_it', 1)",
    )
      .bind(anna, term!.id, set!.id)
      .run();
    await env.DB.prepare("INSERT INTO study_days (user_id, day) VALUES (?, '2026-10-11')").bind(anna).run();

    const data = await exportUserData(env.DB, anna);
    expect(data.term_state).toEqual([expect.objectContaining({ status: "know_it", starred: 1 })]);
    expect(data.study_days).toEqual([expect.objectContaining({ day: "2026-10-11" })]);
  });
});
