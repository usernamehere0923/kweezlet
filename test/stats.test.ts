// The Statistics page's numbers and series (GET /api/stats) and what Home
// shows what "quick resume" continues (GET /api/stats/recent).
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import type { RecentStats, Stats } from "../worker/stats";
import { addSet } from "./fixtures";
import { addUser, api, signedIn } from "./helpers";

type DayCounts = { cards: number; correct: number; wrong: number; learned: number; seconds: number };

async function addActivity(userId: number, day: string, counts: Partial<DayCounts> = {}) {
  const { cards = 0, correct = 0, wrong = 0, learned = 0, seconds = 0 } = counts;
  await env.DB.prepare(
    "INSERT INTO day_stats (user_id, day, cards, correct, wrong, learned, seconds) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(userId, day, cards, correct, wrong, learned, seconds)
    .run();
}

describe("GET /api/stats", () => {
  it("an empty account is zeros all round", async () => {
    const { cookie } = await signedIn("anna");

    const res = await api("/api/stats?day=2026-10-11&days=3", { cookie });
    expect(res.status).toBe(200);
    const stats = await res.json();
    expect(stats).toEqual({
      sets: 0,
      cards: 0,
      learningRate: 0,
      streak: 0,
      learnedToday: 0,
      totalSeconds: 0,
      learnedBefore: 0,
      days: [
        { day: "2026-10-09", cards: 0, correct: 0, wrong: 0, learned: 0, seconds: 0 },
        { day: "2026-10-10", cards: 0, correct: 0, wrong: 0, learned: 0, seconds: 0 },
        { day: "2026-10-11", cards: 0, correct: 0, wrong: 0, learned: 0, seconds: 0 },
      ],
    });
  });

  it("the series lines the days up and fills the gaps with zeros", async () => {
    const { id: anna, cookie } = await signedIn("anna");
    await addActivity(anna, "2026-10-05", { cards: 4, correct: 3, wrong: 1, seconds: 60 });
    await addActivity(anna, "2026-10-03", { cards: 2, learned: 2, seconds: 30 });
    // Before the window: only its learned count carries into the series start.
    await addActivity(anna, "2026-10-01", { learned: 4, seconds: 999 });

    const stats = (await (await api("/api/stats?day=2026-10-07&days=5", { cookie })).json()) as Stats;
    expect(stats.days).toEqual([
      { day: "2026-10-03", cards: 2, correct: 0, wrong: 0, learned: 2, seconds: 30 },
      { day: "2026-10-04", cards: 0, correct: 0, wrong: 0, learned: 0, seconds: 0 },
      { day: "2026-10-05", cards: 4, correct: 3, wrong: 1, learned: 0, seconds: 60 },
      { day: "2026-10-06", cards: 0, correct: 0, wrong: 0, learned: 0, seconds: 0 },
      { day: "2026-10-07", cards: 0, correct: 0, wrong: 0, learned: 0, seconds: 0 },
    ]);
    // The window fills its gaps; the totals count everything, this day's
    // neighbours included ("total study time", "cards learned before").
    expect(stats.learnedBefore).toBe(4);
    expect(stats.totalSeconds).toBe(1089);
    expect(stats.learnedToday).toBe(0);
  });

  it("the tiles count sets, cards, the known share and the streak", async () => {
    const { id: anna, cookie } = await signedIn("anna");
    const animals = await addSet(anna, "Animals", {
      terms: [
        ["perro", "dog"],
        ["gato", "cat"],
        ["pez", "fish"],
      ],
    });
    const history = await addSet(anna, "History", {
      terms: [
        ["1291", "Bundesbrief"],
        ["1848", "Constitution"],
      ],
    });
    // Two of the five cards are known: the learning rate is 2/5.
    await env.DB.prepare(
      "INSERT INTO term_state (user_id, term_id, set_id, status) VALUES (?, ?, ?, 'know_it'), (?, ?, ?, 'know_it')",
    )
      .bind(anna, animals.termIds[0], animals.id, anna, history.termIds[0], history.id)
      .run();
    await addActivity(anna, "2026-10-11", { learned: 3, seconds: 60 });
    await addActivity(anna, "2026-10-10", { seconds: 120 });
    await env.DB.prepare("INSERT INTO study_days (user_id, day) VALUES (?, '2026-10-11'), (?, '2026-10-10')")
      .bind(anna, anna)
      .run();

    const stats = (await (await api("/api/stats?day=2026-10-11&days=2", { cookie })).json()) as Stats;
    expect(stats).toMatchObject({
      sets: 2,
      cards: 5,
      learningRate: 0.4,
      streak: 2,
      learnedToday: 3,
      totalSeconds: 180,
    });
  });

  it("another user's rows never show", async () => {
    const { cookie } = await signedIn("anna");
    const ben = await addUser("ben", "secret-pw");
    await addSet(ben, "Ben's set", { terms: [["a", "b"]] });
    await addActivity(ben, "2026-10-11", { cards: 9, learned: 9, seconds: 999 });
    await env.DB.prepare("INSERT INTO study_days (user_id, day) VALUES (?, '2026-10-11')").bind(ben).run();

    const stats = await (await api("/api/stats?day=2026-10-11&days=1", { cookie })).json();
    expect(stats).toMatchObject({ sets: 0, cards: 0, learningRate: 0, streak: 0, learnedToday: 0, totalSeconds: 0 });
  });

  it("a day that isn't one, or a window that isn't, is a validation error", async () => {
    const { cookie } = await signedIn("anna");

    for (const query of ["day=yesterday", "day=2026-02-31", "day=2026-10-11&days=0", "day=2026-10-11&days=401", ""]) {
      const res = await api(`/api/stats?${query}`, { cookie });
      expect(res.status, query).toBe(400);
    }
  });
});

describe("GET /api/stats/recent", () => {
  it("studied newest first with its mode", async () => {
    const { id: anna, cookie } = await signedIn("anna");
    const older = await addSet(anna, "Older", {
      terms: [
        ["a", "1"],
        ["b", "2"],
      ],
    });
    const newer = await addSet(anna, "Newer");
    await env.DB.prepare(
      `INSERT INTO set_activity (user_id, set_id, last_studied_at, last_mode) VALUES
         (?, ?, unixepoch() - 600, 'learn'), (?, ?, unixepoch(), 'flashcards')`,
    )
      .bind(anna, older.id, anna, newer.id)
      .run();

    const res = await api("/api/stats/recent", { cookie });
    expect(res.status).toBe(200);
    const recent = (await res.json()) as RecentStats;
    // The first studied entry is what "quick resume" continues with.
    expect(recent.studied.map((set) => set.id)).toEqual([newer.id, older.id]);
    expect(recent.studied[0]).toMatchObject({ mode: "flashcards", lastStudiedAt: expect.any(Number), termCount: 0 });
    expect(recent.studied[1]).toMatchObject({ mode: "learn", termCount: 2 });
  });

  it("only my own sets come back", async () => {
    const { cookie } = await signedIn("anna");
    const ben = await addUser("ben", "secret-pw");
    const benSet = await addSet(ben, "Ben's set");
    await env.DB.prepare("INSERT INTO set_activity (user_id, set_id, last_mode) VALUES (?, ?, 'learn')")
      .bind(ben, benSet.id)
      .run();

    const recent = await (await api("/api/stats/recent", { cookie })).json();
    expect(recent).toEqual({ studied: [] });
  });
});
