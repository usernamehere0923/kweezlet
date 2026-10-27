// Study sets and their terms. The ownership pattern every business table
// follows is in test/ownership.test.ts; this file covers the sets API.
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { exportUserData } from "../worker/export";
import { termProgress } from "../worker/progress";
import { addSet } from "./fixtures";
import { addUser, api, signedIn } from "./helpers";

describe("sets and terms", () => {
  it("are part of the user's export", async () => {
    const anna = await addUser("anna", "secret-pw");
    const ben = await addUser("ben", "secret-pw");
    await addSet(anna, "Anna set", { description: "for the exam", terms: [["hola", "hello"]] });
    await addSet(ben, "Ben set");

    const data = await exportUserData(env.DB, anna);
    expect(data.sets).toEqual([expect.objectContaining({ title: "Anna set", description: "for the exam" })]);
    expect(data.terms).toEqual([expect.objectContaining({ term: "hola", definition: "hello" })]);
  });
});

describe("termProgress", () => {
  it("is known, learning or new", () => {
    expect(termProgress({ status: "know_it", streak: 0 })).toBe("known");
    expect(termProgress({ status: "still_learning", streak: 0 })).toBe("learning");
    expect(termProgress({ status: null, streak: 1 })).toBe("learning");
    expect(termProgress({ status: "unseen", streak: 0 })).toBe("new");
    expect(termProgress({ status: null, streak: 0 })).toBe("new");
  });
});

describe("GET /api/sets", () => {
  it("lists only my sets, with their term counts", async () => {
    const { id: anna, cookie } = await signedIn("anna");
    const ben = await addUser("ben", "secret-pw");
    await addSet(anna, "Spanish animals", {
      terms: [
        ["el perro", "the dog"],
        ["el gato", "the cat"],
      ],
    });
    await addSet(ben, "Ben's secret set");

    const res = await api("/api/sets", { cookie });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      expect.objectContaining({ title: "Spanish animals", description: "", termCount: 2, termLang: null }),
    ]);
  });

  it("counts known, learning and new terms per set", async () => {
    const { id: anna, cookie } = await signedIn("anna");
    const ben = await addUser("ben", "secret-pw");
    const { id: set, termIds } = await addSet(anna, "Spanish animals", {
      terms: [
        ["el perro", "the dog"],
        ["el gato", "the cat"],
        ["el caballo", "the horse"],
        ["el pez", "the fish"],
        ["el pájaro", "the bird"],
      ],
    });
    const [perro, gato, caballo, pez] = termIds;
    const mark = (term: number, status: string | null) =>
      env.DB.prepare("INSERT INTO term_state (user_id, term_id, set_id, status) VALUES (?, ?, ?, ?)")
        .bind(anna, term, set, status)
        .run();
    const answered = (term: number, streak: number) =>
      env.DB.prepare("INSERT INTO term_stats (user_id, term_id, set_id, streak) VALUES (?, ?, ?, ?)")
        .bind(anna, term, set, streak)
        .run();
    await mark(perro, "know_it");
    await mark(gato, "still_learning");
    await answered(caballo, 1); // right once, not marked yet
    await mark(pez, null); // only starred: still new
    await answered(pez, 0);
    // Ben's progress on his own set doesn't leak into Anna's.
    const { id: benSet } = await addSet(ben, "Ben set", { terms: [["hola", "hello"]] });
    await env.DB.prepare(
      "INSERT INTO term_state (user_id, term_id, set_id, status) SELECT ?, id, set_id, 'know_it' FROM terms WHERE set_id = ?",
    )
      .bind(ben, benSet)
      .run();

    const list = await api("/api/sets", { cookie });
    expect(await list.json()).toEqual([
      expect.objectContaining({ title: "Spanish animals", termCount: 5, knownCount: 1, learningCount: 2 }),
    ]);
    const detail = await api(`/api/sets/${set}`, { cookie });
    expect(await detail.json()).toEqual(expect.objectContaining({ termCount: 5, knownCount: 1, learningCount: 2 }));
  });

  it("finds sets by title, description and term", async () => {
    const { id: anna, cookie } = await signedIn("anna");
    await addSet(anna, "Spanish animals", { description: "chapter 1", terms: [["el perro", "the dog"]] });
    await addSet(anna, "Swiss history", { description: "dates to remember", terms: [["1291", "Bundesbrief"]] });

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
    const { id: anna, cookie } = await signedIn("anna");
    await addSet(anna, "Sale 50% off");
    await addSet(anna, "Completely different");

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
    const { id: anna, cookie } = await signedIn("anna");
    const { id } = await addSet(anna, "Spanish animals", {
      description: "chapter 1",
      terms: [
        ["el perro", "the dog"],
        ["el gato", "the cat"],
      ],
    });

    const res = await api(`/api/sets/${id}`, { cookie });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id,
      title: "Spanish animals",
      description: "chapter 1",
      termLang: null,
      defLang: null,
      answerWith: "both",
      folderId: null,
      termCount: 2,
      knownCount: 0,
      learningCount: 0,
      createdAt: expect.any(Number),
      updatedAt: expect.any(Number),
      bestSeconds: null,
      terms: [
        {
          id: expect.any(Number),
          term: "el perro",
          definition: "the dog",
          position: 0,
          status: "unseen",
          starred: false,
          streak: 0,
        },
        {
          id: expect.any(Number),
          term: "el gato",
          definition: "the cat",
          position: 1,
          status: "unseen",
          starred: false,
          streak: 0,
        },
      ],
    });
  });

  it("another user's set is a 404", async () => {
    const { cookie } = await signedIn("anna");
    const ben = await addUser("ben", "secret-pw");
    const { id } = await addSet(ben, "Ben's secret set");

    const res = await api(`/api/sets/${id}`, { cookie });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  it("an id that is not a number is a validation error", async () => {
    const { cookie } = await signedIn("anna");

    const res = await api("/api/sets/not-a-number", { cookie });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "validation", fields: { id: "invalid_type" } });
  });
});

describe("POST /api/sets", () => {
  it("creates a set with its terms and returns it", async () => {
    const { cookie } = await signedIn("anna");

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
      answerWith: "both",
      folderId: null,
      termCount: 2,
      knownCount: 0,
      learningCount: 0,
      createdAt: expect.any(Number),
      updatedAt: expect.any(Number),
      bestSeconds: null,
      terms: [
        {
          id: expect.any(Number),
          term: "el perro",
          definition: "the dog",
          position: 0,
          status: "unseen",
          starred: false,
          streak: 0,
        },
        {
          id: expect.any(Number),
          term: "el gato",
          definition: "the cat",
          position: 1,
          status: "unseen",
          starred: false,
          streak: 0,
        },
      ],
    });

    const get = await api(`/api/sets/${created.id}`, { cookie });
    expect(await get.json()).toEqual(created);
  });

  it("puts the terms into the new set when other sets exist", async () => {
    const { id: anna, cookie } = await signedIn("anna");
    const ben = await addUser("ben", "secret-pw");
    const { id: older } = await addSet(anna, "Older", { terms: [["a", "b"]] });
    await addSet(ben, "Ben set", { terms: [["c", "d"]] });

    const res = await api("/api/sets", {
      method: "POST",
      cookie,
      json: { title: "New", terms: [{ term: "x", definition: "y" }] },
    });
    const created = (await res.json()) as { id: number; terms: { term: string }[] };
    expect(created.terms.map((t) => t.term)).toEqual(["x"]);
    const old = (await (await api(`/api/sets/${older}`, { cookie })).json()) as { terms: { term: string }[] };
    expect(old.terms.map((t) => t.term)).toEqual(["a"]);
  });

  it("leaves no empty set behind when a term cannot be saved", async () => {
    const { id: anna, cookie } = await signedIn("anna");
    await env.DB.exec(
      "CREATE TRIGGER fail_term BEFORE INSERT ON terms WHEN NEW.term = 'boom' BEGIN SELECT RAISE(ABORT, 'boom'); END",
    );

    const res = await api("/api/sets", {
      method: "POST",
      cookie,
      json: { title: "Broken", terms: [{ term: "boom", definition: "x" }] },
    });
    expect(res.status).toBe(500);
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM sets WHERE user_id = ?")
      .bind(anna)
      .first<{ n: number }>();
    expect(count!.n).toBe(0);
  });

  it("rejects bad data with field errors", async () => {
    const { cookie } = await signedIn("anna");

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
    const { cookie } = await signedIn("anna");

    const res = await api("/api/sets", { method: "POST", cookie, json: { title: "Empty", terms: [] } });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "validation", fields: { terms: "too_small" } });
  });

  it("a new set cannot adopt existing terms", async () => {
    const { id: anna, cookie } = await signedIn("anna");
    const [termId] = (await addSet(anna, "Mine", { terms: [["a", "b"]] })).termIds;

    const res = await api("/api/sets", {
      method: "POST",
      cookie,
      json: { title: "Copy", terms: [{ id: termId, term: "a", definition: "b" }] },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "validation", fields: { terms: "invalid_value" } });
  });
});

describe("PATCH /api/sets/:id", () => {
  it("updates terms in place and keeps their ids", async () => {
    const { id: anna, cookie } = await signedIn("anna");
    const { id } = await addSet(anna, "Old title", {
      description: "old",
      terms: [
        ["el perro", "the dog"],
        ["el gato", "the cat"],
      ],
    });
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
      {
        id: perro.id,
        term: "el perro",
        definition: "the dog (updated)",
        position: 0,
        status: "unseen",
        starred: false,
        streak: 0,
      },
      {
        id: expect.any(Number),
        term: "el caballo",
        definition: "the horse",
        position: 1,
        status: "unseen",
        starred: false,
        streak: 0,
      },
    ]);
    expect(after.terms.map((t) => t.id)).not.toContain(gato.id);
  });

  it("refuses a term id that belongs to another set", async () => {
    const { id: anna, cookie } = await signedIn("anna");
    const { id: mine } = await addSet(anna, "Mine", { terms: [["a", "b"]] });
    const [otherTerm] = (await addSet(anna, "Other", { terms: [["c", "d"]] })).termIds;

    const res = await api(`/api/sets/${mine}`, {
      method: "PATCH",
      cookie,
      json: { title: "Hijacked", terms: [{ id: otherTerm, term: "c", definition: "d" }] },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "validation", fields: { terms: "invalid_value" } });

    // Nothing at all was written: the request is all-or-nothing.
    const after = (await (await api(`/api/sets/${mine}`, { cookie })).json()) as { title: string; terms: unknown[] };
    expect(after.title).toBe("Mine");
    expect(after.terms).toEqual([expect.objectContaining({ term: "a", definition: "b" })]);
  });

  it("refuses a term id that belongs to another user", async () => {
    const { id: anna, cookie } = await signedIn("anna");
    const ben = await addUser("ben", "secret-pw");
    const { id: mine } = await addSet(anna, "Mine", { terms: [["a", "b"]] });
    const [benTerm] = (await addSet(ben, "Ben's", { terms: [["c", "d"]] })).termIds;

    const res = await api(`/api/sets/${mine}`, {
      method: "PATCH",
      cookie,
      json: { title: "Mine", terms: [{ id: benTerm, term: "c", definition: "d" }] },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "validation", fields: { terms: "invalid_value" } });
  });

  it("another user's set is a 404", async () => {
    const { cookie } = await signedIn("anna");
    const ben = await addUser("ben", "secret-pw");
    const { id } = await addSet(ben, "Ben's secret set", { terms: [["c", "d"]] });

    const res = await api(`/api/sets/${id}`, {
      method: "PATCH",
      cookie,
      json: { title: "Hijacked", terms: [{ term: "x", definition: "y" }] },
    });
    expect(res.status).toBe(404);
  });
});

describe("a set's side (answerWith)", () => {
  const terms = [{ term: "el perro", definition: "the dog" }];
  const create = (cookie: string, extra: object = {}) =>
    api("/api/sets", { method: "POST", cookie, json: { title: "Animals", terms, ...extra } });

  it("is both for a new set unless picked, and comes back with the set", async () => {
    const { cookie } = await signedIn("anna");
    const plain = (await (await create(cookie)).json()) as { answerWith: string };
    expect(plain.answerWith).toBe("both");
    const picked = (await (await create(cookie, { answerWith: "term" })).json()) as { id: number };
    const detail = (await (await api(`/api/sets/${picked.id}`, { cookie })).json()) as { answerWith: string };
    expect(detail.answerWith).toBe("term");
    const list = (await (await api("/api/sets", { cookie })).json()) as { answerWith: string }[];
    expect(list.map((set) => set.answerWith).sort()).toEqual(["both", "term"]);
  });

  it("is changed by an edit that names it and kept by one that doesn't", async () => {
    const { cookie } = await signedIn("anna");
    const { id } = (await (await create(cookie)).json()) as { id: number };
    const patch = (extra: object) =>
      api(`/api/sets/${id}`, { method: "PATCH", cookie, json: { title: "Animals", terms, ...extra } });
    expect(((await (await patch({ answerWith: "definition" })).json()) as { answerWith: string }).answerWith).toBe(
      "definition",
    );
    expect(((await (await patch({})).json()) as { answerWith: string }).answerWith).toBe("definition");
  });

  it("refuses a side that does not exist", async () => {
    const { cookie } = await signedIn("anna");
    const res = await create(cookie, { answerWith: "sideways" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "validation", fields: { answerWith: "invalid_value" } });
  });
});

describe("DELETE /api/sets/:id", () => {
  it("removes the set and its terms", async () => {
    const { id: anna, cookie } = await signedIn("anna");
    const { id } = await addSet(anna, "Gone soon", { terms: [["a", "b"]] });

    const res = await api(`/api/sets/${id}`, { method: "DELETE", cookie });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    expect(await api(`/api/sets/${id}`, { cookie })).toHaveProperty("status", 404);
    const { results } = await env.DB.prepare("SELECT id FROM terms WHERE set_id = ?").bind(id).all();
    expect(results).toEqual([]);
  });

  it("another user's set is a 404", async () => {
    const { cookie } = await signedIn("anna");
    const ben = await addUser("ben", "secret-pw");
    const { id } = await addSet(ben, "Ben's secret set", { terms: [["c", "d"]] });

    const res = await api(`/api/sets/${id}`, { method: "DELETE", cookie });
    expect(res.status).toBe(404);
  });
});
