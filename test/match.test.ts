// The Match best times: one row per user and set, only ever replaced by a
// faster round. The ownership pattern is in test/ownership.test.ts.
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { exportUserData } from "../worker/export";
import { addSet } from "./fixtures";
import { addUser, api, signedIn } from "./helpers";

async function bestOf(userId: number, setId: number): Promise<number | null> {
  const row = await env.DB.prepare("SELECT seconds FROM match_best WHERE user_id = ? AND set_id = ?")
    .bind(userId, setId)
    .first<{ seconds: number }>();
  return row?.seconds ?? null;
}

describe("match best times", () => {
  it("are part of the user's export", async () => {
    const { id: anna, cookie } = await signedIn("anna");
    const ben = await addUser("ben", "secret-pw");
    const { id: set } = await addSet(anna, "Spanish animals", { terms: [["el perro", "the dog"]] });
    await api(`/api/sets/${set}/match`, { method: "POST", json: { seconds: 23 }, cookie });
    const { id: benSet } = await addSet(ben, "Ben set");
    await env.DB.prepare("INSERT INTO match_best (user_id, set_id, seconds) VALUES (?, ?, 9)").bind(ben, benSet).run();

    const data = await exportUserData(env.DB, anna);
    expect(data.match_best).toEqual([expect.objectContaining({ user_id: anna, set_id: set, seconds: 23 })]);
  });
});

describe("POST /api/sets/:id/match", () => {
  it("records the first round as the best time", async () => {
    const { id: anna, cookie } = await signedIn("anna");
    const { id: set } = await addSet(anna, "Spanish animals");

    const res = await api(`/api/sets/${set}/match`, { method: "POST", json: { seconds: 23 }, cookie });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ best: 23, isNewBest: true });
    expect(await bestOf(anna, set)).toBe(23);
  });

  it("a slower round keeps the old best and is not a new one", async () => {
    const { id: anna, cookie } = await signedIn("anna");
    const { id: set } = await addSet(anna, "Spanish animals");
    await api(`/api/sets/${set}/match`, { method: "POST", json: { seconds: 23 }, cookie });

    const res = await api(`/api/sets/${set}/match`, { method: "POST", json: { seconds: 30 }, cookie });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ best: 23, isNewBest: false });
    expect(await bestOf(anna, set)).toBe(23);
  });

  it("an equal time is not better either", async () => {
    const { id: anna, cookie } = await signedIn("anna");
    const { id: set } = await addSet(anna, "Spanish animals");
    await api(`/api/sets/${set}/match`, { method: "POST", json: { seconds: 23 }, cookie });

    const res = await api(`/api/sets/${set}/match`, { method: "POST", json: { seconds: 23 }, cookie });
    expect(await res.json()).toEqual({ best: 23, isNewBest: false });
  });

  it("a faster round replaces the best time", async () => {
    const { id: anna, cookie } = await signedIn("anna");
    const { id: set } = await addSet(anna, "Spanish animals");
    await api(`/api/sets/${set}/match`, { method: "POST", json: { seconds: 23 }, cookie });

    const res = await api(`/api/sets/${set}/match`, { method: "POST", json: { seconds: 17 }, cookie });
    expect(await res.json()).toEqual({ best: 17, isNewBest: true });
    expect(await bestOf(anna, set)).toBe(17);
  });

  it("two rounds finishing at once keep the faster time", async () => {
    const { id: anna, cookie } = await signedIn("anna");
    const { id: set } = await addSet(anna, "Spanish animals");
    await api(`/api/sets/${set}/match`, { method: "POST", json: { seconds: 20 }, cookie });

    await Promise.all([
      api(`/api/sets/${set}/match`, { method: "POST", json: { seconds: 12 }, cookie }),
      api(`/api/sets/${set}/match`, { method: "POST", json: { seconds: 15 }, cookie }),
    ]);
    expect(await bestOf(anna, set)).toBe(12);
  });

  it("another user's set is a 404 and stays untouched", async () => {
    const { id: anna, cookie } = await signedIn("anna");
    const ben = await addUser("ben", "secret-pw");
    const { id: set } = await addSet(ben, "Ben set");

    const res = await api(`/api/sets/${set}/match`, { method: "POST", json: { seconds: 23 }, cookie });
    expect(res.status).toBe(404);
    expect(await bestOf(ben, set)).toBeNull();
    expect(await bestOf(anna, set)).toBeNull();
  });

  it("needs a login", async () => {
    const anna = await addUser("anna", "secret-pw");
    const { id: set } = await addSet(anna, "Spanish animals");
    const res = await api(`/api/sets/${set}/match`, { method: "POST", json: { seconds: 23 } });
    expect(res.status).toBe(401);
  });

  it("seconds has to be whole, positive and believable", async () => {
    const { id: anna, cookie } = await signedIn("anna");
    const { id: set } = await addSet(anna, "Spanish animals");

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
    const { id: anna, cookie } = await signedIn("anna");
    const { id: set } = await addSet(anna, "Spanish animals", { terms: [["el perro", "the dog"]] });

    let res = await api(`/api/sets/${set}`, { cookie });
    expect(((await res.json()) as { bestSeconds: number | null }).bestSeconds).toBeNull();

    await api(`/api/sets/${set}/match`, { method: "POST", json: { seconds: 23 }, cookie });
    res = await api(`/api/sets/${set}`, { cookie });
    expect(((await res.json()) as { bestSeconds: number | null }).bestSeconds).toBe(23);
  });
});
