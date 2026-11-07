import { useEffect, useState } from "react";

/**
 * Tailwind's md/lg breakpoints for JS layout switches, so they flip at exactly
 * the width the `md:`/`lg:` classes do. rem, like Tailwind: a px query drifts
 * from the classes once the browser font size isn't 16px. A test pins these
 * to Tailwind's theme.
 */
export const MEDIA = {
  md: "(min-width: 48rem)",
  lg: "(min-width: 64rem)",
} as const;

/**
 * Does the screen match this CSS media query right now? Follows window resizes.
 * The server-side answer is "no", so mobile-first layouts render everywhere.
 *
 *   const wide = useMediaQuery(MEDIA.md);
 */
export function useMediaQuery(query: string): boolean {
  // Read once up front: no flash of the phone layout on a wide screen.
  const [matches, setMatches] = useState(
    () => typeof window.matchMedia === "function" && window.matchMedia(query).matches,
  );
  useEffect(() => {
    // Without matchMedia (jsdom) nothing matches: the phone layout is the fallback.
    if (typeof window.matchMedia !== "function") return;
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, [query]);
  return matches;
}
