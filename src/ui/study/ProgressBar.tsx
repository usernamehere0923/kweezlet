import { useT } from "../../i18n";
import { cx } from "../cx";

const segment = "h-full transition-[width] duration-500 ease-out";

/**
 * Progress through a set. Plain: value/max. Segmented: known + learning out of
 * max, the rest is new. `compact`: a thin bar without the counts, for lists.
 * It wipes in from the left when it mounts; later changes slide.
 */
export function ProgressBar({
  value,
  max,
  learning,
  label,
  compact,
}: {
  value: number;
  max: number;
  /** Optional second segment (orange) after the green "known" part. */
  learning?: number;
  label?: string;
  compact?: boolean;
}) {
  const { t } = useT();
  const pct = (n: number) => `${max ? Math.min(100, (n / max) * 100) : 0}%`;
  const segmented = learning !== undefined;
  return (
    <div>
      {segmented && !compact && (
        <div className="mb-2 flex justify-between gap-3 text-sm font-medium">
          <span className="text-correct">
            {t("study.known")} {value}
          </span>
          <span className="text-accent-strong">
            {t("study.learning")} {learning}
          </span>
          <span className="text-muted">
            {t("study.new")} {Math.max(0, max - value - learning)}
          </span>
        </div>
      )}
      <div
        role="progressbar"
        aria-label={label ?? t("study.progress")}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        // isolate: Safari otherwise leaks the square fill past the rounded track mid-wipe.
        className={cx(
          "isolate w-full animate-track-in overflow-hidden rounded-full bg-sunken",
          compact ? "h-1.5" : "h-2",
        )}
      >
        <div className="flex size-full origin-left animate-wipe-in">
          <div className={cx(segment, segmented ? "bg-correct" : "bg-accent")} style={{ width: pct(value) }} />
          {segmented && <div className={cx(segment, "bg-accent")} style={{ width: pct(learning) }} />}
        </div>
      </div>
    </div>
  );
}
