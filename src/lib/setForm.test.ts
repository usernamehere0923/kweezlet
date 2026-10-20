import { describe, expect, test } from "vitest";
import { checkSetForm, emptyRow } from "./setForm";

const row = (term: string, definition: string) => ({ term, definition });

describe("checkSetForm", () => {
  test("a title and full rows pass; empty rows are dropped", () => {
    expect(checkSetForm("Animals", [row("el gato", "the cat"), emptyRow, row(" ", "")])).toEqual({
      kept: [row("el gato", "the cat")],
      titleError: null,
      formError: null,
    });
  });

  test("the title comes first", () => {
    expect(checkSetForm("  ", [emptyRow])).toMatchObject({ titleError: "validation.too_small", formError: null });
  });

  test("a set needs a term, and no half-filled row", () => {
    expect(checkSetForm("Animals", [emptyRow]).formError).toBe("sets.termsNeeded");
    expect(checkSetForm("Animals", [row("el gato", "")]).formError).toBe("sets.termsIncomplete");
  });
});
