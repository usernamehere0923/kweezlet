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

/** How written answers are compared: " The  Dog " and "the dog" are equal. */
export function normalizeAnswer(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}
