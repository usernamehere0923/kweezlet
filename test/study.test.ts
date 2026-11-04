// Study progress: how a user marked and answered each term.
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { exportUserData } from "../worker/export";
import { addSet } from "./fixtures";
import { addUser, api, signedIn } from "./helpers";

/** A set with the one term "hola". */
async function addHola(userId: number) {
  const { id, termIds } = await addSet(userId, "Set", { terms: [["hola", "hello"]] });
  return { setId: id, termId: termIds[0] };
}

describe("study progress", () => {
  it("is part of the user's export", async () => {
    const anna = await addUser("anna", "secret-pw");
    const { setId, termId } = await addHola(anna);
    await env.DB.prepare(
      "INSERT INTO term_state (user_id, term_id, set_id, status, starred) VALUES (?, ?, ?, 'know_it', 1)",
    )
      .bind(anna, termId, setId)
      .run();
    await env.DB.prepare(
      "INSERT INTO term_stats (user_id, term_id, set_id, correct, wrong, streak) VALUES (?, ?, ?, 2, 1, 2)",
    )
      .bind(anna, termId, setId)
      .run();
    await env.DB.prepare("INSERT INTO study_days (user_id, day) VALUES (?, '2026-10-11')").bind(anna).run();

    const data = await exportUserData(env.DB, anna);
    expect(data.term_state).toEqual([expect.objectContaining({ status: "know_it", starred: 1 })]);
    expect(data.term_stats).toEqual([expect.objectContaining({ correct: 2, wrong: 1, streak: 2 })]);
    expect(data.study_days).toEqual([expect.objectContaining({ day: "2026-10-11" })]);
  });
});

describe("PATCH /api/terms/:id/state", () => {
  it("marks a term, and starring keeps the mark", async () => {
    const { id: anna, cookie } = await signedIn("anna");
    const { setId, termId } = await addHola(anna);

    let res = await api(`/api/terms/${termId}/state`, { method: "PATCH", cookie, json: { status: "know_it" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ termId, status: "know_it", starred: false });

    res = await api(`/api/terms/${termId}/state`, { method: "PATCH", cookie, json: { starred: true } });
    expect(await res.json()).toEqual({ termId, status: "know_it", starred: true });

    // The set detail carries the state along with the terms.
    const detail = (await (await api(`/api/sets/${setId}`, { cookie })).json()) as {
      terms: { status: string; starred: boolean }[];
    };
    expect(detail.terms[0]).toEqual(expect.objectContaining({ status: "know_it", starred: true }));
  });

  it("another user's term is a 404", async () => {
    const { cookie } = await signedIn("anna");
    const ben = await addUser("ben", "secret-pw");
    const { termId } = await addHola(ben);

    const res = await api(`/api/terms/${termId}/state`, { method: "PATCH", cookie, json: { status: "know_it" } });
    expect(res.status).toBe(404);
  });

  it("clearing a mark puts the term back to unseen", async () => {
    const { id: anna, cookie } = await signedIn("anna");
    const { termId } = await addHola(anna);

    await api(`/api/terms/${termId}/state`, { method: "PATCH", cookie, json: { status: "know_it", starred: true } });
    let res = await api(`/api/terms/${termId}/state`, { method: "PATCH", cookie, json: { status: null } });
    expect(await res.json()).toEqual({ termId, status: "unseen", starred: true });

    res = await api(`/api/terms/${termId}/state`, { method: "PATCH", cookie, json: { starred: null } });
    expect(await res.json()).toEqual({ termId, status: "unseen", starred: false });
  });
});

describe("POST /api/terms/:id/answer", () => {
  it("two correct answers in a row learn the term", async () => {
    const { id: anna, cookie } = await signedIn("anna");
    const { setId, termId } = await addHola(anna);

    // One correct answer is not enough to say "I know it".
    let res = await api(`/api/terms/${termId}/answer`, {
      method: "POST",
      cookie,
      json: { correct: true, day: "2026-10-11" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ termId, correct: 1, wrong: 0, streak: 1, status: "unseen" });

    res = await api(`/api/terms/${termId}/answer`, {
      method: "POST",
      cookie,
      json: { correct: true, day: "2026-10-11" },
    });
    expect(await res.json()).toEqual({ termId, correct: 2, wrong: 0, streak: 2, status: "know_it" });

    // The set detail carries the same numbers to the Learn screen.
    const detail = (await (await api(`/api/sets/${setId}`, { cookie })).json()) as {
      terms: { streak: number; status: string }[];
    };
    expect(detail.terms[0]).toEqual(expect.objectContaining({ streak: 2, status: "know_it" }));
  });

  it("two answers sent at the same time both count", async () => {
    const { id: anna, cookie } = await signedIn("anna");
    const { termId } = await addHola(anna);

    await Promise.all([
      api(`/api/terms/${termId}/answer`, { method: "POST", cookie, json: { correct: true, day: "2026-10-11" } }),
      api(`/api/terms/${termId}/answer`, { method: "POST", cookie, json: { correct: true, day: "2026-10-11" } }),
    ]);
    const res = await api(`/api/terms/${termId}/answer`, {
      method: "POST",
      cookie,
      json: { correct: true, day: "2026-10-11" },
    });
    expect(await res.json()).toEqual({ termId, correct: 3, wrong: 0, streak: 3, status: "know_it" });
  });

  it("a wrong answer resets the streak and drops the mark", async () => {
    const { id: anna, cookie } = await signedIn("anna");
    const { termId } = await addHola(anna);
    await api(`/api/terms/${termId}/answer`, { method: "POST", cookie, json: { correct: true, day: "2026-10-11" } });
    await api(`/api/terms/${termId}/answer`, { method: "POST", cookie, json: { correct: true, day: "2026-10-11" } });

    const res = await api(`/api/terms/${termId}/answer`, {
      method: "POST",
      cookie,
      json: { correct: false, day: "2026-10-11" },
    });
    expect(await res.json()).toEqual({ termId, correct: 2, wrong: 1, streak: 0, status: "still_learning" });
  });

  it("one correct answer leaves the user's own mark alone", async () => {
    const { id: anna, cookie } = await signedIn("anna");
    const { termId } = await addHola(anna);
    await api(`/api/terms/${termId}/state`, { method: "PATCH", cookie, json: { status: "still_learning" } });

    const res = await api(`/api/terms/${termId}/answer`, {
      method: "POST",
      cookie,
      json: { correct: true, day: "2026-10-11" },
    });
    expect(await res.json()).toEqual({ termId, correct: 1, wrong: 0, streak: 1, status: "still_learning" });
  });

  it("another user's term is a 404", async () => {
    const { cookie } = await signedIn("anna");
    const ben = await addUser("ben", "secret-pw");
    const { termId } = await addHola(ben);

    const res = await api(`/api/terms/${termId}/answer`, {
      method: "POST",
      cookie,
      json: { correct: true, day: "2026-10-11" },
    });
    expect(res.status).toBe(404);
    const written = await env.DB.prepare("SELECT COUNT(*) AS n FROM term_stats").first<{ n: number }>();
    expect(written!.n).toBe(0);
  });

  it("correct has to be a yes or a no", async () => {
    const { id: anna, cookie } = await signedIn("anna");
    const { termId } = await addHola(anna);

    const res = await api(`/api/terms/${termId}/answer`, {
      method: "POST",
      cookie,
      json: { correct: "yes", day: "2026-10-11" },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "validation", fields: { correct: "invalid_type" } });
  });

  it("a day that is not a day is a validation error", async () => {
    const { id: anna, cookie } = await signedIn("anna");
    const { termId } = await addHola(anna);

    const res = await api(`/api/terms/${termId}/answer`, {
      method: "POST",
      cookie,
      json: { correct: true, day: "2026-02-31" },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "validation", fields: { day: "custom" } });
  });
});

describe("answers count into the day's statistics", () => {
  async function dayStats(userId: number, day: string) {
    return env.DB.prepare("SELECT * FROM day_stats WHERE user_id = ? AND day = ?").bind(userId, day).first();
  }

  it("each answer is one card, learned when it reaches mastery", async () => {
    const { id: anna, cookie } = await signedIn("anna");
    const { termId } = await addHola(anna);

    await api(`/api/terms/${termId}/answer`, { method: "POST", cookie, json: { correct: true, day: "2026-10-11" } });
    expect(await dayStats(anna, "2026-10-11")).toMatchObject({ cards: 1, correct: 1, wrong: 0, learned: 0 });

    // The second correct answer in a row learns the term, on the same day.
    await api(`/api/terms/${termId}/answer`, { method: "POST", cookie, json: { correct: true, day: "2026-10-11" } });
    expect(await dayStats(anna, "2026-10-11")).toMatchObject({ cards: 2, correct: 2, wrong: 0, learned: 1 });

    // A wrong answer is a card studied too; learning again takes two more.
    await api(`/api/terms/${termId}/answer`, { method: "POST", cookie, json: { correct: false, day: "2026-10-11" } });
    expect(await dayStats(anna, "2026-10-11")).toMatchObject({ cards: 3, correct: 2, wrong: 1, learned: 1 });
    await api(`/api/terms/${termId}/answer`, { method: "POST", cookie, json: { correct: true, day: "2026-10-11" } });
    await api(`/api/terms/${termId}/answer`, { method: "POST", cookie, json: { correct: true, day: "2026-10-11" } });
    expect(await dayStats(anna, "2026-10-11")).toMatchObject({ cards: 5, correct: 4, wrong: 1, learned: 2 });
  });

  it("the answer counts on the client's day, whatever day the server sees", async () => {
    const { id: anna, cookie } = await signedIn("anna");
    const { termId } = await addHola(anna);

    await api(`/api/terms/${termId}/answer`, { method: "POST", cookie, json: { correct: true, day: "2026-12-31" } });
    expect(await dayStats(anna, "2026-12-31")).toMatchObject({ cards: 1 });
  });

  it("a term that isn't mine counts for nobody", async () => {
    const { cookie } = await signedIn("anna");
    const ben = await addUser("ben", "secret-pw");
    const { termId } = await addHola(ben);

    const res = await api(`/api/terms/${termId}/answer`, {
      method: "POST",
      cookie,
      json: { correct: true, day: "2026-10-11" },
    });
    expect(res.status).toBe(404);
    const { results } = await env.DB.prepare("SELECT * FROM day_stats").all();
    expect(results).toEqual([]);
  });
});
