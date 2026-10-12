import { useT } from "../../i18n";
import { Button } from "../Button";
import { cx } from "../cx";
import { Icon } from "../Icon";
import { Confetti, useCountUp } from "../motion";
import { Tag } from "../surfaces";

/** Confetti from this score on: a celebration, not a consolation. */
const CELEBRATE_FROM = 0.8;

/**
 * End-of-round screen: score ring, counts, "study again". The ring fills
 * and the percentage counts up; a good score pops and throws confetti.
 */
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
  const shown = useCountUp(ratio);
  const landed = shown === ratio;
  const r = 52;
  const circumference = 2 * Math.PI * r;
  return (
    <div className="relative flex flex-col items-center gap-6 rounded-ui-xl border border-line-soft bg-surface p-8 text-center">
      {landed && ratio >= CELEBRATE_FROM && <Confetti />}
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
            className="stroke-correct"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - shown)}
          />
        </svg>
        <span
          className={cx(
            "absolute inset-0 flex items-center justify-center font-serif text-4xl text-ink tabular-nums",
            landed && ratio > 0 && "animate-pop",
          )}
        >
          {formatNumber(shown, { style: "percent" })}
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

/** The end of a Match round: the time, "new best time!" (with confetti), play again / done. */
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
    <div className="relative flex flex-col items-center gap-6 rounded-ui-xl border border-line-soft bg-surface p-8 text-center">
      {isNewBest && (
        <>
          <Confetti />
          {/* Lands after the time has been read. */}
          <span className="animate-pop-in [animation-delay:400ms]">
            <Tag tone="accent" icon="starFilled">
              {t("match.newBest")}
            </Tag>
          </span>
        </>
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

/** Days studied in a row. `notYetToday` adds a nudge: today isn't studied yet. */
export function StreakBadge({ days, notYetToday }: { days: number; notYetToday?: boolean }) {
  const { t, tn } = useT();
  const badge = (
    <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-accent-wash px-3 text-sm font-semibold text-accent-deep">
      <Icon name="starFilled" size="1rem" className="text-accent" />
      {tn("study.streak", days)}
    </span>
  );
  if (!notYetToday) return badge;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      {badge}
      <span className="text-sm text-muted">{t("study.streakKeep")}</span>
    </span>
  );
}
