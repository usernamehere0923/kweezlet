import { useCallback, useEffect, useRef } from "react";
import type { StudyMode } from "../../worker/activity";
import { api } from "./api";
import { localDay } from "./studyDay";

/**
 * The study session's report to the statistics (POST /api/study/activity):
 * how long the user actively studied, and — for the modes the server never
 * sees answered — what went by. One flush every 30 seconds, and one more when
 * the session ends (leaving the page, hiding the tab, closing it).
 *
 * The clock only ticks while the page is really used: the tab shows and some
 * input happened in the last minute. An idle minute on a forgotten card is a
 * break, not study time.
 *
 * What each mode records (see the pages):
 *   - Learn and Review answer in the worker (worker/study.ts counts those);
 *     they only contribute time here.
 *   - Flashcards: one card per flip that shows the answer, one card learned
 *     when a "know it" mark really changes the mark.
 *   - Test: the score of a handed-in paper. Match: its finished pairs.
 */
const FLUSH_MS = 30_000; // how often the accumulated activity goes out
const TICK_MS = 5_000; // how often the clock looks at the user
const IDLE_MS = 60_000; // no input for this long: on a break, clock stopped

/** Cards and answers since the last flush (time is measured by the hook). */
export type StudyDelta = { cards?: number; correct?: number; wrong?: number; learned?: number };

export function useStudyActivity({
  active,
  setId,
  mode,
}: {
  /** True once the session really started (same gate as useStudyDay). */
  active: boolean;
  setId?: number;
  mode: StudyMode;
}): { record: (delta: StudyDelta) => void } {
  const pending = useRef({ seconds: 0, cards: 0, correct: 0, wrong: 0, learned: 0 });
  // Both clocks start when the session does (see the effect below).
  const lastInputAt = useRef(0);
  const lastFlushAt = useRef(0);
  // The session context, kept current: a page can switch to another set.
  const context = useRef({ setId, mode });

  const record = useCallback((delta: StudyDelta) => {
    lastInputAt.current = Date.now();
    for (const key of ["cards", "correct", "wrong", "learned"] as const) {
      pending.current[key] += delta[key] ?? 0;
    }
  }, []);

  const flush = useCallback((keepalive = false) => {
    const counts = { ...pending.current };
    if (counts.seconds + counts.cards + counts.correct + counts.wrong + counts.learned === 0) return;
    pending.current = { seconds: 0, cards: 0, correct: 0, wrong: 0, learned: 0 };
    const { setId, mode } = context.current;
    const json = {
      day: localDay(),
      ...counts,
      ...(setId !== undefined && Number.isInteger(setId) ? { setId, mode } : {}),
    };
    // keepalive lets the last flush outlive the page it came from.
    void api.study.activity.$post({ json }, keepalive ? { init: { keepalive: true } } : undefined);
  }, []);

  useEffect(() => {
    context.current = { setId, mode };
  });

  useEffect(() => {
    if (!active) return;
    // The session just did something: start the clocks from here.
    const now = Date.now();
    lastInputAt.current = now;
    lastFlushAt.current = now;
    const input = () => {
      lastInputAt.current = Date.now();
    };
    const hidden = () => {
      if (document.visibilityState === "hidden") flush(true);
    };
    const leaving = () => flush(true);
    for (const type of ["pointerdown", "keydown", "touchstart", "scroll"]) {
      window.addEventListener(type, input, { passive: true });
    }
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", leaving);
    const timer = setInterval(() => {
      const tick = Date.now();
      if (document.visibilityState === "visible" && tick - lastInputAt.current <= IDLE_MS) {
        pending.current.seconds += TICK_MS / 1000;
      }
      if (tick - lastFlushAt.current >= FLUSH_MS) {
        lastFlushAt.current = tick;
        flush();
      }
    }, TICK_MS);
    return () => {
      for (const type of ["pointerdown", "keydown", "touchstart", "scroll"]) {
        window.removeEventListener(type, input);
      }
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", leaving);
      clearInterval(timer);
      // The last seconds and counters go out with the page.
      flush(true);
    };
  }, [active, flush]);

  return { record };
}
