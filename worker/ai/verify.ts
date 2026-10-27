import type { AiCard, DraftCard } from "./extract";

/**
 * The quote check: a card counts as verified when its source quote really is in
 * the page text the card names. Pure functions, no imports but the card types.
 */

/** Quotes shorter than this only verify on a word boundary ("der" matches nothing). */
const MIN_BOUNDARY_LENGTH = 12;

/** The text of a run's pages, keyed by page number. Scan/photo pages are not here. */
export type PageTexts = Map<number, string>;

/** A hyphen at the end of a line, with a letter on both sides. */
const LINE_BREAK_HYPHEN = /(\p{L})-\s*\n\s*(\p{L})/gu;

/**
 * NFKC, lower case, curly quotes and dashes to plain ones, line-break hyphens
 * joined ("Konfö-\nderation" -> "Konföderation"), "ß" -> "ss", whitespace
 * collapsed. Both sides of the check go through it, so PDF text quirks like
 * ligatures ("ﬁ") and page breaks cannot hide a real quote.
 * `keepHyphens` keeps such a hyphen and only drops the line break: a real
 * compound ("Baden-\nWürttemberg") that just happens to wrap.
 */
export function normalizeForMatch(text: string, keepHyphens = false): string {
  return (
    text
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[“”„‟«»]/g, '"')
      .replace(/[‘’ʼ]/g, "'")
      .replace(/[‐‑‒–—―−]/g, "-")
      // Hyphenation from a PDF text layer: real hyphens at line breaks get joined,
      // soft hyphens (U+00AD) just disappear.
      .replace(LINE_BREAK_HYPHEN, keepHyphens ? "$1-$2" : "$1$2")
      .replace(/\u00AD/g, "")
      .replace(/ß/g, "ss")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * A run's pages, normalized lazily: each page at most once per run, and only
 * when a card looks at it (the D1 row can hold 400k characters, and 60 cards
 * may each search every page). A page with hyphens at line breaks has two
 * forms, joined and kept; the quote may match either.
 */
export class NormalizedPages {
  private readonly cache = new Map<number, string[]>();
  constructor(readonly pages: PageTexts) {}

  forms(n: number): string[] {
    let forms = this.cache.get(n);
    if (forms === undefined) {
      const joined = normalizeForMatch(this.pages.get(n) ?? "");
      const kept = normalizeForMatch(this.pages.get(n) ?? "", true);
      forms = kept === joined ? [joined] : [joined, kept];
      this.cache.set(n, forms);
    }
    return forms;
  }
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
  pages: PageTexts | NormalizedPages,
): { verified: boolean; page: number | null } {
  const normalized = pages instanceof NormalizedPages ? pages : new NormalizedPages(pages);
  const quote = normalizeForMatch(card.source);
  if (!quote) return { verified: false, page: card.page };
  const onPage = (n: number) => normalized.forms(n).some((text) => findQuote(quote, text));
  if (card.page != null && normalized.pages.has(card.page) && onPage(card.page)) {
    return { verified: true, page: card.page };
  }
  for (const n of [...normalized.pages.keys()].sort((a, b) => a - b)) {
    if (n !== card.page && onPage(n)) return { verified: true, page: n };
  }
  return { verified: false, page: card.page };
}

/**
 * The quote check for a whole run. Cards come back with their `verified` and
 * `page` filled in; `checked` starts on for verified cards and off for the
 * rest, which is how they arrive on the review screen.
 */
export function verifyCards(cards: AiCard[], pages: PageTexts): DraftCard[] {
  const normalized = new NormalizedPages(pages);
  return cards.map((card) => {
    const { verified, page } = checkQuote(card, normalized);
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
