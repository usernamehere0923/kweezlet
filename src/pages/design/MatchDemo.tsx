import { useState } from "react";
import { useMatchBoard } from "../../lib/matchBoard";
import { buildMatchRound } from "../../lib/quiz";
import { Button, EmptyState, MatchTile } from "../../ui";
import { ANIMALS } from "./layout";

const PAIRS = ANIMALS.slice(0, 3).map((animal, id) => ({ id, ...animal }));

/** A tiny matching game on the real board logic, only to show the tile states. */
export function MatchDemo() {
  const [tiles, setTiles] = useState(() => buildMatchRound(PAIRS, PAIRS.length));
  const board = useMatchBoard(tiles);

  if (board.matched.size === PAIRS.length) {
    return (
      <EmptyState
        icon="checkCircle"
        title="All matched!"
        action={
          <Button
            variant="secondary"
            icon="retry"
            onClick={() => {
              setTiles(buildMatchRound(PAIRS, PAIRS.length));
              board.reset();
            }}
          >
            Again
          </Button>
        }
      />
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {tiles.map((tile) => (
        <MatchTile key={tile.key} label={tile.label} state={board.stateOf(tile)} onClick={() => void board.tap(tile)} />
      ))}
    </div>
  );
}
