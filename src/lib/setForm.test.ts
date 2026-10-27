import { describe, expect, test } from "vitest";
import { mockApi } from "../test/server";
import { act, renderHook } from "@testing-library/react";
import {
  checkSetForm,
  emptyRow,
  MAX_SIDE,
  MAX_TERMS,
  parsePastedTerms,
  saveImageChanges,
  useTermRows,
} from "./setForm";

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

describe("checkSetForm limits", () => {
  test("more terms than a set holds are caught before sending", () => {
    const many = Array.from({ length: MAX_TERMS + 1 }, (_, i) => row(`t${i}`, `d${i}`));
    expect(checkSetForm("Big", many).formError).toBe("sets.termsTooMany");
    expect(checkSetForm("Big", many.slice(1)).formError).toBeNull();
  });

  test("a side longer than the server takes is caught", () => {
    expect(checkSetForm("Long", [row("x".repeat(MAX_SIDE + 1), "d")]).formError).toBe("sets.termTooLong");
    expect(checkSetForm("Long", [row("t", "x".repeat(MAX_SIDE))]).formError).toBeNull();
  });
});

describe("parsePastedTerms", () => {
  test("a Quizlet export: tab between, one term per line", () => {
    expect(parsePastedTerms("el perro\tthe dog\r\nel gato\tthe cat\n")).toEqual({
      terms: [row("el perro", "the dog"), row("el gato", "the cat")],
      skipped: 0,
    });
  });

  test("a tab anywhere wins over commas, so definitions keep theirs", () => {
    expect(parsePastedTerms("Bern\tcapital, since 1848").terms).toEqual([row("Bern", "capital, since 1848")]);
  });

  test("typed notes with a dash", () => {
    expect(parsePastedTerms("el perro - the dog\nla vaca – the cow\nwell-known — bekannt").terms).toEqual([
      row("el perro", "the dog"),
      row("la vaca", "the cow"),
      row("well-known", "bekannt"),
    ]);
  });

  test("CSV: commas, quoted fields keep their commas and quotes", () => {
    expect(parsePastedTerms('"Bern, BE",capital\nsay,"he said ""hi"""').terms).toEqual([
      row("Bern, BE", "capital"),
      row("say", 'he said "hi"'),
    ]);
  });

  test("only the first separator splits", () => {
    expect(parsePastedTerms("a,b,c", "comma").terms).toEqual([row("a", "b,c")]);
  });

  test("semicolons between terms, a picked separator", () => {
    expect(parsePastedTerms("a,1; b,2;;", "comma", "semicolon").terms).toEqual([row("a", "1"), row("b", "2")]);
    expect(parsePastedTerms("a - 1\tx", "dash").terms).toEqual([row("a", "1\tx")]);
  });

  test("lines without a separator or with an empty side are counted, not added", () => {
    expect(parsePastedTerms("Animals\nel perro\tthe dog\nel gato\t \n\n")).toEqual({
      terms: [row("el perro", "the dog")],
      skipped: 2,
    });
  });

  test("nothing pasted, nothing found", () => {
    expect(parsePastedTerms("  \n ")).toEqual({ terms: [], skipped: 0 });
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

describe("gap sentences in the form", () => {
  test("a pasted line with one gap and no tab is a gap sentence", () => {
    expect(parsePastedTerms("Bern is the {{capital}}.\nel perro\tthe dog").terms).toEqual([
      { kind: "cloze", term: "Bern is the {{capital}}.", definition: "capital" },
      row("el perro", "the dog"),
    ]);
  });

  test("a gap sentence needs its gap before sending", () => {
    const sentence = { kind: "cloze" as const, term: "Bern is the capital.", definition: "" };
    expect(checkSetForm("Bern", [sentence]).formError).toBe("sets.clozeGap");
    const marked = { ...sentence, term: "Bern is the {{capital}}.", definition: "capital" };
    expect(checkSetForm("Bern", [marked]).formError).toBeNull();
  });

  test("switching a row keeps its text: the gap becomes the definition, and back", () => {
    const { result } = renderHook(() => useTermRows([{ term: "Bern is the {{capital}}.", definition: "" }]));
    act(() => result.current.setKind(0, "cloze"));
    expect(result.current.rows[0]).toMatchObject({ kind: "cloze", definition: "capital" });
    act(() => result.current.setKind(0, "pair"));
    expect(result.current.rows[0]).toMatchObject({ kind: "pair", term: "Bern is the capital.", definition: "" });

    const { result: pair } = renderHook(() => useTermRows([{ term: "el perro", definition: "the dog" }]));
    act(() => pair.current.setKind(0, "pair"));
    expect(pair.current.rows[0]).toMatchObject({ term: "el perro", definition: "the dog" });
  });
});
