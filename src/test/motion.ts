import { vi } from "vitest";

/** A device that allows motion (jsdom has no matchMedia, which counts as reduced). */
export function allowMotion() {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query }));
}
