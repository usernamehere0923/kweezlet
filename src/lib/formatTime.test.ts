import { describe, expect, test } from "vitest";
import { formatDuration, formatTime, type FormatNumber } from "./formatTime";

describe("formatTime", () => {
  test("shows m:ss with a padded zero", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(23)).toBe("0:23");
    expect(formatTime(61)).toBe("1:01");
  });
});

describe("formatDuration", () => {
  const en: FormatNumber = (n, options) => new Intl.NumberFormat("en", options).format(n);
  const deCH: FormatNumber = (n, options) => new Intl.NumberFormat("de-CH", options).format(n);

  test("short times are seconds, longer ones minutes", () => {
    expect(formatDuration(45, en)).toBe("45s");
    expect(formatDuration(60, en)).toBe("1m");
    expect(formatDuration(750, en)).toBe("12m");
    expect(formatDuration(3599, en)).toBe("59m");
  });

  test("hours carry the minutes along, whole hours stand alone", () => {
    expect(formatDuration(7500, en)).toBe("2h 5m");
    expect(formatDuration(7200, en)).toBe("2h");
    expect(formatDuration(90_000, en)).toBe("25h");
  });

  test("the units are the locale's own", () => {
    expect(formatDuration(7500, deCH)).toBe("2h 5 Min.");
  });
});
