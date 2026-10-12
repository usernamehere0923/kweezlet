import { describe, expect, test, vi } from "vitest";
import type { SetTerm } from "../../worker/sets";
import { buildMatchRound, buildTest, gradeQuestion, scoreTest, type MatchPair, type TestQuestion } from "./quiz";

const TERMS: SetTerm[] = [
  { id: 1, term: "el perro", definition: "the dog", position: 0, status: "unseen", starred: false, streak: 0 },
  { id: 2, term: "el gato", definition: "the cat", position: 1, status: "unseen", starred: false, streak: 0 },
  { id: 3, term: "el caballo", definition: "the horse", position: 2, status: "unseen", starred: false, streak: 0 },
  { id: 4, term: "el pez", definition: "the fish", position: 3, status: "unseen", starred: false, streak: 0 },
];

describe("buildTest", () => {
  test("makes as many questions as asked, with the answer to pick", () => {
    const paper = buildTest(TERMS, { count: 2, types: ["choice"], matching: false });
    expect(paper.questions).toHaveLength(2);
    expect(paper.matching).toEqual([]);
    for (const question of paper.questions) {
      expect(question.kind).toBe("choice");
      expect(question.options).toContain(question.answer);
      expect(question.options.length).toBeLessThanOrEqual(4);
    }
  });

  test("clamps to the set and adds the matching round when asked", () => {
    const paper = buildTest(TERMS, { count: 50, types: ["written"], matching: true });
    expect(paper.questions).toHaveLength(4);
    for (const question of paper.questions) expect(question.options).toEqual([]);
    expect(paper.matching.map((pair) => pair.term).sort()).toEqual(["el caballo", "el gato", "el perro", "el pez"]);
  });

  test("the question types come in turn", () => {
    const paper = buildTest(TERMS, { count: 3, types: ["choice", "written"], matching: false });
    expect(paper.questions.map((question) => question.kind)).toEqual(["choice", "written", "choice"]);
  });

  test("no question types means a matching-only paper", () => {
    const paper = buildTest(TERMS, { count: 3, types: [], matching: true });
    expect(paper.questions).toEqual([]);
    expect(paper.matching).toHaveLength(4);
  });

  test("true/false statements are right or wrong as built", () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // always takes the lying definition
    const wrong = buildTest(TERMS, { count: 2, types: ["truefalse"], matching: false });
    for (const question of wrong.questions) {
      expect(question.kind).toBe("truefalse");
      expect(question.options).toEqual(["true", "false"]);
      expect(question.answer).toBe("false");
    }

    vi.spyOn(Math, "random").mockReturnValue(0.99); // never lies
    const right = buildTest(TERMS, { count: 2, types: ["truefalse"], matching: false });
    for (const question of right.questions) expect(question.answer).toBe("true");
  });
});

describe("buildMatchRound", () => {
  const PAIRS: MatchPair[] = [
    { id: 1, term: "el perro", definition: "the dog" },
    { id: 2, term: "el gato", definition: "the cat" },
    { id: 3, term: "el caballo", definition: "the horse" },
    { id: 4, term: "el pez", definition: "the fish" },
  ];

  test("two tiles per pair, one term and one definition", () => {
    const tiles = buildMatchRound(PAIRS, 2);
    expect(tiles).toHaveLength(4);
    expect(new Set(tiles.map((tile) => tile.key)).size).toBe(4);
    const labels = new Map(PAIRS.map((pair) => [pair.id, pair]));
    for (const tile of tiles) {
      const pair = labels.get(tile.pairId)!;
      expect(tile.label).toBe(tile.kind === "term" ? pair.term : pair.definition);
    }
    for (const id of new Set(tiles.map((tile) => tile.pairId))) {
      const kinds = tiles.filter((tile) => tile.pairId === id).map((tile) => tile.kind);
      expect(kinds.sort()).toEqual(["definition", "term"]);
    }
  });

  test("clamps to the pairs there are", () => {
    expect(buildMatchRound(PAIRS, 6)).toHaveLength(8);
    expect(buildMatchRound(PAIRS.slice(0, 1), 6)).toHaveLength(2);
    expect(buildMatchRound([], 6)).toEqual([]);
  });
});

const choice: TestQuestion = {
  kind: "choice",
  termId: 1,
  prompt: "el perro",
  label: "learn.askDefinition",
  answer: "the dog",
  options: ["the dog", "the cat"],
};
const written: TestQuestion = {
  kind: "written",
  termId: 1,
  prompt: "el perro",
  label: "learn.askDefinition",
  answer: "the dog",
  options: [],
};
const statement: TestQuestion = {
  kind: "truefalse",
  termId: 1,
  prompt: "el perro — the cat",
  label: "test.statement",
  answer: "false",
  options: ["true", "false"],
};

describe("gradeQuestion", () => {
  test("picks are exact, written answers use the smart grader", () => {
    expect(gradeQuestion(choice, "the dog")).toBe(true);
    expect(gradeQuestion(choice, "the cat")).toBe(false);
    expect(gradeQuestion(written, "The Dog")).toBe(true);
    expect(gradeQuestion(written, "the dig")).toBe(true);
    expect(gradeQuestion(written, "the cat")).toBe(false);
    expect(gradeQuestion(statement, "false")).toBe(true);
    expect(gradeQuestion(statement, "true")).toBe(false);
  });

  test("a skipped question is wrong", () => {
    expect(gradeQuestion(written, null)).toBe(false);
    expect(gradeQuestion(choice, null)).toBe(false);
  });
});

describe("scoreTest", () => {
  const paper = {
    questions: [choice, written, statement],
    matching: [{ id: 1, term: "el perro", definition: "the dog" }],
  };

  test("every question and every matched pair is one point", () => {
    expect(scoreTest(paper, ["the dog", "the dig", "true"], 1)).toEqual({ correct: 3, total: 4 });
    expect(scoreTest(paper, [null, null, null], 0)).toEqual({ correct: 0, total: 4 });
    expect(scoreTest(paper, ["the dog", "the dog", "false"], 1)).toEqual({ correct: 4, total: 4 });
  });
});
