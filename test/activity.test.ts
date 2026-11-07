// Study activity beacons (POST /api/study/activity): what a study session
// reports for the statistics — the day's counters, the study day behind the
// streak, and which set was studied last (quick resume).
import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import { exportUserData } from "../worker/export";
import { addSet } from "./fixtures";
import { addUser, api, signedIn } from "./helpers";

async function dayStats(userId: number, day: string) {
  return env.DB.prepare("SELECT * FROM day_stats WHERE user_id = ? AND day = ?").bind(userId, day).first();
}

describe("POST /api/study/activity", () => {
  it("a flush adds its counters to the day", async () => {
    const { id: anna, cookie } = await signedIn("anna");

    const res = await api("/api/study/activity", {
      method: "POST",
      cookie,
      json: { day: "2026-10-11", seconds: 120, cards: 5, correct: 4, wrong: 1, learned: 1 },
    });
    expect(res.status).toBe(200);
    expect(await dayStats(anna, "2026-10-11")).toMatchObject({
      cards: 5,
      correct: 4,
      wrong: 1,
      learned: 1,
      seconds: 120,
    });

    // The next flush of the same session adds to the day, not over it.
    await api("/api/study/activity", {
      method: "POST",
      cookie,
      json: { day: "2026-10-11", seconds: 30, cards: 2 },
    });
    expect(await dayStats(anna, "2026-10-11")).toMatchObject({
      cards: 7,
      correct: 4,
      wrong: 1,
      learned: 1,
      seconds: 150,
    });
  });

  it("another day is another row", async () => {
    const { id: anna, cookie } = await signedIn("anna");
    await api("/api/study/activity", { method: "POST", cookie, json: { day: "2026-10-11", cards: 5 } });
    await api("/api/study/activity", { method: "POST", cookie, json: { day: "2026-10-12", cards: 3 } });

    expect(await dayStats(anna, "2026-10-11")).toMatchObject({ cards: 5 });
    expect(await dayStats(anna, "2026-10-12")).toMatchObject({ cards: 3 });
  });

  it("real activity keeps the study day alive, an empty flush does not", async () => {
    const { id: anna, cookie } = await signedIn("anna");

    await api("/api/study/activity", { method: "POST", cookie, json: { day: "2026-10-11" } });
    const quiet = await env.DB.prepare("SELECT COUNT(*) AS n FROM study_days WHERE user_id = ?").bind(anna).first();
    expect(quiet!.n).toBe(0);

    await api("/api/study/activity", { method: "POST", cookie, json: { day: "2026-10-11", seconds: 45 } });
    const { results } = await env.DB.prepare("SELECT day FROM study_days WHERE user_id = ?").bind(anna).all();
    expect(results).toEqual([{ day: "2026-10-11" }]);
  });

  it("the set and its mode are remembered for quick resume", async () => {
    const { id: anna, cookie } = await signedIn("anna");
    const { id: setId } = await addSet(anna, "Set");

    await api("/api/study/activity", {
      method: "POST",
      cookie,
      json: { day: "2026-10-11", seconds: 30, setId, mode: "flashcards" },
    });
    const first = await env.DB.prepare("SELECT * FROM set_activity WHERE user_id = ?")
      .bind(anna)
      .first<{ set_id: number; last_mode: string }>();
    expect(first).toMatchObject({ set_id: setId, last_mode: "flashcards" });

    // Studying the set again moves the row along.
    await api("/api/study/activity", { method: "POST", cookie, json: { day: "2026-10-12", setId, mode: "learn" } });
    const again = await env.DB.prepare("SELECT last_mode FROM set_activity WHERE user_id = ?").bind(anna).first();
    expect(again).toEqual({ last_mode: "learn" });
  });

  it("someone else's set is never remembered", async () => {
    const { cookie } = await signedIn("anna");
    const ben = await addUser("ben", "secret-pw");
    const { id: setId } = await addSet(ben, "Ben's set");

    const res = await api("/api/study/activity", {
      method: "POST",
      cookie,
      json: { day: "2026-10-11", seconds: 30, setId, mode: "learn" },
    });
    expect(res.status).toBe(200);
    const { results } = await env.DB.prepare("SELECT * FROM set_activity").all();
    expect(results).toEqual([]);
  });

  it("a bad day, a negative count or an unknown mode is a validation error", async () => {
    const { cookie } = await signedIn("anna");

    for (const json of [
      { day: "yesterday" },
      { day: "2026-02-31", seconds: 30 },
      { day: "2026-10-11", cards: -1 },
      { day: "2026-10-11", mode: "napping" },
    ]) {
      const res = await api("/api/study/activity", { method: "POST", cookie, json });
      expect(res.status, JSON.stringify(json)).toBe(400);
    }
  });

  it("the counters are part of the user's export", async () => {
    const { id: anna, cookie } = await signedIn("anna");
    const { id: setId } = await addSet(anna, "Set");
    await api("/api/study/activity", {
      method: "POST",
      cookie,
      json: { day: "2026-10-11", cards: 5, setId, mode: "learn" },
    });

    const data = await exportUserData(env.DB, anna);
    expect(data.day_stats).toEqual([expect.objectContaining({ day: "2026-10-11", cards: 5 })]);
    expect(data.set_activity).toEqual([expect.objectContaining({ set_id: setId, last_mode: "learn" })]);
  });

  it("a flush sent again with the same id counts once", async () => {
    const { id: anna, cookie } = await signedIn("anna");
    const flush = { day: "2026-10-11", seconds: 30, cards: 4, id: "flush-0001" };

    // The answer of the first got lost: the client sends the same flush again.
    expect((await api("/api/study/activity", { method: "POST", cookie, json: flush })).status).toBe(200);
    expect((await api("/api/study/activity", { method: "POST", cookie, json: flush })).status).toBe(200);
    expect(await dayStats(anna, "2026-10-11")).toMatchObject({ cards: 4, seconds: 30 });

    // A new id is a new flush.
    await api("/api/study/activity", { method: "POST", cookie, json: { ...flush, id: "flush-0002" } });
    expect(await dayStats(anna, "2026-10-11")).toMatchObject({ cards: 8, seconds: 60 });
  });

  it("a retry moves neither the streak day nor the recently used set", async () => {
    const { id: anna, cookie } = await signedIn("anna");
    const { id: setId } = await addSet(anna, "Spanish");
    const flush = { day: "2026-10-11", cards: 2, setId, mode: "learn" as const, id: "flush-0003" };
    await api("/api/study/activity", { method: "POST", cookie, json: flush });
    await env.DB.prepare("DELETE FROM study_days WHERE user_id = ?").bind(anna).run();
    await env.DB.prepare("UPDATE set_activity SET last_mode = 'test' WHERE user_id = ?").bind(anna).run();

    await api("/api/study/activity", { method: "POST", cookie, json: flush });
    const days = await env.DB.prepare("SELECT COUNT(*) AS n FROM study_days WHERE user_id = ?").bind(anna).first();
    expect(days).toEqual({ n: 0 });
    const last = await env.DB.prepare("SELECT last_mode FROM set_activity WHERE user_id = ?").bind(anna).first();
    expect(last).toEqual({ last_mode: "test" });
  });

  it("flush ids are per user, and old ones are forgotten", async () => {
    const { id: anna, cookie: annaCookie } = await signedIn("anna");
    const { id: ben, cookie: benCookie } = await signedIn("ben");
    const flush = { day: "2026-10-11", cards: 1, id: "same-id-01" };
    await api("/api/study/activity", { method: "POST", cookie: annaCookie, json: flush });
    await api("/api/study/activity", { method: "POST", cookie: benCookie, json: flush });
    expect(await dayStats(anna, "2026-10-11")).toMatchObject({ cards: 1 });
    expect(await dayStats(ben, "2026-10-11")).toMatchObject({ cards: 1 });

    // A week-old id goes with Anna's next flush.
    await env.DB.prepare("UPDATE activity_flushes SET created_at = unixepoch() - 8 * 86400 WHERE user_id = ?")
      .bind(anna)
      .run();
    // About one flush in 16 prunes, by the server's dice: this one does.
    vi.spyOn(Math, "random").mockReturnValue(0);
    await api("/api/study/activity", { method: "POST", cookie: annaCookie, json: { ...flush, id: "next-id-01" } });
    vi.restoreAllMocks();
    const ids = await env.DB.prepare("SELECT id FROM activity_flushes WHERE user_id = ?").bind(anna).all();
    expect(ids.results).toEqual([{ id: "next-id-01" }]);
  });

  it("flush ids stay out of the export", async () => {
    const { id: anna, cookie } = await signedIn("anna");
    await api("/api/study/activity", {
      method: "POST",
      cookie,
      json: { day: "2026-10-11", cards: 1, id: "flush-0001" },
    });
    expect(await exportUserData(env.DB, anna)).not.toHaveProperty("activity_flushes");
  });
});
