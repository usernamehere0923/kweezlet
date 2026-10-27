import { useState, type ReactNode } from "react";
import { useT } from "../../i18n";
import { IconButton } from "../Button";
import { cx } from "../cx";
import { Icon, type IconName } from "../Icon";
import { SpeakButton, type Speech } from "../speech";
import { studySurface } from "../surfaces";
import { useHotkey } from "../useHotkey";

/** One side of the FlipCard: the corner label, then its content. */
function Face({
  label,
  hidden,
  className,
  children,
}: {
  label: ReactNode;
  hidden: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cx(
        studySurface,
        "absolute inset-0 flex flex-col items-center justify-center p-8 shadow-raised [backface-visibility:hidden]",
        className,
      )}
      aria-hidden={hidden}
    >
      <span className="absolute top-4 left-5 text-xs font-semibold tracking-wide text-faint uppercase">{label}</span>
      {children}
    </div>
  );
}

/**
 * The big flashcard. Tap it (or press Space) to flip.
 * Controlled: pass `flipped` + `onFlip`. Uncontrolled: leave both out.
 * `frontLabel` / `backLabel` override the "Term" / "Definition" corner labels,
 * e.g. when the definition is shown first.
 */
export function FlipCard({
  front,
  back,
  flipped: flippedProp,
  onFlip,
  hotkey = true,
  frontLabel,
  backLabel,
  speak,
}: {
  front: ReactNode;
  back: ReactNode;
  flipped?: boolean;
  onFlip?: (flipped: boolean) => void;
  /** Space flips the card. Turn off when two cards are on one screen. */
  hotkey?: boolean;
  frontLabel?: ReactNode;
  backLabel?: ReactNode;
  /** What the speaker button says out loud: the visible face's text and language. */
  speak?: Speech;
}) {
  const { t } = useT();
  const [own, setOwn] = useState(false);
  const flipped = flippedProp ?? own;
  const flip = () => {
    setOwn(!flipped);
    onFlip?.(!flipped);
  };
  useHotkey(" ", flip, hotkey);

  return (
    <div className="relative block aspect-[4/3] w-full md:aspect-[16/9]">
      {/* perspective only reaches direct children: it sits on the parent of the turning div. */}
      <button
        type="button"
        onClick={flip}
        aria-label={t("study.tapToFlip")}
        className="block size-full [perspective:1400px]"
      >
        <div
          className={cx(
            "relative size-full transition-transform duration-500 ease-out [transform-style:preserve-3d]",
            flipped && "[transform:rotateY(180deg)]",
          )}
        >
          <Face label={frontLabel ?? t("study.term")} hidden={flipped}>
            <span className="text-center font-display text-3xl text-ink md:text-4xl">{front}</span>
            <span className="absolute bottom-4 text-xs text-faint">{t("study.tapToFlip")}</span>
          </Face>
          <Face label={backLabel ?? t("study.definition")} hidden={!flipped} className="[transform:rotateY(180deg)]">
            <span className="text-center text-2xl text-ink-soft md:text-3xl">{back}</span>
          </Face>
        </div>
      </button>
      {/* A sibling of the flip button, never inside it: buttons cannot nest. */}
      {speak && <SpeakButton speech={speak} className="absolute right-3 bottom-3 z-10" />}
    </div>
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

const knowTones = {
  learning: "border-accent/50 text-accent-strong hover:bg-accent-wash",
  known: "border-correct/50 text-correct hover:bg-correct-wash",
};

function KnowButton({
  tone,
  icon,
  label,
  onClick,
}: {
  tone: keyof typeof knowTones;
  icon: IconName;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "flex h-14 items-center justify-center gap-2 rounded-ui-lg border-2 bg-surface text-base font-semibold transition-colors",
        knowTones[tone],
      )}
    >
      <Icon name={icon} />
      {label}
    </button>
  );
}

/** The two buttons under a flashcard in Flashcards mode. */
export function KnowItButtons({ onStillLearning, onKnowIt }: { onStillLearning: () => void; onKnowIt: () => void }) {
  const { t } = useT();
  return (
    <div className="grid grid-cols-2 gap-3">
      <KnowButton tone="learning" icon="retry" label={t("study.stillLearning")} onClick={onStillLearning} />
      <KnowButton tone="known" icon="check" label={t("study.knowIt")} onClick={onKnowIt} />
    </div>
  );
}
