// The study-day streak: the days in a row a user studied.
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { addUser, api, signedIn } from "./helpers";

describe("POST /api/study/day", () => {
  it("counts the days in a row up to today", async () => {
    const { id: anna, cookie } = await signedIn("anna");
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
    const { id: anna, cookie } = await signedIn("anna");
    await env.DB.prepare("INSERT INTO study_days (user_id, day) VALUES (?, '2026-10-01')").bind(anna).run();

    const res = await api("/api/study/day", { method: "POST", cookie, json: { day: "2026-10-11" } });
    expect(await res.json()).toEqual({ streak: 1 });
  });

  it("the streak survives the turn of the year", async () => {
    const { id: anna, cookie } = await signedIn("anna");
    await env.DB.prepare("INSERT INTO study_days (user_id, day) VALUES (?, '2026-12-31')").bind(anna).run();

    const res = await api("/api/study/day", { method: "POST", cookie, json: { day: "2027-01-01" } });
    expect(await res.json()).toEqual({ streak: 2 });
  });

  it("a later day already stored does not break the streak up to this one", async () => {
    // A second device in another timezone can already be on the next day.
    const { id: anna, cookie } = await signedIn("anna");
    await env.DB.prepare("INSERT INTO study_days (user_id, day) VALUES (?, '2026-10-12'), (?, '2026-10-10')")
      .bind(anna, anna)
      .run();

    const res = await api("/api/study/day", { method: "POST", cookie, json: { day: "2026-10-11" } });
    expect(await res.json()).toEqual({ streak: 2 });
  });

  it("a day that is not a day is a validation error", async () => {
    const { cookie } = await signedIn("anna");

    const res = await api("/api/study/day", { method: "POST", cookie, json: { day: "yesterday" } });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "validation", fields: { day: "invalid_format" } });
  });

  it("impossible days never reach the streak", async () => {
    const { id: anna, cookie } = await signedIn("anna");

    for (const day of ["2026-02-31", "2026-13-01", "2026-00-10"]) {
      const res = await api("/api/study/day", { method: "POST", cookie, json: { day } });
      expect(res.status, day).toBe(400);
    }
    const { results } = await env.DB.prepare("SELECT day FROM study_days WHERE user_id = ?").bind(anna).all();
    expect(results).toEqual([]);
  });
});

describe("GET /api/study/streak", () => {
  async function streak(day: string, cookie: string) {
    const res = await api(`/api/study/streak?day=${day}`, { cookie });
    expect(res.status).toBe(200);
    return res.json();
  }

  it("counts up to today once today is studied", async () => {
    const { id: anna, cookie } = await signedIn("anna");
    await env.DB.prepare("INSERT INTO study_days (user_id, day) VALUES (?, '2026-10-11'), (?, '2026-10-10')")
      .bind(anna, anna)
      .run();
    expect(await streak("2026-10-11", cookie)).toEqual({ streak: 2, studiedToday: true });
  });

  it("before studying today, the run up to yesterday still counts", async () => {
    const { id: anna, cookie } = await signedIn("anna");
    await env.DB.prepare("INSERT INTO study_days (user_id, day) VALUES (?, '2026-10-10'), (?, '2026-10-09')")
      .bind(anna, anna)
      .run();
    expect(await streak("2026-10-11", cookie)).toEqual({ streak: 2, studiedToday: false });
  });

  it("a missed day ends it, and other users' days don't count", async () => {
    const { id: anna, cookie } = await signedIn("anna");
    const ben = await addUser("ben", "secret-pw");
    await env.DB.prepare("INSERT INTO study_days (user_id, day) VALUES (?, '2026-10-09'), (?, '2026-10-10')")
      .bind(anna, ben)
      .run();
    expect(await streak("2026-10-11", cookie)).toEqual({ streak: 0, studiedToday: false });
  });

  it("a day that is not a day is a validation error", async () => {
    const { cookie } = await signedIn("anna");
    const res = await api("/api/study/streak?day=2026-02-31", { cookie });
    expect(res.status).toBe(400);
  });
});
