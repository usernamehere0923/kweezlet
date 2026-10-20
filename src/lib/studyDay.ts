import { useEffect, useState } from "react";
import { api } from "./api";

/** Today as YYYY-MM-DD in the user's own timezone (the streak day). */
export function localDay(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/**
 * "I studied today": remembers the day and answers the new day streak.
 * Every study screen calls this, with `active` true once something was really
 * studied (a card flipped or marked, an answer, a tile tapped): opening a
 * mode and leaving again does not keep the streak alive.
 */
export function useStudyDay(active: boolean): number {
  const [streak, setStreak] = useState(0);
  useEffect(() => {
    if (!active) return;
    void api.study.day.$post({ json: { day: localDay() } }).then(async (res) => {
      if (res.ok) setStreak((await res.json()).streak);
    });
  }, [active]);
  return streak;
}
