import { useMemo, useState } from "react";
import type { SetTerm } from "../../worker/sets";
import { shuffle } from "./quiz";

/** Which cards a flashcards deck shows. */
export type DeckFilter = "all" | "still_learning" | "know_it" | "starred";

export function inDeck(filter: DeckFilter, term: SetTerm): boolean {
  if (filter === "all") return true;
  if (filter === "starred") return term.starred;
  return term.status === filter;
}

/** `prev`'s order for the ids still there; ids that are new go to the end. */
export function reconcileOrder(prev: number[], ids: number[]): number[] {
  const had = new Set(prev);
  const seen = new Set(ids);
  return [...prev.filter((id) => seen.has(id)), ...ids.filter((id) => !had.has(id))];
}

/**
 * A flashcards deck: the set's terms in their shuffled order, cut down to
 * `filter`, and the position in it. A reload keeps the order (new terms go to
 * the end); marking a card can pull it out of the deck, the position clamps.
 */
export function useDeck(terms: SetTerm[] | undefined, filter: DeckFilter) {
  const [shuffled, setShuffled] = useState<number[]>([]);
  const [index, setIndex] = useState(0);
  /** The last move went to an earlier card: slide the other way. */
  const [back, setBack] = useState(false);

  const order = useMemo(() => reconcileOrder(shuffled, terms?.map((term) => term.id) ?? []), [shuffled, terms]);
  const deck = useMemo(() => {
    const byId = new Map(terms?.map((term) => [term.id, term]));
    return order.flatMap((id) => {
      const term = byId.get(id);
      return term && inDeck(filter, term) ? [term] : [];
    });
  }, [terms, order, filter]);
  const at = deck.length === 0 ? 0 : Math.min(Math.max(index, 0), deck.length - 1);

  /** `back`: slide as if going to an earlier card. A new order or filter goes forward. */
  function goTo(next: number, back = next < at) {
    setBack(back);
    setIndex(next);
  }

  function reshuffle() {
    setShuffled(shuffle(order));
    goTo(0, false);
  }

  return { deck, at, current: deck[at] ?? null, back, goTo, reshuffle };
}
