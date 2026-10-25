import { describe, expect, test } from "vitest";
import { normalizeAnswer } from "../worker/grading";

describe("normalizeAnswer", () => {
  test("ignores case, spaces, accents and punctuation", () => {
    expect(normalizeAnswer("  The   Dog  ")).toBe("the dog");
    expect(normalizeAnswer("café")).toBe("cafe");
    expect(normalizeAnswer("el perro!")).toBe("el perro");
    expect(normalizeAnswer("e-mail")).toBe("e mail");
  });

  test("knows the Swiss spelling and apostrophes", () => {
    expect(normalizeAnswer("Gross")).toBe("gross");
    expect(normalizeAnswer("don't")).toBe("dont");
    expect(normalizeAnswer("l’homme")).toBe("lhomme");
  });
});
