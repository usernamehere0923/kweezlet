import { describe, expect, test } from "vitest";
import { mockApi } from "../test/server";
import { checkSetForm, emptyRow, saveImageChanges } from "./setForm";

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

  test("a row whose picture was taken off again is empty again", () => {
    const removed = { term: "", definition: "", image: null, imageChanged: true };
    expect(checkSetForm("Animals", [row("el gato", "the cat"), removed])).toMatchObject({ formError: null });
  });

  test("a row with a picture is kept, and still needs its text", () => {
    const imageRow = { term: "", definition: "", image: "data:image/png;base64,AA", imageChanged: true };
    expect(checkSetForm("Animals", [imageRow]).formError).toBe("sets.termsIncomplete");
    expect(checkSetForm("Animals", [row("el gato", "the cat"), imageRow]).kept).toEqual([
      row("el gato", "the cat"),
      imageRow,
    ]);
  });
});

describe("saveImageChanges", () => {
  test("only rows whose image changed are sent, each to its saved term", async () => {
    const { calls } = mockApi({
      "PUT /api/terms/70/image": () => ({ json: { ok: true } }),
      "PUT /api/terms/72/image": () => ({ json: { ok: true } }),
    });
    const kept = [
      { term: "a", definition: "b", image: "data:image/png;base64,AA", imageChanged: true },
      { term: "c", definition: "d" },
      { id: 72, term: "e", definition: "f", image: null, imageChanged: true },
    ];

    await expect(saveImageChanges(kept, [{ id: 70 }, { id: 71 }, { id: 72 }])).resolves.toBe(0);
    expect(calls.filter((c) => c.method === "PUT").map((c) => [c.path, c.body])).toEqual([
      ["/api/terms/70/image", { image: "data:image/png;base64,AA" }],
      ["/api/terms/72/image", { image: null }],
    ]);
  });

  test("a row with an id keeps it, whatever the saved list looks like; a new row without a picture sends nothing", async () => {
    const { calls } = mockApi({ "PUT /api/terms/72/image": () => ({ json: { ok: true } }) });
    const kept = [
      { term: "a", definition: "b", image: null, imageChanged: true },
      { id: 72, term: "e", definition: "f", image: "data:image/png;base64,AA", imageChanged: true },
    ];

    // Another device added a term in between: by position, row 2 would hit 70.
    await expect(saveImageChanges(kept, [{ id: 69 }, { id: 70 }, { id: 72 }])).resolves.toBe(0);
    expect(calls.filter((c) => c.method === "PUT").map((c) => c.path)).toEqual(["/api/terms/72/image"]);
  });

  test("a failed image is counted, never thrown", async () => {
    mockApi({ "PUT /api/terms/70/image": () => ({ status: 400, json: { error: "validation" } }) });
    const kept = [{ term: "a", definition: "b", image: "x", imageChanged: true }];

    await expect(saveImageChanges(kept, [{ id: 70 }])).resolves.toBe(1);
    await expect(saveImageChanges(kept, [])).resolves.toBe(0); // the row never made it to the server
  });
});
