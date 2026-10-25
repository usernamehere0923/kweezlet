import { normalizeAnswer } from "../../worker/grading";

/**
 * Smart grading: a small typo still counts, and a " / " (with spaces) in the
 * definition offers alternatives ("the dog / hund" is answered by either).
 * A slash without spaces is part of the answer ("km/h", "1/2"). Numbers and
 * very short answers have to be exact.
 */
export function gradeAnswer(given: string, expected: string): boolean {
  const alternatives = [expected, ...expected.split(/\s\/\s/)];
  return alternatives.some((alternative) => {
    const want = normalizeAnswer(alternative);
    // Only symbols ("=", "%"): nothing is left after normalizing, so compare as typed.
    if (!want) return alternative.trim() !== "" && given.trim() === alternative.trim();
    return closeEnough(normalizeAnswer(given), want);
  });
}

/** Typos allowed: one for words from four characters, two for long ones. */
function closeEnough(said: string, expected: string): boolean {
  if (said === expected) return true;
  // Numbers are answered exactly, also inside text: "year 1291" is not "year 1292".
  if (digits(said) !== digits(expected)) return false;
  if (/^\d+$/.test(expected)) return false;
  const tolerance = expected.length < 4 ? 0 : Math.min(2, Math.floor((expected.length - 4) / 5) + 1);
  if (tolerance === 0 || Math.abs(said.length - expected.length) > tolerance) return false;
  return editDistance(said, expected) <= tolerance;
}

function digits(text: string): string {
  return text.replace(/\D+/g, " ").trim();
}

/** Levenshtein distance, with adjacent transpositions ("teh" = one typo). */
function editDistance(a: string, b: string): number {
  const d: number[][] = [Array.from({ length: b.length + 1 }, (_, i) => i)];
  for (let r = 1; r <= a.length; r++) {
    d[r] = [r];
    for (let c = 1; c <= b.length; c++) {
      d[r][c] = Math.min(d[r - 1][c] + 1, d[r][c - 1] + 1, d[r - 1][c - 1] + (a[r - 1] === b[c - 1] ? 0 : 1));
      if (r > 1 && c > 1 && a[r - 1] === b[c - 2] && a[r - 2] === b[c - 1]) {
        d[r][c] = Math.min(d[r][c], d[r - 2][c - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}
