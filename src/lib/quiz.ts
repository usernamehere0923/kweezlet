import type { SetTerm } from "../../worker/sets";
import type { TKey } from "../i18n";
import { gradeAnswer, shuffle } from "./study";

export type QuestionKind = "choice" | "truefalse" | "written";

export type TestQuestion = {
  kind: QuestionKind;
  termId: number;
  /** Everything the user reads. True/false statements are "term — definition". */
  prompt: string;
  label: TKey;
  /** The right option, the expected typed text, or "true"/"false". */
  answer: string;
  /** The pick list; empty for written questions. */
  options: string[];
};

export type MatchPair = { id: number; term: string; definition: string };

export type TestPaper = {
  questions: TestQuestion[];
  /** The matching round at the end of the paper, empty when not chosen. */
  matching: MatchPair[];
};

export type TestSettings = {
  /** How many questions; clamped to the size of the set. */
  count: number;
  types: QuestionKind[];
  matching: boolean;
};

function makeQuestion(term: SetTerm, pool: SetTerm[], kind: QuestionKind): TestQuestion {
  // Written and multiple choice questions ask both ways round.
  const askTerm = kind === "truefalse" ? false : Math.random() < 0.5;
  const answer = askTerm ? term.term : term.definition;
  const others = pool.filter((candidate) => candidate.id !== term.id);

  if (kind === "truefalse") {
    // Half the statements are wrong: they carry another term's definition.
    const liars = others.filter((candidate) => candidate.definition !== term.definition);
    const wrong = liars.length > 0 && Math.random() < 0.5;
    const shown = wrong ? shuffle(liars)[0].definition : term.definition;
    return {
      kind,
      termId: term.id,
      label: "test.statement",
      prompt: `${term.term} — ${shown}`,
      answer: wrong ? "false" : "true",
      options: ["true", "false"],
    };
  }

  const distractors = shuffle(others)
    .slice(0, 3)
    .map((candidate) => (askTerm ? candidate.term : candidate.definition));
  return {
    kind,
    termId: term.id,
    label: askTerm ? "learn.askTerm" : "learn.askDefinition",
    prompt: askTerm ? term.definition : term.term,
    answer,
    options: kind === "written" ? [] : shuffle([...new Set([answer, ...distractors])]),
  };
}

/** A fresh paper: shuffled terms, question types in turn, one matching round. */
export function buildTest(terms: SetTerm[], settings: TestSettings): TestPaper {
  const pick = shuffle(terms).slice(0, Math.min(settings.count, terms.length));
  // No question types chosen means a matching-only paper.
  const kinds = settings.types;
  return {
    questions: kinds.length === 0 ? [] : pick.map((term, i) => makeQuestion(term, pick, kinds[i % kinds.length])),
    matching: settings.matching
      ? shuffle(terms)
          .slice(0, Math.min(5, terms.length))
          .map((term) => ({ id: term.id, term: term.term, definition: term.definition }))
      : [],
  };
}

/** One question, one given answer. Written answers use the smart grader. */
export function gradeQuestion(question: TestQuestion, given: string | null): boolean {
  if (given === null) return false;
  return question.kind === "written" ? gradeAnswer(given, question.answer) : given === question.answer;
}

/** The whole paper: every question plus every matched pair is one point. */
export function scoreTest(paper: TestPaper, answers: (string | null)[], matchedPairs: number) {
  const correct = paper.questions.reduce(
    (n, question, i) => n + (gradeQuestion(question, answers[i] ?? null) ? 1 : 0),
    0,
  );
  return { correct: correct + matchedPairs, total: paper.questions.length + paper.matching.length };
}
