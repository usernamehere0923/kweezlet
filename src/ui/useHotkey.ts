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
  // How focus got where it is: Tab means keyboard, a tap or click means
  // pointer. Starts as keyboard, so until a pointer shows up a focused button
  // keeps Space for itself (a screen reader's activation must not be stolen).
  const lastInput = useRef<"keyboard" | "pointer">("keyboard");
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(() => {
    if (!key || !enabled) return;
    // We took the key down: its key up is ours too. Firefox clicks a focused
    // button on Space's key up, even with the key down prevented.
    let took = false;
    const onPointer = () => {
      lastInput.current = "pointer";
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Tab") lastInput.current = "keyboard";
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, select, [contenteditable=true]")) return;
      if (e.key !== key || e.metaKey || e.ctrlKey || e.altKey) return;
      // Space on a button a keyboard user tabbed to presses that button; we
      // stay out. After a tap or click Space is ours, and preventDefault()
      // keeps the button that kept focus from clicking.
      if (key === " " && el?.closest("button") && lastInput.current === "keyboard") return;
      e.preventDefault();
      took = true;
      latest.current();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== key || !took) return;
      took = false;
      e.preventDefault();
    };
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [key, enabled]);
}
