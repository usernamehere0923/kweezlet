import type { SetTerm } from "../../worker/sets";
import type { TKey } from "../i18n";
import { gradeAnswer, shuffle } from "./study";

export type QuestionKind = "choice" | "truefalse" | "written";

/** The bits of a term a question needs. SetTerm has them all. */
export type QuestionTerm = Pick<SetTerm, "id" | "term" | "definition" | "streak">;

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

/** One tile in a Match round. `pairId` links the term tile to its definition. */
export type MatchTileData = { key: string; pairId: number; kind: "term" | "definition"; label: string };

/** Pairs in one Match round: 12 tiles in two columns, chosen for a 390px screen. */
export const MATCH_PAIRS = 6;
/** A set needs at least this many terms before Match makes sense. */
export const MIN_MATCH_TERMS = 3;

/**
 * The tiles of a Match round: `count` random pairs, each as a term and a
 * definition tile, all shuffled together. Fewer pairs when there are fewer.
 */
export function buildMatchRound(pairs: MatchPair[], count: number): MatchTileData[] {
  const tile = (pair: MatchPair, kind: MatchTileData["kind"]): MatchTileData => ({
    key: `${kind}${pair.id}`,
    pairId: pair.id,
    kind,
    label: kind === "term" ? pair.term : pair.definition,
  });
  return shuffle(
    shuffle(pairs)
      .slice(0, Math.min(count, pairs.length))
      .flatMap((pair) => [tile(pair, "term"), tile(pair, "definition")]),
  );
}

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

/** One question on `term`; the wrong options come from `pool`. Learn uses it too. */
export function makeQuestion(term: QuestionTerm, pool: QuestionTerm[], kind: QuestionKind): TestQuestion {
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

/**
 * A Learn-style question: multiple choice until the first correct answer,
 * then written. Without other terms there is nothing to choose from, so those
 * are written from the start. Learn and the review queue use it.
 */
export function buildQuestion(pool: QuestionTerm[], term: QuestionTerm): TestQuestion {
  return makeQuestion(term, pool, term.streak >= 1 || pool.length < 2 ? "written" : "choice");
}

/** A fresh paper: shuffled terms, question types in turn, one matching round. */
export function buildTest(terms: SetTerm[], settings: TestSettings): TestPaper {
  const mixed = shuffle(terms);
  const kinds = settings.types;
  // No question types chosen means a matching-only paper.
  if (kinds.length === 0) return { questions: [], matching: settings.matching ? mixed.slice(0, 5).map(toPair) : [] };
  // Matching gets its own terms, or its tiles would give the questions' answers
  // away: the ones left over, but at least half the set (up to 5 pairs).
  const pairs = settings.matching
    ? Math.min(5, Math.max(terms.length - settings.count, Math.floor(terms.length / 2)))
    : 0;
  const pick = mixed.slice(pairs, pairs + settings.count);
  return {
    questions: pick.map((term, i) => makeQuestion(term, terms, kinds[i % kinds.length])),
    matching: mixed.slice(0, pairs).map(toPair),
  };
}

function toPair(term: SetTerm): MatchPair {
  return { id: term.id, term: term.term, definition: term.definition };
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
