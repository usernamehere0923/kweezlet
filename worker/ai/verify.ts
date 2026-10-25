import type { AiCard, DraftCard } from "./extract";

/**
 * The quote check: a card counts as verified when its source quote really is in
 * the page text the card names. Pure functions, no imports but the card types.
 */

/** Quotes shorter than this only verify on a word boundary ("der" matches nothing). */
const MIN_BOUNDARY_LENGTH = 12;

/** The text of a run's pages, keyed by page number. Scan/photo pages are not here. */
export type PageTexts = Map<number, string>;

/**
 * NFKC, lower case, curly quotes and dashes to plain ones, line-break hyphens
 * joined ("Konfö-\nderation" -> "Konföderation"), "ß" -> "ss", whitespace
 * collapsed. Both sides of the check go through it, so PDF text quirks like
 * ligatures ("ﬁ") and page breaks cannot hide a real quote.
 */
export function normalizeForMatch(text: string): string {
  return (
    text
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[“”„‟«»]/g, '"')
      .replace(/[‘’ʼ]/g, "'")
      .replace(/[‐‑‒–—―−]/g, "-")
      // Hyphenation from a PDF text layer: real hyphens at line breaks get joined,
      // soft hyphens (U+00AD) just disappear.
      .replace(/(\p{L})-\s*\n\s*(\p{L})/gu, "$1$2")
      .replace(/\u00AD/g, "")
      .replace(/ß/g, "ss")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * Checks one card. Verified = the quote is in the page the card names; if the
 * model named the wrong page but the quote is on another one, the card is
 * verified and its page corrected. A card whose quote cannot be found (or that
 * has no quote at all) stays unverified: that covers invented quotes, cards
 * from scans and photos, and cards from a whole file, where nothing can be
 * checked.
 */
export function checkQuote(
  card: { source: string; page: number | null },
  pages: PageTexts,
): { verified: boolean; page: number | null } {
  const quote = normalizeForMatch(card.source);
  const normalized = new Map<number, string>();
  // Normalizing page text costs CPU (the D1 row can hold 400k characters), so
  // each page is normalized at most once and only when it is looked at.
  const pageText = (n: number): string => {
    let text = normalized.get(n);
    if (text === undefined) {
      text = normalizeForMatch(pages.get(n) ?? "");
      normalized.set(n, text);
    }
    return text;
  };
  if (!quote) return { verified: false, page: card.page };
  if (card.page != null && pages.has(card.page) && findQuote(quote, pageText(card.page))) {
    return { verified: true, page: card.page };
  }
  for (const n of [...pages.keys()].sort((a, b) => a - b)) {
    if (n !== card.page && findQuote(quote, pageText(n))) return { verified: true, page: n };
  }
  return { verified: false, page: card.page };
}

/**
 * The quote check for a whole run. Cards come back with their `verified` and
 * `page` filled in; `checked` starts on for verified cards and off for the
 * rest, which is how they arrive on the review screen.
 */
export function verifyCards(cards: AiCard[], pages: PageTexts): DraftCard[] {
  return cards.map((card) => {
    const { verified, page } = checkQuote(card, pages);
    return { ...card, page, verified, checked: verified };
  });
}

function findQuote(quote: string, text: string): boolean {
  if (quote.length < MIN_BOUNDARY_LENGTH) {
    return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(quote)}(?![\\p{L}\\p{N}])`, "u").test(text);
  }
  return text.includes(quote);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
