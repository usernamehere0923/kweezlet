// Fill-in-the-blank (cloze) cards: the term is a sentence with exactly one
// part marked as {{the hidden part}}; the definition is that part. Shared by
// the API (it derives the definition) and the UI (it draws the blank).

/** One {{gap}} in a sentence; global, so use it with matchAll / replace. */
export const MARKER = /\{\{([^{}]*)\}\}/g;

export const TERM_KINDS = ["pair", "cloze"] as const;
export type TermKind = (typeof TERM_KINDS)[number];

/** The parts of a cloze sentence, or null unless it has exactly one non-empty marker. */
export function clozeParts(text: string): { before: string; answer: string; after: string } | null {
  const markers = [...text.matchAll(MARKER)];
  if (markers.length !== 1) return null;
  const [marker] = markers;
  const answer = marker[1]!.trim();
  if (!answer) return null;
  // Braces left over outside the marker mean a typo like {{word} or {word}}.
  const before = text.slice(0, marker.index);
  const after = text.slice(marker.index! + marker[0].length);
  if (/[{}]{2}/.test(before + after)) return null;
  return { before, answer, after };
}

/** The hidden part of a cloze sentence (the card's definition), or null when the marker is missing or doubled. */
export function clozeAnswer(text: string): string | null {
  return clozeParts(text)?.answer ?? null;
}

/**
 * Anki's cloze marks ({{c1::answer}}, {{c1::answer::hint}}) as plain gaps.
 * Several of them stay several gaps: not a gap sentence of ours.
 */
export function fromAnki(text: string): string {
  return text.replace(/\{\{c\d+::([^{}]*?)(?:::[^{}]*)?\}\}/g, "{{$1}}");
}

/** What a gap looks like in plain text (Match tiles, true/false, the read-out prompt). */
export const BLANK = "_____";

/** The sentence with its gap, as plain text. */
export function blanked(text: string): string {
  const parts = clozeParts(text);
  return parts ? `${parts.before}${BLANK}${parts.after}` : text;
}

/** The whole sentence, marker taken off. */
export function filled(text: string): string {
  const parts = clozeParts(text);
  return parts ? `${parts.before}${parts.answer}${parts.after}` : text;
}
