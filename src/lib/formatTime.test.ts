import { describe, expect, test } from "vitest";
import { formatTime } from "./formatTime";

describe("formatTime", () => {
  test("shows m:ss with a padded zero", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(23)).toBe("0:23");
    expect(formatTime(61)).toBe("1:01");
  });
});
