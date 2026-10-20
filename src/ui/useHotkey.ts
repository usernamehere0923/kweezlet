import { createContext, useContext, useEffect, useRef } from "react";

/** True inside content that is on its way out (SlideSwap): its hotkeys stop. */
export const HotkeysAsleep = createContext(false);

/**
 * Calls `handler` when `key` is pressed anywhere on the page, except while
 * typing in a field. Keys as in KeyboardEvent.key: " ", "ArrowLeft", "1".
 */
export function useHotkey(key: string | undefined, handler: () => void, on = true): void {
  const asleep = useContext(HotkeysAsleep);
  const enabled = on && !asleep;
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(() => {
    if (!key || !enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, select, [contenteditable=true]")) return;
      if (e.key !== key || e.metaKey || e.ctrlKey || e.altKey) return;
      // Space on a button a keyboard user tabbed to presses that button; we
      // stay out. A tap or click leaves focus there too, but quietly: then
      // Space is ours, and preventDefault() keeps the button from clicking.
      const button = key === " " ? el?.closest("button") : null;
      if (button && button !== quietFocus) return;
      e.preventDefault();
      latest.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [key, enabled]);
}

// The element a tap or click focused, with no focus ring (:focus-visible).
// Sampled when it gets focus: Chrome turns :focus-visible on with the very
// key press we would ask it about. A browser without the selector records
// nothing, so a focused button keeps Space for itself (the old rule).
let quietFocus: Element | null = null;
if (typeof window !== "undefined") {
  window.addEventListener(
    "focusin",
    (e) => {
      const el = e.target as Element;
      try {
        quietFocus = el.matches(":focus-visible") ? null : el;
      } catch {
        quietFocus = null;
      }
    },
    true,
  );
}
