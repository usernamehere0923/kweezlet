import { ME } from "./render";

// Sample sets the page tests share. Set 7 is the one the study pages open.

export const SPANISH = {
  id: 7,
  title: "Spanish animals",
  description: "chapter 1",
  termLang: "es",
  defLang: "en",
  termCount: 2,
  knownCount: 1,
  learningCount: 0,
  createdAt: 1,
  updatedAt: 1,
};

export const SWISS = {
  id: 8,
  title: "Swiss history",
  description: "",
  termLang: null,
  defLang: null,
  termCount: 1,
  knownCount: 0,
  learningCount: 0,
  createdAt: 1,
  updatedAt: 1,
};

type Term = { id: number; term: string; definition: string; status: string; starred: boolean; streak: number };

/** A fresh term: unseen, not starred. `overrides` sets the rest. */
export function term(id: number, term: string, definition: string, overrides: Partial<Term> = {}): Term {
  return { id, term, definition, status: "unseen", starred: false, streak: 0, ...overrides };
}

/** `set` with these terms, in this order. */
function withTerms<S>(set: S, terms: Term[]) {
  return { ...set, termCount: terms.length, terms: terms.map((t, position) => ({ ...t, position })) };
}

export const SPANISH_DETAIL = withTerms(SPANISH, [
  term(70, "el perro", "the dog"),
  term(71, "el gato", "the cat", { status: "know_it", starred: true, streak: 2 }),
]);

/** Three cards still in progress: needed to see a card being skipped. */
export const THREE_DETAIL = withTerms(SPANISH, [
  term(70, "el perro", "the dog", { status: "still_learning" }),
  term(71, "el gato", "the cat", { status: "still_learning" }),
  term(72, "el caballo", "the horse", { status: "still_learning" }),
]);

/** Two terms to learn, one already known. */
export const LEARN_DETAIL = withTerms(SPANISH, [
  term(70, "el perro", "the dog"),
  term(71, "el gato", "the cat"),
  term(72, "el caballo", "the horse", { status: "know_it", streak: 2 }),
]);

export const MATCH_DETAIL = { ...LEARN_DETAIL, bestSeconds: null };

/** Due cards as GET /api/review lists them. */
export const REVIEW_CARDS = [
  { id: 70, term: "el perro", definition: "the dog", streak: 0, setId: 7, setTitle: "Spanish animals" },
  { id: 71, term: "el gato", definition: "the cat", streak: 0, setId: 7, setTitle: "Spanish animals" },
];

/** What every study page of set 7 calls: the user, the set, the study day. */
export function studyRoutes(detail: unknown) {
  return {
    "GET /api/me": () => ({ json: ME }),
    "GET /api/sets/7": () => ({ json: detail }),
    "POST /api/study/day": () => ({ json: { streak: 3 } }),
  };
}
