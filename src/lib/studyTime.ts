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

/** Everything a flush carries; one list, so a new counter can't be missed anywhere. */
const COUNTERS = ["seconds", "cards", "correct", "wrong", "learned"] as const;
type Counts = Record<(typeof COUNTERS)[number], number>;
const emptyCounts = (): Counts => ({ seconds: 0, cards: 0, correct: 0, wrong: 0, learned: 0 });
const isEmpty = (counts: Counts) => COUNTERS.every((key) => counts[key] === 0);
/** worker/activity.ts rejects a body above these (400): never build one. */
const CAPS: Counts = { seconds: 3600, cards: 10_000, correct: 10_000, wrong: 10_000, learned: 10_000 };

type Context = { setId?: number; mode: StudyMode };

/**
 * One flush, fixed when it is made: its day, set and mode stay with it, so a
 * retry after midnight or after switching sets books it where it happened.
 * The id lets the worker count a retry once when only the answer got lost.
 */
type Flush = {
  id: string;
  /** The user it was counted for: only sent while that user is logged in. */
  owner: Owner;
  day: string;
  context: Context;
  counts: Counts;
  tried: boolean;
  sending: boolean;
};

/** A username (the UI never sees ids); null = logged out; undefined = no session known (tests without one). */
type Owner = string | null | undefined;

/**
 * Flushes not yet confirmed. Module-wide, not per hook: a flush that fails
 * after its page is gone waits here for the next study page instead of
 * vanishing with the hook's refs.
 */
const queue: Flush[] = [];
const MAX_QUEUE = 240; // two hours of 30-second flushes

/**
 * Who is logged in, set by the session (src/lib/session.tsx). Logging out does
 * not reload the page, so the queue outlives the user: without this, Anna's
 * waiting flushes would go out with Ben's cookie after he logs in on her iPad.
 */
let currentOwner: Owner;
export function setFlushOwner(owner: string | null) {
  currentOwner = owner;
}

/** Tests only: start every test without leftovers of the last one. */
export function forgetQueuedFlushes() {
  queue.length = 0;
  currentOwner = undefined;
}

/** Random id; getRandomValues also works on http://<mac-ip> (randomUUID needs https). */
function flushId(): string {
  return [...crypto.getRandomValues(new Uint8Array(16))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Turns counts into a flush in the queue: into the last one if it was never tried and has room. */
function seal(counts: Counts, context: Context, owner: Owner) {
  if (isEmpty(counts)) return;
  const day = localDay();
  const last = queue.at(-1);
  if (
    last &&
    !last.tried &&
    last.owner === owner &&
    last.day === day &&
    last.context.setId === context.setId &&
    last.context.mode === context.mode &&
    COUNTERS.every((key) => last.counts[key] + counts[key] <= CAPS[key])
  ) {
    for (const key of COUNTERS) last.counts[key] += counts[key];
    return;
  }
  queue.push({ id: flushId(), owner, day, context, counts: { ...counts }, tried: false, sending: false });
  // Hours offline, or a logged-out user's flushes that never get an owner
  // back: bounded, the oldest go first.
  if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
}

function send(flush: Flush, keepalive: boolean) {
  flush.tried = true;
  flush.sending = true;
  const { setId, mode } = flush.context;
  const json = {
    day: flush.day,
    ...flush.counts,
    ...(setId !== undefined && Number.isInteger(setId) ? { setId, mode } : {}),
    id: flush.id,
  };
  // keepalive lets a flush outlive the page it came from.
  void api.study.activity.$post({ json }, keepalive ? { init: { keepalive: true } } : undefined).then((res) => {
    flush.sending = false;
    // No connection (0) or a server error: the flush stays for the next try,
    // also when it went out as the page was hiding (the page often comes back).
    // number, not the route's typed 200 | 400: apiFetch answers 0 offline.
    const status: number = res.status;
    if (status === 0 || status >= 500) return;
    // Counted, or refused for good (4xx): resending can't change a refusal.
    const at = queue.indexOf(flush);
    // Gone already (forgotten): splice(-1) would take an unrelated last flush.
    if (at >= 0) queue.splice(at, 1);
    if (res.ok && !keepalive) drain(false);
  });
}

/**
 * Sends what waits. Normally one flush at a time, oldest first, the next one
 * after an answer. Leaving the page (keepalive): everything at once, it is the
 * last chance.
 */
function drain(keepalive: boolean) {
  // Someone else's flushes wait for their owner to log in again.
  const mine = queue.filter((flush) => flush.owner === currentOwner && currentOwner !== null);
  if (keepalive) {
    for (const flush of mine) if (!flush.sending) send(flush, true);
    return;
  }
  if (mine.some((flush) => flush.sending)) return;
  if (mine[0]) send(mine[0], false);
}

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
  const pending = useRef(emptyCounts());
  // Both clocks start when the session does (see the effect below).
  const lastInputAt = useRef(0);
  const lastFlushAt = useRef(0);
  // The session context, kept current: a page can switch to another set.
  const context = useRef({ setId, mode });
  // The user this page was opened as. On a 401 the session drops to logged
  // out before the page unmounts; its last flush still belongs to this user.
  const owner = useRef(currentOwner);

  const record = useCallback((delta: StudyDelta) => {
    lastInputAt.current = Date.now();
    for (const key of COUNTERS) {
      if (key !== "seconds") pending.current[key] += delta[key] ?? 0;
    }
  }, []);

  // What was counted becomes a flush; then whatever waits goes out, earlier
  // failures included (even when nothing new was counted).
  const flush = useCallback((keepalive = false) => {
    seal(pending.current, context.current, owner.current);
    pending.current = emptyCounts();
    drain(keepalive);
  }, []);

  useEffect(() => {
    // Switching sets: what was counted so far belongs to the old one.
    const was = context.current;
    if (was.setId === setId && was.mode === mode) return;
    seal(pending.current, was, owner.current);
    pending.current = emptyCounts();
    context.current = { setId, mode };
  }, [setId, mode]);

  useEffect(() => {
    // Flushes an earlier page could not get out go now.
    drain(false);
    // Whatever was counted leaves with the page, even before the session
    // becomes active: record() can run a moment before that happens.
    const leaving = () => flush(true);
    window.addEventListener("pagehide", leaving);
    return () => {
      window.removeEventListener("pagehide", leaving);
      flush(true);
    };
  }, [flush]);

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
    for (const type of ["pointerdown", "keydown", "touchstart", "scroll"]) {
      window.addEventListener(type, input, { passive: true });
    }
    document.addEventListener("visibilitychange", hidden);
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
      clearInterval(timer);
      // The session ended (a round over, "play again" resets it): its counts
      // go now, not 30 seconds into the next round or never (an iOS app
      // closed from the switcher often fires no pagehide).
      flush(true);
    };
  }, [active, flush]);

  return { record };
}
