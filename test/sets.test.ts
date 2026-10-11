// Study sets and their terms. The ownership pattern every business table
// follows is in test/ownership.test.ts; this file covers the sets API.
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { exportUserData } from "../worker/export";
import { addUser, api, login } from "./helpers";

async function addSet(userId: number, title: string, description = "", terms: [string, string][] = []) {
  const row = await env.DB.prepare("INSERT INTO sets (user_id, title, description) VALUES (?, ?, ?) RETURNING id")
    .bind(userId, title, description)
    .first<{ id: number }>();
  const id = row!.id;
  for (const [position, [term, definition]] of terms.entries()) {
    await env.DB.prepare("INSERT INTO terms (user_id, set_id, term, definition, position) VALUES (?, ?, ?, ?, ?)")
      .bind(userId, id, term, definition, position)
      .run();
  }
  return id;
}

describe("sets and terms", () => {
  it("are part of the user's export", async () => {
    const anna = await addUser("anna", "secret-pw");
    const ben = await addUser("ben", "secret-pw");
    await addSet(anna, "Anna set", "for the exam", [["hola", "hello"]]);
    await addSet(ben, "Ben set");

    const data = await exportUserData(env.DB, anna);
    expect(data.sets).toEqual([expect.objectContaining({ title: "Anna set", description: "for the exam" })]);
    expect(data.terms).toEqual([expect.objectContaining({ term: "hola", definition: "hello" })]);
  });
});

describe("GET /api/sets", () => {
  it("lists only my sets, with their term counts", async () => {
    const anna = await addUser("anna", "secret-pw");
    const ben = await addUser("ben", "secret-pw");
    await addSet(anna, "Spanish animals", "", [
      ["el perro", "the dog"],
      ["el gato", "the cat"],
    ]);
    await addSet(ben, "Ben's secret set");
    const cookie = await login("anna", "secret-pw");

    const res = await api("/api/sets", { cookie });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      expect.objectContaining({ title: "Spanish animals", description: "", termCount: 2, termLang: null }),
    ]);
  });

  it("finds sets by title, description and term", async () => {
    const anna = await addUser("anna", "secret-pw");
    await addSet(anna, "Spanish animals", "chapter 1", [["el perro", "the dog"]]);
    await addSet(anna, "Swiss history", "dates to remember", [["1291", "Bundesbrief"]]);
    const cookie = await login("anna", "secret-pw");

    for (const [q, expected] of [
      ["swiss", ["Swiss history"]],
      ["chapter", ["Spanish animals"]],
      ["Bundesbrief", ["Swiss history"]],
      ["dog", ["Spanish animals"]],
      ["", ["Swiss history", "Spanish animals"]],
    ] as const) {
      const res = await api(`/api/sets?q=${encodeURIComponent(q)}`, { cookie });
      expect(
        ((await res.json()) as { title: string }[]).map((s) => s.title),
        `q=${q}`,
      ).toEqual(expected);
    }
  });

  it("treats % and _ in the search as plain text", async () => {
    const anna = await addUser("anna", "secret-pw");
    await addSet(anna, "Sale 50% off");
    await addSet(anna, "Completely different");
    const cookie = await login("anna", "secret-pw");

    const res = await api("/api/sets?q=" + encodeURIComponent("%"), { cookie });
    expect(((await res.json()) as { title: string }[]).map((s) => s.title)).toEqual(["Sale 50% off"]);
  });

  it("needs a login", async () => {
    const res = await api("/api/sets");
    expect(res.status).toBe(401);
  });
});

describe("GET /api/sets/:id", () => {
  it("returns one set with its terms in order", async () => {
    const anna = await addUser("anna", "secret-pw");
    const id = await addSet(anna, "Spanish animals", "chapter 1", [
      ["el perro", "the dog"],
      ["el gato", "the cat"],
    ]);
    const cookie = await login("anna", "secret-pw");

    const res = await api(`/api/sets/${id}`, { cookie });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id,
      title: "Spanish animals",
      description: "chapter 1",
      termLang: null,
      defLang: null,
      termCount: 2,
      createdAt: expect.any(Number),
      updatedAt: expect.any(Number),
      terms: [
        { id: expect.any(Number), term: "el perro", definition: "the dog", position: 0 },
        { id: expect.any(Number), term: "el gato", definition: "the cat", position: 1 },
      ],
    });
  });

  it("another user's set is a 404", async () => {
    await addUser("anna", "secret-pw");
    const ben = await addUser("ben", "secret-pw");
    const id = await addSet(ben, "Ben's secret set");
    const cookie = await login("anna", "secret-pw");

    const res = await api(`/api/sets/${id}`, { cookie });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  it("an id that is not a number is a validation error", async () => {
    await addUser("anna", "secret-pw");
    const cookie = await login("anna", "secret-pw");

    const res = await api("/api/sets/not-a-number", { cookie });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "validation", fields: { id: "invalid_type" } });
  });
});
