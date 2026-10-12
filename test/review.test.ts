// The review queue: which terms are due again, for the user and nobody else.
// The schedule table itself is in worker/shared.ts and checked here too.
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { INTERVAL_DAYS, intervalDays, isDue } from "../worker/shared";
import { addUser, api, login } from "./helpers";

async function addSet(userId: number, title: string): Promise<number> {
  const row = await env.DB.prepare("INSERT INTO sets (user_id, title) VALUES (?, ?) RETURNING id")
    .bind(userId, title)
    .first<{ id: number }>();
  return row!.id;
}

/** A term, optionally with an answer history: `streak` correct, last seen `seenDaysAgo` days ago. */
async function addTerm(
  userId: number,
  setId: number,
  term: string,
  position: number,
  history: { streak: number; seenDaysAgo: number } | null,
) {
  const row = await env.DB.prepare(
    "INSERT INTO terms (user_id, set_id, term, definition, position) VALUES (?, ?, ?, ?, ?) RETURNING id",
  )
    .bind(userId, setId, term, `the ${term}`, position)
    .first<{ id: number }>();
  if (history) {
    await env.DB.prepare(
      "INSERT INTO term_stats (user_id, term_id, set_id, correct, wrong, streak, last_seen_at) VALUES (?, ?, ?, ?, 0, ?, unixepoch() - ? * 86400)",
    )
      .bind(userId, row!.id, setId, history.streak, history.streak, history.seenDaysAgo)
      .run();
  }
  return row!.id;
}

describe("the schedule", () => {
  it("waits longer after every correct answer in a row", () => {
    expect(INTERVAL_DAYS).toEqual([1, 2, 4, 7, 14, 30]);
    expect(intervalDays(0)).toBe(1);
    expect(intervalDays(1)).toBe(2);
    expect(intervalDays(3)).toBe(7);
    expect(intervalDays(9)).toBe(30);
    expect(intervalDays(-3)).toBe(1);
  });

  it("is due when the interval has elapsed, not a moment earlier", () => {
    const now = 1_000_000_000;
    expect(isDue(null, 0, now)).toBe(true); // never answered: due at once
    expect(isDue(now - 86_400, 0, now)).toBe(true); // interval 1 day, exactly
    expect(isDue(now - 86_399, 0, now)).toBe(false);
    expect(isDue(now - 86_400, 1, now)).toBe(false); // interval 2 days
    expect(isDue(now - 3 * 86_400, 1, now)).toBe(true);
  });
});

describe("GET /api/review", () => {
  it("lists only my due terms, longest unseen first", async () => {
    const anna = await addUser("anna", "secret-pw");
    const ben = await addUser("ben", "secret-pw");
    const animals = await addSet(anna, "Spanish animals");
    const history = await addSet(anna, "Swiss history");
    await addTerm(anna, animals, "el perro", 0, null); // never answered
    await addTerm(anna, animals, "el gato", 1, { streak: 1, seenDaysAgo: 10 });
    await addTerm(anna, animals, "el pez", 2, { streak: 0, seenDaysAgo: 0 }); // just answered
    await addTerm(anna, history, "1291", 0, { streak: 2, seenDaysAgo: 3 }); // interval 4, not due
    const benSet = await addSet(ben, "Ben set");
    await addTerm(ben, benSet, "ben term", 0, null);

    const res = await api("/api/review", { cookie: await login("anna", "secret-pw") });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      dueCount: 2,
      cards: [
        expect.objectContaining({ term: "el perro", streak: 0, setId: animals, setTitle: "Spanish animals" }),
        expect.objectContaining({ term: "el gato", streak: 1, setId: animals }),
      ],
    });
  });

  it("waits longer with every correct answer in a row (SQL and table agree)", async () => {
    const anna = await addUser("anna", "secret-pw");
    const set = await addSet(anna, "Spanish animals");
    for (const [streak, days] of INTERVAL_DAYS.entries()) {
      await addTerm(anna, set, `s${streak} waiting`, streak * 2, { streak, seenDaysAgo: days - 1 });
    }
    const cookie = await login("anna", "secret-pw");
    const res = await api("/api/review", { cookie });
    expect(((await res.json()) as { dueCount: number }).dueCount).toBe(0);

    // One more day and each of them turns due.
    for (const [streak, days] of INTERVAL_DAYS.entries()) {
      await addTerm(anna, set, `s${streak} due`, streak * 2 + 1, { streak, seenDaysAgo: days + 1 });
    }
    const now = await api("/api/review", { cookie });
    expect(((await now.json()) as { dueCount: number }).dueCount).toBe(INTERVAL_DAYS.length);
  });

  it("caps the cards but counts them all", async () => {
    const anna = await addUser("anna", "secret-pw");
    const set = await addSet(anna, "Spanish animals");
    for (let i = 0; i < 3; i++) await addTerm(anna, set, `term ${i}`, i, null);
    const cookie = await login("anna", "secret-pw");

    const res = await api("/api/review?limit=2", { cookie });
    const body = (await res.json()) as { cards: unknown[]; dueCount: number };
    expect(body.cards).toHaveLength(2);
    expect(body.dueCount).toBe(3);
  });

  it("needs a login", async () => {
    const res = await api("/api/review");
    expect(res.status).toBe(401);
  });

  it("a limit that makes no sense is a validation error", async () => {
    await addUser("anna", "secret-pw");
    const cookie = await login("anna", "secret-pw");
    for (const limit of ["0", "101", "abc"]) {
      const res = await api(`/api/review?limit=${limit}`, { cookie });
      expect(res.status, `limit ${limit}`).toBe(400);
      expect(await res.json()).toMatchObject({ error: "validation", fields: { limit: expect.any(String) } });
    }
  });

  it("the set detail knows which terms are due", async () => {
    const anna = await addUser("anna", "secret-pw");
    const set = await addSet(anna, "Spanish animals");
    await addTerm(anna, set, "el perro", 0, null);
    await addTerm(anna, set, "el gato", 1, { streak: 2, seenDaysAgo: 0 });
    const cookie = await login("anna", "secret-pw");

    const res = await api(`/api/sets/${set}`, { cookie });
    expect(((await res.json()) as { terms: unknown[] }).terms).toEqual([
      expect.objectContaining({ term: "el perro", due: true }),
      expect.objectContaining({ term: "el gato", due: false }),
    ]);
  });
});
