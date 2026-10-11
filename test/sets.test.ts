// Study sets and their terms. The ownership pattern every business table
// follows is in test/ownership.test.ts; this file covers the sets API.
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { exportUserData } from "../worker/export";
import { addUser } from "./helpers";

describe("sets and terms", () => {
  it("are part of the user's export", async () => {
    const anna = await addUser("anna", "secret-pw");
    const ben = await addUser("ben", "secret-pw");
    await env.DB.prepare(
      "INSERT INTO sets (user_id, title, description) VALUES (?, 'Anna set', 'for the exam'), (?, 'Ben set', '')",
    )
      .bind(anna, ben)
      .run();
    await env.DB.prepare(
      "INSERT INTO terms (user_id, set_id, term, definition, position) VALUES (?, (SELECT id FROM sets WHERE title = 'Anna set'), 'hola', 'hello', 0)",
    )
      .bind(anna)
      .run();

    const data = await exportUserData(env.DB, anna);
    expect(data.sets).toEqual([expect.objectContaining({ title: "Anna set", description: "for the exam" })]);
    expect(data.terms).toEqual([expect.objectContaining({ term: "hola", definition: "hello" })]);
  });
});
