import { useEffect, useRef, useState, type AnimationEvent, type CSSProperties, type ReactNode } from "react";
import { cx } from "./cx";
import { HotkeysAsleep } from "./useHotkey";

/**
 * True when the device asks for less motion. Without matchMedia (tests) it
 * also says true: no animation is the safe default.
 */
export function prefersReducedMotion() {
  return typeof window.matchMedia !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Counts from 0 up to `target` (ease-out). Reduced motion: `target` at once. */
export function useCountUp(target: number, duration = 1100) {
  const reduced = prefersReducedMotion();
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (reduced) return;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / duration);
      setValue(target * (1 - (1 - k) ** 3));
      if (k < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration, reduced]);
  return reduced ? target : value;
}

const CONFETTI_COLOURS = ["bg-accent", "bg-teal", "bg-correct", "bg-accent-wash"];

function pieces(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const angle = Math.random() * Math.PI * 2;
    const distance = 90 + Math.random() * 120;
    return {
      colour: CONFETTI_COLOURS[i % CONFETTI_COLOURS.length],
      style: {
        "--x": `${Math.cos(angle) * distance}px`,
        "--y": `${Math.sin(angle) * distance + 60}px`,
        "--rot": `${Math.random() * 720 - 360}deg`,
        "--d": `${Math.random() * 80}ms`,
      } as CSSProperties,
    };
  });
}

/**
 * One burst of confetti from the middle of the nearest `relative` parent.
 * Only for a real win (good score, new best). Nothing under reduced motion.
 */
export function Confetti({ count = 36 }: { count?: number }) {
  const [burst] = useState(() => pieces(count));
  if (prefersReducedMotion()) return null;
  return (
    <div aria-hidden="true" data-testid="confetti" className="pointer-events-none absolute inset-0 overflow-hidden">
      {burst.map((p, i) => (
        <i
          key={i}
          className={cx("absolute top-[38%] left-1/2 h-3 w-2 animate-burst rounded-[2px]", p.colour)}
          style={p.style}
        />
      ))}
    </div>
  );
}

/** Longest slide-out (0.25 s) plus slack: the swap happens even if animationend never comes. */
const SLIDE_OUT_MAX_MS = 400;

/**
 * Slides content out and the next in whenever `id` changes: the old one
 * leaves left, the new one comes in from the right (`back`: the other way).
 * The old one keeps what it showed, e.g. a flipped card, until it is gone;
 * its hotkeys are off meanwhile. Reduced motion: swaps at once.
 */
export function SlideSwap({ id, back, children }: { id: unknown; back?: boolean; children: ReactNode }) {
  // `gen` counts swaps: as the key it mounts the next item fresh instead of
  // handing it the old one's state. `outBack` is the direction the current
  // slide-out started with, so a later `back` can't turn it around midway.
  const [shown, setShown] = useState({
    id,
    node: children,
    gen: 0,
    entering: false,
    back: false,
    outBack: null as boolean | null,
  });
  const leaving = shown.id !== id;
  const next = (entering: boolean) =>
    setShown({ id, node: children, gen: shown.gen + 1, entering, back: !!back, outBack: null });
  if (!leaving && shown.node !== children) setShown({ ...shown, node: children });
  else if (leaving && prefersReducedMotion()) next(false);
  else if (leaving && shown.outBack === null) setShown({ ...shown, outBack: !!back });

  // Hidden, or the animation got cancelled: no animationend (React has no
  // onAnimationCancel). Swap anyway.
  const latestNext = useRef(next);
  useEffect(() => {
    latestNext.current = next;
  });
  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => latestNext.current(true), SLIDE_OUT_MAX_MS);
    return () => clearTimeout(timer);
  }, [leaving, shown.gen]);

  const finish = (e: AnimationEvent<HTMLDivElement>) => {
    if (leaving && e.target === e.currentTarget) next(true);
  };
  return (
    <div className="overflow-x-clip">
      <div
        key={shown.gen}
        inert={leaving}
        className={cx(
          leaving && (shown.outBack ? "animate-slide-out-right" : "animate-slide-out-left"),
          !leaving && shown.entering && (shown.back ? "animate-slide-in-left" : "animate-slide-in-right"),
        )}
        onAnimationEnd={finish}
      >
        <HotkeysAsleep value={leaving}>{shown.node}</HotkeysAsleep>
      </div>
    </div>
  );
}
