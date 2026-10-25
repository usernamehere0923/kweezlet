// No imports here: the UI bundles this file, and anything it imported would
// land in the browser too. The worker imports it as well, to dedup AI cards.

/**
 * How written answers are compared: " The  Dog " and "the dog" are equal.
 * Accents and punctuation do not matter either: "café" answers "cafe".
 */
export function normalizeAnswer(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/['’ʼ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}
