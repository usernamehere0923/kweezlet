import { describe, expect, test, vi } from "vitest";
import type { AiCard } from "../worker/ai/extract";
import { checkQuote, normalizeForMatch, verifyCards, type PageTexts } from "../worker/ai/verify";

// The text a pdf.js extraction produces: page headers, line-break hyphens,
// ligatures, curly quotes. Umlauts stay as they are.
const PAGES: PageTexts = new Map([
  [
    1,
    `Kanton Graubünden
Die Schweiz hat 26 Kantone. Graubünden ist der grösste Kanton
nach Fläche.`,
  ],
  [
    2,
    `Geschichte
Der Bund wurde 1291 gegründet. Die Verfassung der Schweizerischen
Eidgenossenschaft stammt aus dem Jahr 1848. Die Konfö-
deration blieb ein Bund von Kantonen.`,
  ],
  [
    3,
    `Die Bundesverfassung regelt die Rechte der Bürgerinnen und Bürger.
Sie zählt die vier Nationalsprachen auf: Deutsch, Französisch,
Italienisch und Rätoromanisch.`,
  ],
]);

function card(source: string, page: number | null): AiCard {
  return { term: "t", definition: "d", source, page };
}

describe("normalizeForMatch", () => {
  test("folds case, whitespace and ß", () => {
    expect(normalizeForMatch("  Die   BUNDESVERFASSUNG  ")).toBe("die bundesverfassung");
    expect(normalizeForMatch("Straße")).toBe("strasse");
  });

  test("keeps umlauts: only the ß is folded", () => {
    expect(normalizeForMatch("GRÖSSTE")).toBe("grösste");
  });

  test("makes curly quotes and dashes plain", () => {
    expect(normalizeForMatch("„Bund“ – 1291")).toBe('"bund" - 1291');
    expect(normalizeForMatch("l’homme")).toBe("l'homme");
  });

  test("joins hyphens at line breaks", () => {
    expect(normalizeForMatch("Die Verfassung der Konfö-\nderation")).toBe("die verfassung der konföderation");
    expect(normalizeForMatch("Konfö- \n\t deration")).toBe("konföderation");
    // Ordinary hyphens in words stay.
    expect(normalizeForMatch("Mittel-Schule")).toBe("mittel-schule");
    // Or keeps them, only dropping the line break.
    expect(normalizeForMatch("Baden-\nWürttemberg", true)).toBe("baden-württemberg");
  });

  test("unfolds ligatures and drops soft hyphens", () => {
    expect(normalizeForMatch("Der ﬁle Name")).toBe("der file name");
    expect(normalizeForMatch("Straß\u00ADe")).toBe("strasse");
  });
});

describe("checkQuote", () => {
  test("verifies a quote from the page the card names", () => {
    expect(checkQuote(card("Der Bund wurde 1291 gegründet.", 2), PAGES)).toEqual({ verified: true, page: 2 });
  });

  test("finds a quote despite PDF hyphenation and page headers", () => {
    // The word is split at a line break in the page text.
    expect(checkQuote(card("Die Konföderation blieb ein Bund", 2), PAGES)).toEqual({ verified: true, page: 2 });
    // A quote that starts after the page header and crosses a line break.
    expect(checkQuote(card("grösste Kanton nach Fläche", 1), PAGES)).toEqual({ verified: true, page: 1 });
    expect(checkQuote(card("Eidgenossenschaft stammt aus dem Jahr", 2), PAGES)).toEqual({ verified: true, page: 2 });
  });

  test("corrects the page when the quote is on another page", () => {
    // The card claims page 1, the quote is on page 3.
    expect(checkQuote(card("Die vier Nationalsprachen", 1), PAGES)).toEqual({ verified: true, page: 3 });
    // No page at all: the quote still finds its page.
    expect(checkQuote(card("Regelt die Rechte der Bürgerinnen", null), PAGES)).toEqual({ verified: true, page: 3 });
  });

  test("rejects a quote that is nowhere in the material", () => {
    expect(checkQuote(card("Der Rhein entspringt im Gotthard.", 2), PAGES)).toEqual({ verified: false, page: 2 });
    // Invented on its own page, but not what the page says.
    expect(checkQuote(card("Graubünden hat 2000 Seen.", 1), PAGES)).toEqual({ verified: false, page: 1 });
  });

  test("rejects a page that has no text: scans and photos cannot be checked", () => {
    const withScan: PageTexts = new Map([[4, ""]]);
    expect(checkQuote(card("anything at all", 4), withScan)).toEqual({ verified: false, page: 4 });
    expect(checkQuote(card("anything at all", 5), PAGES)).toEqual({ verified: false, page: 5 });
    // A whole file as material: no page texts at all.
    expect(checkQuote(card("Der Bund wurde 1291 gegründet.", 1), new Map())).toEqual({ verified: false, page: 1 });
  });

  test("rejects a card with no quote", () => {
    expect(checkQuote(card("", 2), PAGES)).toEqual({ verified: false, page: 2 });
    expect(checkQuote(card("   ", 2), PAGES)).toEqual({ verified: false, page: 2 });
  });

  test("short quotes only count on a word boundary", () => {
    const pages: PageTexts = new Map([[2, "Der Bund wurde 1291 gegründet."]]);
    // "und" is inside "Bund", but never its own word.
    expect(checkQuote(card("und", 2), pages).verified).toBe(false);
    expect(checkQuote(card("Bund", 2), pages).verified).toBe(true);
    // A quote with spaces is matched as written.
    expect(checkQuote(card("Die Schweiz", 1), PAGES).verified).toBe(true);
  });

  test("short quotes with regular expression characters still match literally", () => {
    const pages: PageTexts = new Map([[1, "Der Wert ist 100 % (circa) morgen."]]);
    expect(checkQuote(card("100 %", 1), pages).verified).toBe(true);
    expect(checkQuote(card("101 %", 1), pages).verified).toBe(false);
    expect(checkQuote(card("(circa)", 1), pages).verified).toBe(true);
    expect(checkQuote(card("[circa]", 1), pages).verified).toBe(false);
  });

  test("prefers the card's own page when the quote is on several", () => {
    const pages: PageTexts = new Map([
      [2, "Der Bund wurde 1291 gegründet."],
      [5, "Der Bund wurde 1291 gegründet."],
    ]);
    expect(checkQuote(card("Der Bund wurde 1291 gegründet.", 5), pages)).toEqual({ verified: true, page: 5 });
    expect(checkQuote(card("Der Bund wurde 1291 gegründet.", 9), pages)).toEqual({ verified: true, page: 2 });
  });
});

describe("verifyCards", () => {
  test("a real compound that wraps at a line break verifies, with or without its hyphen", () => {
    const pages: PageTexts = new Map([[1, "Das Land Baden-\nWürttemberg grenzt an die Schweiz. Die Konfö-\nderation"]]);
    const cards = [card("Baden-Württemberg grenzt an die Schweiz", 1), card("die Konföderation", 1)];
    expect(verifyCards(cards, pages).map((c) => c.verified)).toEqual([true, true]);
  });

  test("normalizes each page once per run, not once per card", () => {
    const pages = new Map([[1, "Der Bund wurde 1291 gegründet."]]);
    const get = vi.spyOn(pages, "get");
    verifyCards([card("Der Bund", 1), card("wurde 1291", 1), card("nirgends zu finden", 1)], pages);
    expect(get).toHaveBeenCalledTimes(2); // the joined and the kept form, once
  });

  test("fills in verified and page, and checks the verified ones", () => {
    const cards = [card("Der Bund wurde 1291 gegründet.", 2), card("Der Rhein entspringt im Gotthard.", 1)];
    expect(verifyCards(cards, PAGES)).toEqual([
      { term: "t", definition: "d", source: "Der Bund wurde 1291 gegründet.", page: 2, verified: true, checked: true },
      {
        term: "t",
        definition: "d",
        source: "Der Rhein entspringt im Gotthard.",
        page: 1,
        verified: false,
        checked: false,
      },
    ]);
  });
});
