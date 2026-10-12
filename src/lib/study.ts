import { useEffect, useState } from "react";
import { api } from "./api";

/** Today as YYYY-MM-DD in the user's own timezone (the streak day). */
function localDay(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/**
 * "I studied today": remembers the day and answers the new day streak.
 * Every study screen calls this on mount, so the streak counts a day once.
 */
export function useStudyDay(): number {
  const [streak, setStreak] = useState(0);
  useEffect(() => {
    void api.study.day.$post({ json: { day: localDay() } }).then(async (res) => {
      if (res.ok) setStreak((await res.json()).streak);
    });
  }, []);
  return streak;
}

/** Fisher-Yates, returns a new list. */
export function shuffle<T>(list: T[]): T[] {
  const mixed = [...list];
  for (let i = mixed.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [mixed[i], mixed[j]] = [mixed[j], mixed[i]];
  }
  return mixed;
}

/** A duration as m:ss, e.g. 23 seconds -> "0:23" (the Match and Test clocks). */
export function formatTime(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

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

/**
 * Smart grading: a small typo still counts, and a "/" in the definition offers
 * alternatives ("the dog / hund" is answered by either). Numbers and very
 * short answers have to be exact.
 */
export function gradeAnswer(given: string, expected: string): boolean {
  const said = normalizeAnswer(given);
  return expected
    .split("/")
    .map(normalizeAnswer)
    .filter(Boolean)
    .some((alternative) => closeEnough(said, alternative));
}

/** Typos allowed: one for words from four characters, two for long ones. */
function closeEnough(said: string, expected: string): boolean {
  if (said === expected) return true;
  // Numbers are answered exactly: 1291 is not 1292.
  if (/^\d+$/.test(expected)) return false;
  const tolerance = expected.length < 4 ? 0 : Math.min(2, Math.floor((expected.length - 4) / 5) + 1);
  if (tolerance === 0 || Math.abs(said.length - expected.length) > tolerance) return false;
  return editDistance(said, expected) <= tolerance;
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
