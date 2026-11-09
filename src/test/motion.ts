import { vi } from "vitest";

/** A device that allows motion (jsdom has no matchMedia, which counts as reduced). */
export function allowMotion() {
  // The listener methods too: useMediaQuery (Home, TermList) subscribes to the same stub.
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}
