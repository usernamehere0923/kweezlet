import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import type { DayStats, Stats } from "../../../worker/stats";
import { ME, renderApp } from "../../test/render";
import { mockApi } from "../../test/server";

const day = (day: string, cards = 0, correct = 0, wrong = 0, learned = 0, seconds = 0): DayStats => ({
  day,
  cards,
  correct,
  wrong,
  learned,
  seconds,
});

/** One Monday-to-Sunday week of history plus a bit learned before it. */
const STATS: Stats = {
  sets: 2,
  cards: 12,
  learningRate: 0.25,
  streak: 3,
  learnedToday: 4,
  totalSeconds: 7500,
  learnedBefore: 10,
  days: [
    day("2026-10-05", 5, 4, 1, 1, 600),
    day("2026-10-06", 0),
    day("2026-10-07", 8, 6, 2, 4, 900),
    day("2026-10-08", 0),
    day("2026-10-09", 3, 3, 0, 0, 300),
    day("2026-10-10", 0),
    day("2026-10-11", 0),
  ],
};

describe("statistics page", () => {
  test("shows the numbers and every chart", async () => {
    mockApi({ "GET /api/me": () => ({ json: ME }), "GET /api/stats": () => ({ json: STATS }) });
    renderApp("/stats");

    expect(await screen.findByRole("heading", { name: "Statistics" })).toBeTruthy();
    // The tiles: distinctive values, in their own words.
    expect(screen.getByText("Cards learned today")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.getByText("25%")).toBeTruthy();
    expect(screen.getByText("2h 5m")).toBeTruthy();

    // Every chart, one named picture each.
    expect(screen.getByRole("img", { name: "Cards learned per day" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Study time per day" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Correct and incorrect answers per day" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Cards learned over the last weeks" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Learning activity over the last weeks" })).toBeTruthy();
  });

  test("per week buckets the days into their weeks", async () => {
    mockApi({ "GET /api/me": () => ({ json: ME }), "GET /api/stats": () => ({ json: STATS }) });
    renderApp("/stats");
    await screen.findByRole("img", { name: "Cards learned per day" });
    // Seven days are seven bars and the baseline.
    expect(screen.getByRole("img", { name: "Cards learned per day" }).querySelectorAll("rect")).toHaveLength(8);

    await userEvent.click(screen.getByRole("radio", { name: "Per week" }));
    const weekly = screen.getByRole("img", { name: "Cards learned per week" });
    // The seven days are one week: one bar and the baseline.
    expect(weekly.querySelectorAll("rect")).toHaveLength(2);
  });

  test("the progress line carries what was learned before the window", async () => {
    mockApi({ "GET /api/me": () => ({ json: ME }), "GET /api/stats": () => ({ json: STATS }) });
    const { container } = renderApp("/stats");
    await screen.findByRole("img", { name: "Cards learned over the last weeks" });
    // 10 before the window plus the week's 5 = 15 on the week's Monday.
    const titles = [...container.querySelectorAll("title")].map((title) => title.textContent);
    expect(titles).toContain("Oct 5 · 15");
  });

  test("a failed load can be retried", async () => {
    let up = false;
    mockApi({
      "GET /api/me": () => ({ json: ME }),
      "GET /api/stats": () => (up ? { json: STATS } : { status: 500, json: {} }),
    });
    renderApp("/stats");

    expect(await screen.findByText("Couldn't load the statistics.")).toBeTruthy();
    up = true;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByText("Cards learned today")).toBeTruthy());
  });
});
