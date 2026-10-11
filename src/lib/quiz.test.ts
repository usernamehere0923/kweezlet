import { describe, expect, test, vi } from "vitest";
import type { SetTerm } from "../../worker/sets";
import { buildTest, gradeQuestion, scoreTest, type TestQuestion } from "./quiz";

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
