import { useCallback, useEffect, useRef, useState } from "react";
import type { MatchState } from "../ui";
import type { MatchTileData } from "./quiz";

/** How long two wrong tiles shake before the board takes taps again. */
const SHAKE_MS = 450;

/**
 * The tap logic of a matching board (Match game, Test's matching round): pick
 * a tile, then its partner. A wrong pair shakes both tiles and blocks taps
 * until the shake is over.
 */
export function useMatchBoard(tiles: MatchTileData[]) {
  const [matched, setMatched] = useState<Set<number>>(new Set());
  const [picked, setPicked] = useState<string | null>(null);
  const [mismatch, setMismatch] = useState<string[]>([]);
  const shake = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // A pending shake must not clear a tile on a new round or after leaving.
  useEffect(() => () => clearTimeout(shake.current), []);

  const reset = useCallback(() => {
    clearTimeout(shake.current);
    setMatched(new Set());
    setPicked(null);
    setMismatch([]);
  }, []);

  /** Handles a tap. Returns the matched pair count after it, or null when the tap was ignored. */
  function tap(tile: MatchTileData): number | null {
    if (matched.has(tile.pairId) || mismatch.length > 0) return null;
    if (picked === null || picked === tile.key) {
      setPicked(picked === tile.key ? null : tile.key);
      return matched.size;
    }
    const chosen = tiles.find((candidate) => candidate.key === picked);
    if (chosen && chosen.pairId === tile.pairId && chosen.kind !== tile.kind) {
      const next = new Set(matched).add(tile.pairId);
      setMatched(next);
      setPicked(null);
      return next.size;
    }
    setMismatch([picked, tile.key]);
    shake.current = setTimeout(() => {
      setMismatch([]);
      setPicked(null);
    }, SHAKE_MS);
    return matched.size;
  }

  function stateOf(tile: MatchTileData): MatchState {
    if (matched.has(tile.pairId)) return "matched";
    if (mismatch.includes(tile.key)) return "mismatch";
    return picked === tile.key ? "selected" : "idle";
  }

  return { matched, tap, reset, stateOf };
}

export type MatchBoard = ReturnType<typeof useMatchBoard>;
