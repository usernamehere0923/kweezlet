import { describe, expect, test } from "vitest";
import { byWeek, cumulative, dayLabel, weekStart } from "./stats";

const day = (day: string, cards = 0, learned = 0) => ({ day, cards, correct: 0, wrong: 0, learned, seconds: 0 });

describe("weekStart", () => {
  test("walks back to the week's Monday", () => {
    expect(weekStart("2026-10-05")).toBe("2026-10-05"); // a Monday
    expect(weekStart("2026-10-07")).toBe("2026-10-05"); // mid-week
    expect(weekStart("2026-10-04")).toBe("2026-09-28"); // a Sunday ends the week
    expect(weekStart("2026-01-01")).toBe("2025-12-29"); // across the year
  });
});

describe("byWeek", () => {
  test("sums the days of one week and starts a new bucket on Monday", () => {
    const weeks = byWeek([
      day("2026-10-04", 3), // the old week's Sunday
      day("2026-10-05", 5, 1),
      day("2026-10-06", 7, 2),
      day("2026-10-12", 2), // the next Monday
    ]);
    expect(weeks).toEqual([
      day("2026-09-28", 3),
      { ...day("2026-10-05", 12, 3), correct: 0, wrong: 0, seconds: 0 },
      day("2026-10-12", 2),
    ]);
  });

  test("no days is no weeks", () => {
    expect(byWeek([])).toEqual([]);
  });
});

describe("cumulative", () => {
  test("adds the learned counts onto what came before the window", () => {
    expect(cumulative([day("2026-10-05", 0, 2), day("2026-10-06", 0, 3), day("2026-10-07", 0, 0)], 10)).toEqual([
      12, 15, 15,
    ]);
  });
});

describe("dayLabel", () => {
  test("is the day's date in the locale's short form", () => {
    expect(dayLabel("2026-10-05", "en")).toBe("Oct 5");
    expect(dayLabel("2026-10-05", "de-CH")).toBe("5. Okt.");
  });
});
