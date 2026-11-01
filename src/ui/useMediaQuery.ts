import { useEffect, useState } from "react";

/**
 * Does the screen match this CSS media query right now? Follows window resizes.
 * The server-side answer is "no", so mobile-first layouts render everywhere.
 *
 *   const wide = useMediaQuery("(min-width: 768px)");
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
