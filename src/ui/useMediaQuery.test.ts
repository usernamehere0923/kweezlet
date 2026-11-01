import { renderHook, act } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { useMediaQuery } from "./useMediaQuery";

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

  test("without matchMedia (jsdom) nothing matches", () => {
    const { result } = renderHook(() => useMediaQuery("(min-width: 768px)"));
    expect(result.current).toBe(false);
  });
});
