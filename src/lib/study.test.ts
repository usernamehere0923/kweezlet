import { describe, expect, test } from "vitest";
import { formatTime, gradeAnswer, normalizeAnswer, shuffle } from "./study";

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

describe("gradeAnswer", () => {
  test("the exact answer is always right", () => {
    expect(gradeAnswer("the dog", "the dog")).toBe(true);
    expect(gradeAnswer("The Dog", "the dog")).toBe(true);
    expect(gradeAnswer("the cat", "the dog")).toBe(false);
  });

  test("a small typo still counts", () => {
    expect(gradeAnswer("the dig", "the dog")).toBe(true);
    expect(gradeAnswer("teh dog", "the dog")).toBe(true); // transposed letters
    expect(gradeAnswer("el pero", "el perro")).toBe(true);
    expect(gradeAnswer("the do", "the dog")).toBe(true); // missing letter
  });

  test("too far off is wrong", () => {
    expect(gradeAnswer("the horse", "the dog")).toBe(false);
    expect(gradeAnswer("a cat", "the dog")).toBe(false);
    expect(gradeAnswer("", "the dog")).toBe(false);
  });

  test("short answers and numbers have to be exact", () => {
    expect(gradeAnswer("dig", "dog")).toBe(false);
    expect(gradeAnswer("1292", "1291")).toBe(false);
    expect(gradeAnswer("1291", "1291")).toBe(true);
    expect(gradeAnswer("2002", "Switzerland joins the United Nations")).toBe(false);
  });

  test("one typo is fine on a long answer, two on a very long one", () => {
    expect(gradeAnswer("Bundesbrief, the founding charter", "Bundesbrief, the founding charter")).toBe(true);
    expect(gradeAnswer("Bundesbrief, the foundng charter", "Bundesbrief, the founding charter")).toBe(true);
    expect(gradeAnswer("Bundesbrief, the foundng charte", "Bundesbrief, the founding charter")).toBe(true);
    expect(gradeAnswer("Bundesbrief, the foundng chart", "Bundesbrief, the founding charter")).toBe(false);
  });

  test("a slash in the definition offers alternatives", () => {
    expect(gradeAnswer("the dog", "the dog / hund")).toBe(true);
    expect(gradeAnswer("hund", "the dog / hund")).toBe(true);
    expect(gradeAnswer("the cat", "the dog / hund")).toBe(false);
    expect(gradeAnswer("hnd", "the dog / hund")).toBe(true); // within an alternative
  });

  test("the whole answer counts even when it has a slash", () => {
    expect(gradeAnswer("km/h", "km/h")).toBe(true);
    expect(gradeAnswer("h", "km/h")).toBe(false);
    expect(gradeAnswer("the dog / hund", "the dog / hund")).toBe(true);
    expect(gradeAnswer("1/2", "1/2")).toBe(true);
    expect(gradeAnswer("1", "1/2")).toBe(false);
  });

  test("answers made only of symbols can be answered", () => {
    expect(gradeAnswer("=", "=")).toBe(true);
    expect(gradeAnswer(" % ", "%")).toBe(true);
    expect(gradeAnswer("+", "=")).toBe(false);
    expect(gradeAnswer("", "=")).toBe(false);
  });

  test("numbers inside text have to be exact", () => {
    expect(gradeAnswer("year 1292", "Year 1291")).toBe(false);
    expect(gradeAnswer("yeer 1291", "Year 1291")).toBe(true);
  });
});

describe("shuffle", () => {
  test("keeps every item exactly once", () => {
    const mixed = shuffle([1, 2, 3, 4, 5]);
    expect([...mixed].sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("formatTime", () => {
  test("shows m:ss with a padded zero", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(23)).toBe("0:23");
    expect(formatTime(61)).toBe("1:01");
  });
});
