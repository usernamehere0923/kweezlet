import type { ReactNode } from "react";
import { cx } from "../cx";

export type MatchState = "idle" | "selected" | "matched" | "mismatch";

/** A tile in the matching game. Matched tiles fade out; a mismatch shakes. */
export function MatchTile({
  label,
  state = "idle",
  onClick,
}: {
  label: ReactNode;
  state?: MatchState;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={state === "matched"}
      className={cx(
        "flex min-h-20 items-center justify-center rounded-ui-lg border-2 p-3 text-center text-[15px] font-medium text-ink transition-all duration-300",
        state === "idle" && "border-line-soft bg-surface hover:border-teal hover:shadow-raised",
        state === "selected" && "border-accent bg-accent-wash",
        state === "matched" && "scale-95 border-correct bg-correct-wash opacity-0",
        state === "mismatch" && "animate-shake border-wrong bg-wrong-wash",
      )}
    >
      {label}
    </button>
  );
}
