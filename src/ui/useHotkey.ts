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
      // Space on a focused button would click it AND trigger us.
      if (key === " " && el?.closest("button")) return;
      e.preventDefault();
      latest.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [key, enabled]);
}
