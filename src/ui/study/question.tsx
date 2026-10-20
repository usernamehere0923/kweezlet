import type { ReactNode } from "react";
import { useT } from "../../i18n";
import { Button } from "../Button";
import { cx } from "../cx";
import { Icon } from "../Icon";
import { SpeakButton, type Speech } from "../speech";
import { Card } from "../surfaces";
import { Heading, Text } from "../Text";
import { useHotkey } from "../useHotkey";

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
  chosen = true,
}: {
  label: ReactNode;
  state?: AnswerState;
  /** The user picked this one. A correct pick pops; the right answer shown after a wrong pick doesn't. */
  chosen?: boolean;
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
        state === "correct" && chosen && "animate-pop-sm",
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
      {state === "correct" && <Icon name="checkCircle" className={cx("text-correct", chosen && "animate-pop-in")} />}
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
          // flex-1 only side by side: in the phone column it would squash the height.
          "h-13 rounded-ui-lg sm:flex-1 border-2 bg-surface px-4 text-base text-ink outline-none transition-colors",
          state === "idle" && "border-line focus:border-accent",
          state === "correct" && "animate-pop-sm border-correct bg-correct-wash",
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

/**
 * One Learn-style question with its answer area and, once answered, the
 * feedback strip. `options` empty = type the answer. Pair it with
 * useQuestionRound() (src/lib/questionRound.ts), which grades the answer.
 */
export function QuestionCard({
  label,
  prompt,
  answer,
  options,
  typed,
  onTyped,
  picked,
  feedback,
  onPick,
  onSubmitTyped,
  onContinue,
  speak,
}: {
  /** Already translated, e.g. "Give the definition". */
  label: ReactNode;
  prompt: ReactNode;
  /** The right option or the expected text, shown when the answer was wrong. */
  answer: string;
  options: string[];
  typed: string;
  onTyped: (value: string) => void;
  /** The option or text the user gave, null before answering. */
  picked: string | null;
  feedback: "correct" | "wrong" | null;
  onPick: (option: string) => void;
  onSubmitTyped: () => void;
  onContinue: () => void;
  /** What the speaker button says out loud: the prompt and its language. */
  speak?: Speech;
}) {
  const optionState = (option: string): AnswerState =>
    !feedback ? "idle" : option === answer ? "correct" : option === picked ? "wrong" : "idle";
  return (
    <>
      <Card className="mb-5">
        <div className="flex items-start justify-between gap-2">
          <Text variant="small">{label}</Text>
          {speak && <SpeakButton speech={speak} />}
        </div>
        <Heading className="mt-1">{prompt}</Heading>
      </Card>

      {options.length === 0 ? (
        <AnswerInput value={typed} onChange={onTyped} state={feedback ?? "idle"} onSubmit={onSubmitTyped} />
      ) : (
        <div className="flex flex-col gap-3">
          {options.map((option, i) => (
            <AnswerOption
              key={option}
              label={option}
              shortcut={i + 1}
              state={optionState(option)}
              chosen={option === picked}
              disabled={feedback !== null}
              onSelect={() => onPick(option)}
            />
          ))}
        </div>
      )}

      {feedback && (
        <div className="mt-5">
          <FeedbackBanner state={feedback} correctAnswer={answer} onContinue={onContinue} />
        </div>
      )}
    </>
  );
}
