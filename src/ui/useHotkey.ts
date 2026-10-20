import { createContext, createElement, useContext, useEffect, useRef, useState, type ReactNode } from "react";

/** True inside content that is on its way out (SlideSwap): its hotkeys stop. */
export const HotkeysAsleep = createContext(false);

type Input = "keyboard" | "pointer";

// How focus got where it is, shared by every useHotkey below <HotkeyInput>.
// Not per hook: a card that slides in (SlideSwap) mounts a new hook after the
// click that brought it, and must still know it was a click.
const LastInput = createContext<{ current: Input } | null>(null);

/**
 * Tracks the last input for the hotkeys inside: Tab means keyboard, a tap or
 * click means pointer. Starts as keyboard, so until a pointer shows up a
 * focused button keeps Space for itself (a screen reader's activation must not
 * be stolen). Without it, a focused button always keeps Space.
 */
export function HotkeyInput({ children }: { children: ReactNode }): ReactNode {
  // A box, not state: an input change must not re-render anything.
  const [last] = useState<{ current: Input }>(() => ({ current: "keyboard" }));
  useEffect(() => {
    const onPointer = () => {
      last.current = "pointer";
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Tab") last.current = "keyboard";
    };
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, []);
  return createElement(LastInput, { value: last }, children);
}

/**
 * Calls `handler` when `key` is pressed anywhere on the page, except while
 * typing in a field. Keys as in KeyboardEvent.key: " ", "ArrowLeft", "1".
 */
export function useHotkey(key: string | undefined, handler: () => void, on = true): void {
  const asleep = useContext(HotkeysAsleep);
  const lastInput = useContext(LastInput);
  const enabled = on && !asleep;
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(() => {
    if (!key || !enabled) return;
    // We took the key down: its key up is ours too. Firefox clicks a focused
    // button on Space's key up, even with the key down prevented.
    let took = false;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, select, [contenteditable=true]")) return;
      if (e.key !== key || e.metaKey || e.ctrlKey || e.altKey) return;
      // Space on a button a keyboard user tabbed to presses that button; we
      // stay out. After a tap or click Space is ours, and preventDefault()
      // keeps the button that kept focus from clicking.
      if (key === " " && el?.closest("button") && lastInput?.current !== "pointer") return;
      e.preventDefault();
      took = true;
      latest.current();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== key || !took) return;
      took = false;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [key, enabled, lastInput]);
}
