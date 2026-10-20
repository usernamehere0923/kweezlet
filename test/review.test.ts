// The review queue: which terms are due again, for the user and nobody else.
// The schedule table itself is in worker/schedule.ts and checked here too.
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { INTERVAL_DAYS, intervalDays } from "../worker/schedule";
import { addSet, addTerm } from "./fixtures";
import { addUser, api, signedIn } from "./helpers";

/** review_step, and days until due (rounded) right now. */
async function schedule(termId: number) {
  const row = await env.DB.prepare(
    "SELECT review_step AS step, ROUND((due_at - unixepoch()) / 86400.0, 1) AS days FROM term_stats WHERE term_id = ?",
  )
    .bind(termId)
    .first<{ step: number; days: number }>();
  return row!;
}

function answer(termId: number, cookie: string, correct: boolean) {
  return api(`/api/terms/${termId}/answer`, { method: "POST", cookie, json: { correct } });
}

describe("the schedule", () => {
  it("waits longer on every review step", () => {
    expect(INTERVAL_DAYS).toEqual([1, 2, 4, 7, 14, 30]);
    expect(intervalDays(0)).toBe(1);
    expect(intervalDays(1)).toBe(2);
    expect(intervalDays(3)).toBe(7);
    expect(intervalDays(9)).toBe(30);
    expect(intervalDays(-3)).toBe(1);
  });

  it("a new term learned in one go comes back tomorrow", async () => {
    const { id: anna, cookie } = await signedIn("anna");
    const { id: set } = await addSet(anna, "Spanish animals");
    const perro = await addTerm(anna, set, "el perro", 0, null);

    // Learn asks until two in a row; studying anyway adds two more.
    for (let i = 0; i < 4; i++) expect((await answer(perro, cookie, true)).status).toBe(200);
    expect(await schedule(perro)).toEqual({ step: 1, days: 1 });
  });

  it("answering before the term is due changes nothing", async () => {
    const { id: anna, cookie } = await signedIn("anna");
    const { id: set } = await addSet(anna, "Spanish animals");
    const perro = await addTerm(anna, set, "el perro", 0, { step: 2, dueInDays: 3 });

    await answer(perro, cookie, true);
    expect(await schedule(perro)).toEqual({ step: 2, days: 3 });
  });

  it("a due term answered right moves one step up, wrong starts over", async () => {
    const { id: anna, cookie } = await signedIn("anna");
    const { id: set } = await addSet(anna, "Spanish animals");
    const perro = await addTerm(anna, set, "el perro", 0, { step: 2, dueInDays: -1 });
    const gato = await addTerm(anna, set, "el gato", 1, { step: 4, dueInDays: -1 });

    await answer(perro, cookie, true);
    expect(await schedule(perro)).toEqual({ step: 3, days: 4 });
    // Right again at once: not due any more, so no further step.
    await answer(perro, cookie, true);
    expect(await schedule(perro)).toEqual({ step: 3, days: 4 });

    await answer(gato, cookie, false);
    expect(await schedule(gato)).toEqual({ step: 0, days: 1 });
  });

  it("every step waits as long as the table says (SQL and table agree)", async () => {
    const { id: anna, cookie } = await signedIn("anna");
    const { id: set } = await addSet(anna, "Spanish animals");
    for (const step of [-1, ...INTERVAL_DAYS.keys(), INTERVAL_DAYS.length + 3]) {
      const id = await addTerm(anna, set, `step ${step}`, step + 10, { step, dueInDays: -1, streak: 0 });
      await answer(id, cookie, true);
      expect((await schedule(id)).days, `step ${step}`).toBe(intervalDays(step));
    }
  });
});

describe("GET /api/review", () => {
  it("lists only my answered terms that are due, longest overdue first", async () => {
    const { id: anna, cookie } = await signedIn("anna");
    const ben = await addUser("ben", "secret-pw");
    const { id: animals } = await addSet(anna, "Spanish animals");
    const { id: history } = await addSet(anna, "Swiss history");
    await addTerm(anna, animals, "el perro", 0, null); // never answered: Learn's job
    await addTerm(anna, animals, "el gato", 1, { step: 1, dueInDays: -1 });
    await addTerm(anna, animals, "el pez", 2, { step: 0, dueInDays: 1 }); // not yet
    await addTerm(anna, history, "1291", 0, { step: 2, dueInDays: -5 });
    const { id: benSet } = await addSet(ben, "Ben set");
    await addTerm(ben, benSet, "ben term", 0, { step: 0, dueInDays: -9 });

    const res = await api("/api/review", { cookie });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      dueCount: 2,
      cards: [
        expect.objectContaining({ term: "1291", streak: 2, setId: history, setTitle: "Swiss history" }),
        expect.objectContaining({ term: "el gato", streak: 1, setId: animals, setTitle: "Spanish animals" }),
      ],
    });
  });

  it("caps the cards but counts them all", async () => {
    const { id: anna, cookie } = await signedIn("anna");
    const { id: set } = await addSet(anna, "Spanish animals");
    for (let i = 0; i < 3; i++) await addTerm(anna, set, `term ${i}`, i, { step: 0, dueInDays: -1 });

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
    const { cookie } = await signedIn("anna");
    for (const limit of ["0", "101", "abc"]) {
      const res = await api(`/api/review?limit=${limit}`, { cookie });
      expect(res.status, `limit ${limit}`).toBe(400);
      expect(await res.json()).toMatchObject({ error: "validation", fields: { limit: expect.any(String) } });
    }
  });
});
