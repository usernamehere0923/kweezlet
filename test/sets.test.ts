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

describe("POST /api/sets", () => {
  it("creates a set with its terms and returns it", async () => {
    await addUser("anna", "secret-pw");
    const cookie = await login("anna", "secret-pw");

    const res = await api("/api/sets", {
      method: "POST",
      cookie,
      json: {
        title: "Spanish animals",
        description: "chapter 1",
        termLang: "es",
        defLang: "en",
        terms: [
          { term: "el perro", definition: "the dog" },
          { term: "el gato", definition: "the cat" },
        ],
      },
    });
    expect(res.status).toBe(201);
    const created = (await res.json()) as { id: number; terms: { id: number }[] };
    expect(created).toEqual({
      id: expect.any(Number),
      title: "Spanish animals",
      description: "chapter 1",
      termLang: "es",
      defLang: "en",
      termCount: 2,
      createdAt: expect.any(Number),
      updatedAt: expect.any(Number),
      terms: [
        { id: expect.any(Number), term: "el perro", definition: "the dog", position: 0 },
        { id: expect.any(Number), term: "el gato", definition: "the cat", position: 1 },
      ],
    });

    const get = await api(`/api/sets/${created.id}`, { cookie });
    expect(await get.json()).toEqual(created);
  });

  it("rejects bad data with field errors", async () => {
    await addUser("anna", "secret-pw");
    const cookie = await login("anna", "secret-pw");

    const res = await api("/api/sets", {
      method: "POST",
      cookie,
      json: { title: "", termLang: "klingon", terms: [{ term: "", definition: "x" }] },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "validation",
      fields: { title: "too_small", termLang: "invalid_value", "terms.0.term": "too_small" },
    });
  });

  it("rejects a set without terms", async () => {
    await addUser("anna", "secret-pw");
    const cookie = await login("anna", "secret-pw");

    const res = await api("/api/sets", { method: "POST", cookie, json: { title: "Empty", terms: [] } });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "validation", fields: { terms: "too_small" } });
  });
});

describe("PATCH /api/sets/:id", () => {
  it("updates terms in place and keeps their ids", async () => {
    const anna = await addUser("anna", "secret-pw");
    const cookie = await login("anna", "secret-pw");
    const id = await addSet(anna, "Old title", "old", [
      ["el perro", "the dog"],
      ["el gato", "the cat"],
    ]);
    const before = (await (await api(`/api/sets/${id}`, { cookie })).json()) as {
      terms: { id: number; term: string }[];
    };
    const [perro, gato] = before.terms;

    const res = await api(`/api/sets/${id}`, {
      method: "PATCH",
      cookie,
      json: {
        title: "New title",
        description: "",
        terms: [
          { id: perro.id, term: "el perro", definition: "the dog (updated)" },
          { term: "el caballo", definition: "the horse" },
        ],
      },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(
      expect.objectContaining({ id, title: "New title", description: "", termCount: 2, termLang: null }),
    );

    const after = (await (await api(`/api/sets/${id}`, { cookie })).json()) as {
      terms: { id: number; term: string; definition: string }[];
    };
    expect(after.terms).toEqual([
      { id: perro.id, term: "el perro", definition: "the dog (updated)", position: 0 },
      { id: expect.any(Number), term: "el caballo", definition: "the horse", position: 1 },
    ]);
    expect(after.terms.map((t) => t.id)).not.toContain(gato.id);
  });

  it("refuses a term id that belongs to another set", async () => {
    const anna = await addUser("anna", "secret-pw");
    const cookie = await login("anna", "secret-pw");
    const mine = await addSet(anna, "Mine", "", [["a", "b"]]);
    const other = await addSet(anna, "Other", "", [["c", "d"]]);
    const otherTerms = (await (await api(`/api/sets/${other}`, { cookie })).json()) as { terms: { id: number }[] };

    const res = await api(`/api/sets/${mine}`, {
      method: "PATCH",
      cookie,
      json: { title: "Mine", terms: [{ id: otherTerms.terms[0].id, term: "c", definition: "d" }] },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "validation", fields: { terms: "invalid_value" } });
  });

  it("another user's set is a 404", async () => {
    await addUser("anna", "secret-pw");
    const ben = await addUser("ben", "secret-pw");
    const id = await addSet(ben, "Ben's secret set", "", [["c", "d"]]);
    const cookie = await login("anna", "secret-pw");

    const res = await api(`/api/sets/${id}`, {
      method: "PATCH",
      cookie,
      json: { title: "Hijacked", terms: [{ term: "x", definition: "y" }] },
    });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/sets/:id", () => {
  it("removes the set and its terms", async () => {
    const anna = await addUser("anna", "secret-pw");
    const cookie = await login("anna", "secret-pw");
    const id = await addSet(anna, "Gone soon", "", [["a", "b"]]);

    const res = await api(`/api/sets/${id}`, { method: "DELETE", cookie });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    expect(await api(`/api/sets/${id}`, { cookie })).toHaveProperty("status", 404);
    const { results } = await env.DB.prepare("SELECT id FROM terms WHERE set_id = ?").bind(id).all();
    expect(results).toEqual([]);
  });

  it("another user's set is a 404", async () => {
    await addUser("anna", "secret-pw");
    const ben = await addUser("ben", "secret-pw");
    const id = await addSet(ben, "Ben's secret set", "", [["c", "d"]]);
    const cookie = await login("anna", "secret-pw");

    const res = await api(`/api/sets/${id}`, { method: "DELETE", cookie });
    expect(res.status).toBe(404);
  });
});
