// Study progress: how a user marked each term, and the days they studied.
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { exportUserData } from "../worker/export";
import { addUser, api, login } from "./helpers";

async function addSetWithTerm(userId: number) {
  await env.DB.prepare("INSERT INTO sets (user_id, title) VALUES (?, 'Set')").bind(userId).run();
  const set = await env.DB.prepare("SELECT id FROM sets WHERE user_id = ?").bind(userId).first<{ id: number }>();
  await env.DB.prepare(
    "INSERT INTO terms (user_id, set_id, term, definition, position) VALUES (?, ?, 'hola', 'hello', 0)",
  )
    .bind(userId, set!.id)
    .run();
  const term = await env.DB.prepare("SELECT id FROM terms WHERE user_id = ?").bind(userId).first<{ id: number }>();
  return { setId: set!.id, termId: term!.id };
}

describe("study progress", () => {
  it("is part of the user's export", async () => {
    const anna = await addUser("anna", "secret-pw");
    const { setId, termId } = await addSetWithTerm(anna);
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
    const anna = await addUser("anna", "secret-pw");
    const { setId, termId } = await addSetWithTerm(anna);
    const cookie = await login("anna", "secret-pw");

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
    await addUser("anna", "secret-pw");
    const ben = await addUser("ben", "secret-pw");
    const { termId } = await addSetWithTerm(ben);
    const cookie = await login("anna", "secret-pw");

    const res = await api(`/api/terms/${termId}/state`, { method: "PATCH", cookie, json: { status: "know_it" } });
    expect(res.status).toBe(404);
  });

  it("clearing a mark puts the term back to unseen", async () => {
    const anna = await addUser("anna", "secret-pw");
    const { termId } = await addSetWithTerm(anna);
    const cookie = await login("anna", "secret-pw");

    await api(`/api/terms/${termId}/state`, { method: "PATCH", cookie, json: { status: "know_it", starred: true } });
    let res = await api(`/api/terms/${termId}/state`, { method: "PATCH", cookie, json: { status: null } });
    expect(await res.json()).toEqual({ termId, status: "unseen", starred: true });

    res = await api(`/api/terms/${termId}/state`, { method: "PATCH", cookie, json: { starred: null } });
    expect(await res.json()).toEqual({ termId, status: "unseen", starred: false });
  });
});

describe("POST /api/terms/:id/answer", () => {
  it("two correct answers in a row learn the term", async () => {
    const anna = await addUser("anna", "secret-pw");
    const { setId, termId } = await addSetWithTerm(anna);
    const cookie = await login("anna", "secret-pw");

    // One correct answer is not enough to say "I know it".
    let res = await api(`/api/terms/${termId}/answer`, { method: "POST", cookie, json: { correct: true } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ termId, correct: 1, wrong: 0, streak: 1, status: "unseen" });

    res = await api(`/api/terms/${termId}/answer`, { method: "POST", cookie, json: { correct: true } });
    expect(await res.json()).toEqual({ termId, correct: 2, wrong: 0, streak: 2, status: "know_it" });

    // The set detail carries the same numbers to the Learn screen.
    const detail = (await (await api(`/api/sets/${setId}`, { cookie })).json()) as {
      terms: { streak: number; status: string }[];
    };
    expect(detail.terms[0]).toEqual(expect.objectContaining({ streak: 2, status: "know_it" }));
  });

  it("two answers sent at the same time both count", async () => {
    const anna = await addUser("anna", "secret-pw");
    const { termId } = await addSetWithTerm(anna);
    const cookie = await login("anna", "secret-pw");

    await Promise.all([
      api(`/api/terms/${termId}/answer`, { method: "POST", cookie, json: { correct: true } }),
      api(`/api/terms/${termId}/answer`, { method: "POST", cookie, json: { correct: true } }),
    ]);
    const res = await api(`/api/terms/${termId}/answer`, { method: "POST", cookie, json: { correct: true } });
    expect(await res.json()).toEqual({ termId, correct: 3, wrong: 0, streak: 3, status: "know_it" });
  });

  it("a wrong answer resets the streak and drops the mark", async () => {
    const anna = await addUser("anna", "secret-pw");
    const { termId } = await addSetWithTerm(anna);
    const cookie = await login("anna", "secret-pw");
    await api(`/api/terms/${termId}/answer`, { method: "POST", cookie, json: { correct: true } });
    await api(`/api/terms/${termId}/answer`, { method: "POST", cookie, json: { correct: true } });

    const res = await api(`/api/terms/${termId}/answer`, { method: "POST", cookie, json: { correct: false } });
    expect(await res.json()).toEqual({ termId, correct: 2, wrong: 1, streak: 0, status: "still_learning" });
  });

  it("one correct answer leaves the user's own mark alone", async () => {
    const anna = await addUser("anna", "secret-pw");
    const { termId } = await addSetWithTerm(anna);
    const cookie = await login("anna", "secret-pw");
    await api(`/api/terms/${termId}/state`, { method: "PATCH", cookie, json: { status: "still_learning" } });

    const res = await api(`/api/terms/${termId}/answer`, { method: "POST", cookie, json: { correct: true } });
    expect(await res.json()).toEqual({ termId, correct: 1, wrong: 0, streak: 1, status: "still_learning" });
  });

  it("another user's term is a 404", async () => {
    await addUser("anna", "secret-pw");
    const ben = await addUser("ben", "secret-pw");
    const { termId } = await addSetWithTerm(ben);
    const cookie = await login("anna", "secret-pw");

    const res = await api(`/api/terms/${termId}/answer`, { method: "POST", cookie, json: { correct: true } });
    expect(res.status).toBe(404);
    const written = await env.DB.prepare("SELECT COUNT(*) AS n FROM term_stats").first<{ n: number }>();
    expect(written!.n).toBe(0);
  });

  it("correct has to be a yes or a no", async () => {
    const anna = await addUser("anna", "secret-pw");
    const { termId } = await addSetWithTerm(anna);
    const cookie = await login("anna", "secret-pw");

    const res = await api(`/api/terms/${termId}/answer`, { method: "POST", cookie, json: { correct: "yes" } });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "validation", fields: { correct: "invalid_type" } });
  });
});

describe("POST /api/study/day", () => {
  it("counts the days in a row up to today", async () => {
    const anna = await addUser("anna", "secret-pw");
    const cookie = await login("anna", "secret-pw");
    await env.DB.prepare("INSERT INTO study_days (user_id, day) VALUES (?, '2026-10-10'), (?, '2026-10-09')")
      .bind(anna, anna)
      .run();

    const res = await api("/api/study/day", { method: "POST", cookie, json: { day: "2026-10-11" } });
    expect(await res.json()).toEqual({ streak: 3 });

    // A second round on the same day does not count twice.
    const again = await api("/api/study/day", { method: "POST", cookie, json: { day: "2026-10-11" } });
    expect(await again.json()).toEqual({ streak: 3 });
  });

  it("a missed day starts a new streak", async () => {
    const anna = await addUser("anna", "secret-pw");
    const cookie = await login("anna", "secret-pw");
    await env.DB.prepare("INSERT INTO study_days (user_id, day) VALUES (?, '2026-10-01')").bind(anna).run();

    const res = await api("/api/study/day", { method: "POST", cookie, json: { day: "2026-10-11" } });
    expect(await res.json()).toEqual({ streak: 1 });
  });

  it("the streak survives the turn of the year", async () => {
    const anna = await addUser("anna", "secret-pw");
    const cookie = await login("anna", "secret-pw");
    await env.DB.prepare("INSERT INTO study_days (user_id, day) VALUES (?, '2026-12-31')").bind(anna).run();

    const res = await api("/api/study/day", { method: "POST", cookie, json: { day: "2027-01-01" } });
    expect(await res.json()).toEqual({ streak: 2 });
  });

  it("a day that is not a day is a validation error", async () => {
    await addUser("anna", "secret-pw");
    const cookie = await login("anna", "secret-pw");

    const res = await api("/api/study/day", { method: "POST", cookie, json: { day: "yesterday" } });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "validation", fields: { day: "invalid_format" } });
  });

  it("impossible days never reach the streak", async () => {
    const anna = await addUser("anna", "secret-pw");
    const cookie = await login("anna", "secret-pw");

    for (const day of ["2026-02-31", "2026-13-01", "2026-00-10"]) {
      const res = await api("/api/study/day", { method: "POST", cookie, json: { day } });
      expect(res.status, day).toBe(400);
    }
    const { results } = await env.DB.prepare("SELECT day FROM study_days WHERE user_id = ?").bind(anna).all();
    expect(results).toEqual([]);
  });
});
