// Gap sentences: what counts as a gap, and how a sentence reads with and without it.
import { describe, expect, it } from "vitest";
import { blanked, clozeAnswer, clozeParts, filled } from "../worker/cloze";

describe("cloze sentences", () => {
  it("have exactly one gap, not empty, without stray braces", () => {
    expect(clozeParts("Bern is the {{ federal city }}.")).toEqual({
      before: "Bern is the ",
      answer: "federal city",
      after: ".",
    });
    for (const broken of ["No gap.", "{{a}} and {{b}}", "An {{  }} gap.", "A {{broken} gap.", "A {broken}} gap."]) {
      expect(clozeAnswer(broken), broken).toBeNull();
    }
  });

  it("read with a gap, or whole; anything else stays as it is", () => {
    expect(blanked("Bern is the {{capital}}.")).toBe("Bern is the _____.");
    expect(filled("Bern is the {{capital}}.")).toBe("Bern is the capital.");
    expect(blanked("No gap.")).toBe("No gap.");
    expect(filled("No gap.")).toBe("No gap.");
  });
});
