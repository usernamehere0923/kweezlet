import { useState, type ReactNode } from "react";
import { useT } from "../../i18n";
import { Button, IconButton } from "../Button";
import { cx } from "../cx";
import { Icon } from "../Icon";
import { useHotkey } from "../useHotkey";

/**
 * The big flashcard. Tap it (or press Space) to flip.
 * Controlled: pass `flipped` + `onFlip`. Uncontrolled: leave both out.
 */
export function FlipCard({
  front,
  back,
  flipped: flippedProp,
  onFlip,
  hotkey = true,
}: {
  front: ReactNode;
  back: ReactNode;
  flipped?: boolean;
  onFlip?: (flipped: boolean) => void;
  /** Space flips the card. Turn off when two cards are on one screen. */
  hotkey?: boolean;
}) {
  const { t } = useT();
  const [own, setOwn] = useState(false);
  const flipped = flippedProp ?? own;
  const flip = () => {
    setOwn(!flipped);
    onFlip?.(!flipped);
  };
  useHotkey(" ", flip, hotkey);

  const face =
    "absolute inset-0 flex flex-col items-center justify-center rounded-ui-xl border border-line-soft bg-surface p-8 shadow-raised [backface-visibility:hidden]";
  return (
    <button
      type="button"
      onClick={flip}
      aria-label={t("study.tapToFlip")}
      className="block aspect-[4/3] w-full [perspective:1400px] md:aspect-[16/9]"
    >
      <div
        className={cx(
          "relative size-full transition-transform duration-500 ease-out [transform-style:preserve-3d]",
          flipped && "[transform:rotateY(180deg)]",
        )}
      >
        <div className={face} aria-hidden={flipped}>
          <span className="absolute top-4 left-5 text-xs font-semibold tracking-wide text-faint uppercase">
            {t("study.term")}
          </span>
          <span className="text-center font-serif text-3xl text-ink md:text-4xl">{front}</span>
          <span className="absolute bottom-4 text-xs text-faint">{t("study.tapToFlip")}</span>
        </div>
        <div className={cx(face, "[transform:rotateY(180deg)]")} aria-hidden={!flipped}>
          <span className="absolute top-4 left-5 text-xs font-semibold tracking-wide text-faint uppercase">
            {t("study.definition")}
          </span>
          <span className="text-center text-2xl text-ink-soft md:text-3xl">{back}</span>
        </div>
      </div>
    </button>
  );
}

/** Prev / counter / next under a flashcard. Arrow keys work too. */
export function CardNav({
  index,
  total,
  onPrev,
  onNext,
  onShuffle,
}: {
  /** 0-based */
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onShuffle?: () => void;
}) {
  const { t } = useT();
  const canPrev = index > 0;
  const canNext = index < total - 1;
  useHotkey("ArrowLeft", onPrev, canPrev);
  useHotkey("ArrowRight", onNext, canNext);
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="w-11">
        {onShuffle && <IconButton icon="retry" label={t("study.shuffle")} onClick={onShuffle} />}
      </div>
      <div className="flex items-center gap-4">
        <IconButton
          icon="chevronLeft"
          variant="secondary"
          label={t("study.prev")}
          onClick={onPrev}
          disabled={!canPrev}
        />
        <span className="min-w-16 text-center text-[15px] font-semibold text-ink-soft tabular-nums">
          {t("study.counter", { current: index + 1, total })}
        </span>
        <IconButton
          icon="chevronRight"
          variant="secondary"
          label={t("study.next")}
          onClick={onNext}
          disabled={!canNext}
        />
      </div>
      <div className="w-11" />
    </div>
  );
}

/**
 * Progress through a set. Plain: value/max. Segmented: known + learning out of max.
 */
export function ProgressBar({
  value,
  max,
  learning,
  label,
}: {
  value: number;
  max: number;
  /** Optional second segment (orange) after the green "known" part. */
  learning?: number;
  label?: string;
}) {
  const { t } = useT();
  const pct = (n: number) => `${max ? Math.min(100, (n / max) * 100) : 0}%`;
  const segmented = learning !== undefined;
  return (
    <div>
      {segmented && (
        <div className="mb-2 flex justify-between text-sm font-medium">
          <span className="text-correct">
            {t("study.known")} {value}
          </span>
          <span className="text-accent-strong">
            {t("study.learning")} {learning}
          </span>
        </div>
      )}
      <div
        role="progressbar"
        aria-label={label ?? t("study.progress")}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        className="flex h-2 w-full overflow-hidden rounded-full bg-sunken"
      >
        <div
          className={cx("h-full transition-[width] duration-300", segmented ? "bg-correct" : "bg-accent")}
          style={{ width: pct(value) }}
        />
        {segmented && (
          <div className="h-full bg-accent transition-[width] duration-300" style={{ width: pct(learning) }} />
        )}
      </div>
    </div>
  );
}

export type AnswerState = "idle" | "selected" | "correct" | "wrong";

const answerStyles: Record<AnswerState, string> = {
  idle: "border-line bg-surface hover:border-teal",
  selected: "border-accent bg-accent-wash",
  correct: "border-correct bg-correct-wash",
  wrong: "border-wrong bg-wrong-wash",
};

/** One multiple-choice answer. `shortcut` 1-4 shows a key hint and makes the key work. */
export function AnswerOption({
  label,
  state = "idle",
  shortcut,
  onSelect,
  disabled,
}: {
  label: ReactNode;
  state?: AnswerState;
  shortcut?: number;
  onSelect: () => void;
  disabled?: boolean;
}) {
  useHotkey(shortcut ? String(shortcut) : undefined, onSelect, !disabled);
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={cx(
        "flex min-h-14 w-full items-center gap-3 rounded-ui-lg border-2 px-4 py-3 text-left text-base text-ink transition-colors disabled:cursor-default",
        answerStyles[state],
        state === "wrong" && "animate-shake",
      )}
    >
      {shortcut !== undefined && (
        <span
          className={cx(
            "flex size-7 shrink-0 items-center justify-center rounded-md text-sm font-semibold",
            state === "idle" ? "bg-sunken text-muted" : "bg-surface/70 text-ink-soft",
          )}
        >
          {shortcut}
        </span>
      )}
      <span className="flex-1">{label}</span>
      {state === "correct" && <Icon name="checkCircle" className="text-correct" />}
      {state === "wrong" && <Icon name="closeCircle" className="text-wrong" />}
    </button>
  );
}

/** Type-the-answer field with a Check button. Colours itself after checking. */
export function AnswerInput({
  value,
  onChange,
  onSubmit,
  state = "idle",
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  state?: "idle" | "correct" | "wrong";
}) {
  const { t } = useT();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="flex flex-col gap-3 sm:flex-row"
    >
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={state !== "idle"}
        aria-label={t("study.yourAnswer")}
        placeholder={t("study.yourAnswer")}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        className={cx(
          "h-13 flex-1 rounded-ui-lg border-2 bg-surface px-4 text-base text-ink outline-none transition-colors",
          state === "idle" && "border-line focus:border-accent",
          state === "correct" && "border-correct bg-correct-wash",
          state === "wrong" && "animate-shake border-wrong bg-wrong-wash",
        )}
      />
      {state === "idle" && (
        <Button type="submit" size="lg" disabled={!value.trim()}>
          {t("study.check")}
        </Button>
      )}
    </form>
  );
}

/** "Correct!" / "Not quite" strip shown after answering. */
export function FeedbackBanner({
  state,
  correctAnswer,
  onContinue,
}: {
  state: "correct" | "wrong";
  /** Shown when wrong. */
  correctAnswer?: ReactNode;
  onContinue: () => void;
}) {
  const { t } = useT();
  const ok = state === "correct";
  return (
    <div
      role="status"
      className={cx(
        "flex animate-slide-up flex-col gap-3 rounded-ui-xl border-2 p-4 sm:flex-row sm:items-center sm:justify-between",
        ok ? "border-correct/40 bg-correct-wash" : "border-wrong/40 bg-wrong-wash",
      )}
    >
      <div className="flex items-start gap-3">
        <Icon name={ok ? "checkCircle" : "closeCircle"} size="1.5rem" className={ok ? "text-correct" : "text-wrong"} />
        <div>
          <p className={cx("text-[17px] font-semibold", ok ? "text-correct" : "text-wrong-strong")}>
            {t(ok ? "study.correct" : "study.wrong")}
          </p>
          {!ok && correctAnswer && (
            <p className="text-[15px] text-ink-soft">{t("study.correctAnswerIs", { answer: String(correctAnswer) })}</p>
          )}
        </div>
      </div>
      <Button onClick={onContinue} variant={ok ? "primary" : "secondary"} autoFocus>
        {t("study.continue")}
      </Button>
    </div>
  );
}

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
        "flex min-h-24 items-center justify-center rounded-ui-lg border-2 p-3 text-center text-[15px] font-medium text-ink transition-all duration-300",
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

/** The two buttons under a flashcard in Flashcards mode. */
export function KnowItButtons({ onStillLearning, onKnowIt }: { onStillLearning: () => void; onKnowIt: () => void }) {
  const { t } = useT();
  return (
    <div className="grid grid-cols-2 gap-3">
      <button
        type="button"
        onClick={onStillLearning}
        className="flex h-14 items-center justify-center gap-2 rounded-ui-lg border-2 border-accent/50 bg-surface text-base font-semibold text-accent-strong transition-colors hover:bg-accent-wash"
      >
        <Icon name="retry" />
        {t("study.stillLearning")}
      </button>
      <button
        type="button"
        onClick={onKnowIt}
        className="flex h-14 items-center justify-center gap-2 rounded-ui-lg border-2 border-correct/50 bg-surface text-base font-semibold text-correct transition-colors hover:bg-correct-wash"
      >
        <Icon name="check" />
        {t("study.knowIt")}
      </button>
    </div>
  );
}
