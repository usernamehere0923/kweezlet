import { useT } from "../../i18n";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { Tag } from "../surfaces";

/** End-of-round screen: score ring, counts, "study again". */
export function ResultSummary({
  correct,
  total,
  onStudyAgain,
  onDone,
}: {
  correct: number;
  total: number;
  onStudyAgain: () => void;
  onDone?: () => void;
}) {
  const { t, formatNumber } = useT();
  const ratio = total ? correct / total : 0;
  const r = 52;
  const circumference = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-6 rounded-ui-xl border border-line-soft bg-surface p-8 text-center">
      <div className="relative size-36">
        <svg viewBox="0 0 120 120" className="size-full -rotate-90">
          <circle cx="60" cy="60" r={r} fill="none" strokeWidth="10" className="stroke-sunken" />
          <circle
            cx="60"
            cy="60"
            r={r}
            fill="none"
            strokeWidth="10"
            strokeLinecap="round"
            className="stroke-correct transition-[stroke-dashoffset] duration-700"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - ratio)}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center font-serif text-4xl text-ink">
          {formatNumber(ratio, { style: "percent" })}
        </span>
      </div>
      <div>
        <h2 className="font-serif text-3xl text-ink">{t("study.resultTitle")}</h2>
        <p className="mt-1 text-muted">{t("study.resultScore", { correct, total })}</p>
      </div>
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
        <Button icon="retry" onClick={onStudyAgain}>
          {t("study.studyAgain")}
        </Button>
        {onDone && (
          <Button variant="ghost" onClick={onDone}>
            {t("study.done")}
          </Button>
        )}
      </div>
    </div>
  );
}

/** The end of a Match round: the time, "new best time!", play again / done. */
export function MatchResult({
  time,
  isNewBest,
  bestTime,
  onPlayAgain,
  onDone,
}: {
  /** The round's duration, already formatted ("0:23"). */
  time: string;
  isNewBest: boolean;
  /** The best time to beat, same format. */
  bestTime: string;
  onPlayAgain: () => void;
  onDone: () => void;
}) {
  const { t } = useT();
  return (
    <div className="flex flex-col items-center gap-6 rounded-ui-xl border border-line-soft bg-surface p-8 text-center">
      {isNewBest && (
        <Tag tone="accent" icon="starFilled">
          {t("match.newBest")}
        </Tag>
      )}
      <div>
        <p className="text-sm font-medium text-muted">{t("match.yourTime")}</p>
        <p className="font-serif text-5xl text-ink tabular-nums">{time}</p>
      </div>
      <p className="text-muted">{t("match.bestTime", { time: bestTime })}</p>
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
        <Button icon="retry" onClick={onPlayAgain}>
          {t("match.playAgain")}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          {t("study.done")}
        </Button>
      </div>
    </div>
  );
}

export function StreakBadge({ days }: { days: number }) {
  const { tn } = useT();
  return (
    <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-accent-wash px-3 text-sm font-semibold text-accent-deep">
      <Icon name="starFilled" size="1rem" className="text-accent" />
      {tn("study.streak", days)}
    </span>
  );
}
