// The Match best times: one row per user and set, only ever replaced by a
// faster round. The ownership pattern is in test/ownership.test.ts.
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { exportUserData } from "../worker/export";
import { addUser, api, login } from "./helpers";

async function addSet(userId: number, title: string, terms: [string, string][] = []) {
  const row = await env.DB.prepare("INSERT INTO sets (user_id, title) VALUES (?, ?) RETURNING id")
    .bind(userId, title)
    .first<{ id: number }>();
  for (const [position, [term, definition]] of terms.entries()) {
    await env.DB.prepare("INSERT INTO terms (user_id, set_id, term, definition, position) VALUES (?, ?, ?, ?, ?)")
      .bind(userId, row!.id, term, definition, position)
      .run();
  }
  return row!.id;
}

async function bestOf(userId: number, setId: number): Promise<number | null> {
  const row = await env.DB.prepare("SELECT seconds FROM match_best WHERE user_id = ? AND set_id = ?")
    .bind(userId, setId)
    .first<{ seconds: number }>();
  return row?.seconds ?? null;
}

describe("match best times", () => {
  it("are part of the user's export", async () => {
    const anna = await addUser("anna", "secret-pw");
    const ben = await addUser("ben", "secret-pw");
    const set = await addSet(anna, "Spanish animals", [["el perro", "the dog"]]);
    await api(`/api/sets/${set}/match`, {
      method: "POST",
      json: { seconds: 23 },
      cookie: await login("anna", "secret-pw"),
    });
    const benSet = await addSet(ben, "Ben set");
    await env.DB.prepare("INSERT INTO match_best (user_id, set_id, seconds) VALUES (?, ?, 9)").bind(ben, benSet).run();

    const data = await exportUserData(env.DB, anna);
    expect(data.match_best).toEqual([expect.objectContaining({ user_id: anna, set_id: set, seconds: 23 })]);
  });
});

describe("POST /api/sets/:id/match", () => {
  it("records the first round as the best time", async () => {
    const anna = await addUser("anna", "secret-pw");
    const set = await addSet(anna, "Spanish animals");
    const cookie = await login("anna", "secret-pw");

    const res = await api(`/api/sets/${set}/match`, { method: "POST", json: { seconds: 23 }, cookie });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ best: 23, isNewBest: true });
    expect(await bestOf(anna, set)).toBe(23);
  });

  it("a slower round keeps the old best and is not a new one", async () => {
    const anna = await addUser("anna", "secret-pw");
    const set = await addSet(anna, "Spanish animals");
    const cookie = await login("anna", "secret-pw");
    await api(`/api/sets/${set}/match`, { method: "POST", json: { seconds: 23 }, cookie });

    const res = await api(`/api/sets/${set}/match`, { method: "POST", json: { seconds: 30 }, cookie });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ best: 23, isNewBest: false });
    expect(await bestOf(anna, set)).toBe(23);
  });

  it("an equal time is not better either", async () => {
    const anna = await addUser("anna", "secret-pw");
    const set = await addSet(anna, "Spanish animals");
    const cookie = await login("anna", "secret-pw");
    await api(`/api/sets/${set}/match`, { method: "POST", json: { seconds: 23 }, cookie });

    const res = await api(`/api/sets/${set}/match`, { method: "POST", json: { seconds: 23 }, cookie });
    expect(await res.json()).toEqual({ best: 23, isNewBest: false });
  });

  it("a faster round replaces the best time", async () => {
    const anna = await addUser("anna", "secret-pw");
    const set = await addSet(anna, "Spanish animals");
    const cookie = await login("anna", "secret-pw");
    await api(`/api/sets/${set}/match`, { method: "POST", json: { seconds: 23 }, cookie });

    const res = await api(`/api/sets/${set}/match`, { method: "POST", json: { seconds: 17 }, cookie });
    expect(await res.json()).toEqual({ best: 17, isNewBest: true });
    expect(await bestOf(anna, set)).toBe(17);
  });

  it("another user's set is a 404 and stays untouched", async () => {
    const anna = await addUser("anna", "secret-pw");
    const ben = await addUser("ben", "secret-pw");
    const set = await addSet(ben, "Ben set");
    const cookie = await login("anna", "secret-pw");

    const res = await api(`/api/sets/${set}/match`, { method: "POST", json: { seconds: 23 }, cookie });
    expect(res.status).toBe(404);
    expect(await bestOf(ben, set)).toBeNull();
    expect(await bestOf(anna, set)).toBeNull();
  });

  it("needs a login", async () => {
    const anna = await addUser("anna", "secret-pw");
    const set = await addSet(anna, "Spanish animals");
    const res = await api(`/api/sets/${set}/match`, { method: "POST", json: { seconds: 23 } });
    expect(res.status).toBe(401);
  });

  it("seconds has to be whole, positive and believable", async () => {
    const anna = await addUser("anna", "secret-pw");
    const set = await addSet(anna, "Spanish animals");
    const cookie = await login("anna", "secret-pw");

    for (const seconds of [0, -5, 2.5, 3601, null]) {
      const res = await api(`/api/sets/${set}/match`, { method: "POST", json: { seconds }, cookie });
      expect(res.status, `seconds ${String(seconds)}`).toBe(400);
      expect(await res.json()).toMatchObject({ error: "validation", fields: { seconds: expect.any(String) } });
    }
    const res = await api(`/api/sets/${set}/match`, { method: "POST", json: {}, cookie });
    expect(res.status).toBe(400);
    expect(await bestOf(anna, set)).toBeNull();
  });
});

describe("GET /api/sets/:id", () => {
  it("carries the best Match time, or null before the first round", async () => {
    const anna = await addUser("anna", "secret-pw");
    const set = await addSet(anna, "Spanish animals", [["el perro", "the dog"]]);
    const cookie = await login("anna", "secret-pw");

    let res = await api(`/api/sets/${set}`, { cookie });
    expect(((await res.json()) as { bestSeconds: number | null }).bestSeconds).toBeNull();

    await api(`/api/sets/${set}/match`, { method: "POST", json: { seconds: 23 }, cookie });
    res = await api(`/api/sets/${set}`, { cookie });
    expect(((await res.json()) as { bestSeconds: number | null }).bestSeconds).toBe(23);
  });
});
