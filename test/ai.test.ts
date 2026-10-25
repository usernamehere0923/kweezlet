import { describe, expect, test } from "vitest";
import { extractJsonObject, ExtractError, parseResult } from "../worker/ai/extract";
import { repairMessages, runMessages, type RunOptions } from "../worker/ai/prompt";
import { addUsage, costNanos, MODEL, NO_USAGE, PRICES } from "../worker/ai/prices";
import type { ZaiMessage } from "../worker/ai/zai";

const OPTIONS: RunOptions = {
  kind: "auto",
  maxCards: 25,
  userLanguage: "de",
  instructions: "",
  existing: "",
};

describe("prices", () => {
  test("costs input, cached and output tokens in exact integers", () => {
    // 1000 prompt tokens, 200 of them cached, 500 output tokens.
    const usage = { promptTokens: 1000, cachedTokens: 200, completionTokens: 500 };
    expect(costNanos(MODEL, usage)).toBe(800 * 150 + 200 * 30 + 500 * 500);
    expect(PRICES[MODEL]).toEqual({ input: 150, cached: 30, output: 500 });
  });

  test("never bills more cached tokens than arrived", () => {
    expect(costNanos(MODEL, { promptTokens: 10, cachedTokens: 50, completionTokens: 0 })).toBe(50 * 30);
  });

  test("adds usage of several calls", () => {
    expect(addUsage({ promptTokens: 1, cachedTokens: 2, completionTokens: 3 }, NO_USAGE)).toEqual({
      promptTokens: 1,
      cachedTokens: 2,
      completionTokens: 3,
    });
    expect(
      addUsage(
        { promptTokens: 1, cachedTokens: 2, completionTokens: 3 },
        { promptTokens: 4, cachedTokens: 5, completionTokens: 6 },
      ),
    ).toEqual({
      promptTokens: 5,
      cachedTokens: 7,
      completionTokens: 9,
    });
  });
});

describe("extractJsonObject", () => {
  test("takes plain JSON as it is", () => {
    expect(extractJsonObject('{"a":1}')).toBe('{"a":1}');
  });

  test("strips code fences and prose around the object", () => {
    expect(extractJsonObject('Here you go:\n```json\n{"a":1}\n```\nHope that helps!')).toBe('{"a":1}');
    expect(extractJsonObject('Sure! {"a":1} Done.')).toBe('{"a":1}');
    expect(extractJsonObject('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  test("hands back the text when there is no object", () => {
    expect(extractJsonObject("no cards here")).toBe("no cards here");
  });
});

describe("parseResult", () => {
  const full = {
    kind: "vocabulary",
    title: "Spanish animals",
    term_lang: "es",
    def_lang: "de",
    cards: [
      { term: "el perro", definition: "der Hund", source: "el perro — der Hund", page: 5 },
      { term: "el gato", definition: "die Katze", source: "el gato", page: 2 },
    ],
    notes: "",
  };

  test("reads a full answer", () => {
    const result = parseResult(JSON.stringify(full));
    expect(result.kind).toBe("vocabulary");
    expect(result.cards).toHaveLength(2);
    expect(result.cards[0]).toEqual({
      term: "el perro",
      definition: "der Hund",
      source: "el perro — der Hund",
      page: 5,
    });
  });

  test("fills the optional fields", () => {
    const result = parseResult('{"kind":"terms","cards":[{"term":"Bern","definition":"capital"}]}');
    expect(result.title).toBe("");
    expect(result.term_lang).toBeNull();
    expect(result.notes).toBe("");
    expect(result.cards[0]).toEqual({ term: "Bern", definition: "capital", source: "", page: null });
  });

  test("reads an answer wrapped in prose and fences", () => {
    expect(parseResult("```json\n" + JSON.stringify(full) + "\n```").title).toBe("Spanish animals");
    expect(parseResult("Here are the cards: " + JSON.stringify(full)).cards).toHaveLength(2);
  });

  test("rejects an answer that is not JSON at all", () => {
    expect(() => parseResult("I could not make cards from this.")).toThrow(ExtractError);
    expect(() => parseResult("not JSON")).toThrow(/not JSON/);
  });

  test("rejects cards that break the rules", () => {
    expect(() => parseResult('{"kind":"magic","cards":[]}')).toThrow(/kind/);
    expect(() => parseResult('{"kind":"terms","cards":[{"term":"","definition":"x"}]}')).toThrow(/cards\.0\.term/);
    expect(() => parseResult('{"kind":"terms","cards":[{"term":"a","definition":"b","page":0}]}')).toThrow(/page/);
    const tooMany = {
      kind: "terms",
      cards: Array.from({ length: 61 }, (_, i) => ({ term: `t${i}`, definition: "d" })),
    };
    expect(() => parseResult(JSON.stringify(tooMany))).toThrow(/cards/);
  });

  test("says what was wrong, for the repair retry", () => {
    try {
      parseResult('{"kind":"terms","cards":[{"term":"a"}]}');
      expect.unreachable();
    } catch (err) {
      expect(String(err)).toMatch(/cards\.0\.definition/);
    }
  });
});

describe("runMessages", () => {
  test("sends the system prompt and the options in the user message", () => {
    const [system, user] = runMessages(
      { ...OPTIONS, kind: "questions", instructions: "only chapter 3", existing: "el perro — der Hund" },
      { kind: "pages", pages: [{ n: 1, text: "Bern ist die Hauptstadt." }] },
    );
    expect(system.role).toBe("system");
    expect(String(system.content)).toContain("You turn study material into flashcards");
    const parts = user.content as { type: string; text?: string }[];
    expect(parts[0]!.text).toContain("<kind>questions</kind>");
    expect(parts[0]!.text).toContain("<max_cards>25</max_cards>");
    expect(parts[0]!.text).toContain("<user_language>de</user_language>");
    expect(parts[0]!.text).toContain("<instructions>only chapter 3</instructions>");
    expect(parts[0]!.text).toContain("<existing>\nel perro — der Hund\n</existing>");
    expect(parts[1]!.text).toBe('<page n="1">\nBern ist die Hauptstadt.\n</page>');
  });

  test("omits the optional blocks when they are empty", () => {
    const [, user] = runMessages(OPTIONS, { kind: "pages", pages: [] });
    const text = (user.content as { text?: string }[])[0]!.text!;
    expect(text).not.toContain("<instructions>");
    expect(text).not.toContain("<existing>");
  });

  test("tags image pages with their page number", () => {
    const [, user] = runMessages(OPTIONS, {
      kind: "pages",
      pages: [
        { n: 3, text: "text page" },
        { n: 4, image: "data:image/jpeg;base64,AAAA" },
      ],
    });
    const parts = user.content as { type: string; text?: string; image_url?: { url: string } }[];
    expect(parts[2]!.text).toBe('<page n="4" type="image"></page>');
    expect(parts[3]).toEqual({ type: "image_url", image_url: { url: "data:image/jpeg;base64,AAAA" } });
  });

  test("sends a file material as one file part, before the options", () => {
    const [, user] = runMessages(OPTIONS, {
      kind: "file",
      dataUrl: "data:application/pdf;base64,BBBB",
      filename: "lecture.docx",
    });
    const parts = user.content as { type: string; file?: { file_data: string; filename: string }; text?: string }[];
    expect(parts[0]).toEqual({
      type: "file",
      file: { file_data: "data:application/pdf;base64,BBBB", filename: "lecture.docx" },
    });
    expect(parts[1]!.text).toContain("<kind>auto</kind>");
    expect(parts).toHaveLength(2);
  });
});

describe("repairMessages", () => {
  test("keeps the run and adds the bad answer with the problem", () => {
    const run: ZaiMessage[] = runMessages(OPTIONS, { kind: "pages", pages: [] });
    const repaired = repairMessages(run, "{bad json}", "cards: invalid_type");
    expect(repaired).toHaveLength(run.length + 2);
    expect(repaired[run.length]).toEqual({ role: "assistant", content: "{bad json}" });
    expect(repaired[run.length + 1]!.role).toBe("user");
    expect(repaired[run.length + 1]!.content).toContain("cards: invalid_type");
    expect(repaired[run.length + 1]!.content).toContain("JSON only");
  });
});
