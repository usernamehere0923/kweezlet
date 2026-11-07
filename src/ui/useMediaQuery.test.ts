import { renderHook, act } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import tailwindTheme from "tailwindcss/theme.css?raw";
import { allowMotion } from "../test/motion";
import { MEDIA, useMediaQuery } from "./useMediaQuery";

// Only CSS listed in vitest's `css.include` comes through; the rest is blank.
// Every CSS file in src: a breakpoint override anywhere would move md:/lg:.
const appCss = Object.values(
  import.meta.glob<string>("../**/*.css", { query: "?raw", import: "default", eager: true }),
).join("\n");
// The v4 CSS theme the md:/lg: classes are built from (not the v3-compat JS export).
const breakpoint = (name: string) => tailwindTheme.match(new RegExp(`--breakpoint-${name}:\\s*([^;]+);`))?.[1];

/** A matchMedia whose answers the test flips by hand. */
function fakeMatchMedia() {
  const listeners = new Set<() => void>();
  const state = { matches: false };
  vi.stubGlobal("matchMedia", (media: string) => ({
    media,
    get matches() {
      return state.matches;
    },
    addEventListener: (_: string, fn: () => void) => void listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => void listeners.delete(fn),
  }));
  return {
    set(next: boolean) {
      state.matches = next;
      listeners.forEach((fn) => fn());
    },
    get listeners() {
      return listeners.size;
    },
  };
}

describe("useMediaQuery", () => {
  test("follows the query and stops listening on unmount", () => {
    const media = fakeMatchMedia();
    const { result, unmount } = renderHook(() => useMediaQuery("(min-width: 768px)"));
    expect(result.current).toBe(false);
    act(() => media.set(true));
    expect(result.current).toBe(true);
    expect(media.listeners).toBe(1);
    unmount();
    expect(media.listeners).toBe(0);
  });

  test("MEDIA flips where Tailwind's md:/lg: classes do", () => {
    expect(breakpoint("md")).toBeTruthy();
    expect(MEDIA.md).toBe(`(min-width: ${breakpoint("md")})`);
    expect(MEDIA.lg).toBe(`(min-width: ${breakpoint("lg")})`);
    // The app may not move them: the JS switches would no longer follow.
    expect(appCss).toContain("@theme");
    expect(appCss).not.toMatch(/--breakpoint-/);
  });

  test("works under the allowMotion() stub other UI tests use", () => {
    allowMotion();
    const { result, unmount } = renderHook(() => useMediaQuery("(min-width: 768px)"));
    expect(result.current).toBe(false);
    unmount();
  });

  test("without matchMedia (jsdom) nothing matches", () => {
    const { result } = renderHook(() => useMediaQuery("(min-width: 768px)"));
    expect(result.current).toBe(false);
  });
});
