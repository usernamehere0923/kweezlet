import { useEffect, useState } from "react";
import { useT } from "../../i18n";
import { formatTime } from "../../lib/formatTime";
import type { MatchBoard } from "../../lib/matchBoard";
import type { MatchTileData, TestPaper } from "../../lib/quiz";
import { AnswerOption, Button, Card, Heading, MatchTile, Tag, TermImage, Text, TextField } from "../../ui";

/** The countdown on the paper. It ticks on its own, so the paper itself does not re-render. */
function TimeLeft({ deadline, onUp }: { deadline: number; onUp: () => void }) {
  const { t } = useT();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = setInterval(() => {
      const at = Date.now();
      setNow(at);
      if (at >= deadline) onUp();
    }, 500);
    return () => clearInterval(tick);
  }, [deadline, onUp]);
  return (
    <Tag tone="accent" icon="clock">
      {t("test.timeLeft")} {formatTime(Math.max(0, Math.ceil((deadline - now) / 1000)))}
    </Tag>
  );
}

/** The test paper: every question with its answer field, then the matching round. */
export function TestPaperView({
  paper,
  answers,
  images,
  onAnswer,
  tiles,
  board,
  deadline,
  onTimeUp,
  onFinish,
}: {
  paper: TestPaper;
  answers: (string | null)[];
  /** Term id -> data URL; shown only on questions whose prompt is the term. */
  images?: Record<number, string>;
  onAnswer: (questionIndex: number, given: string) => void;
  tiles: MatchTileData[];
  board: MatchBoard;
  /** When the timer runs out; null = no timer. */
  deadline: number | null;
  onTimeUp: () => void;
  onFinish: () => void;
}) {
  const { t, tn } = useT();
  return (
    <>
      <div className="mb-5 flex items-center justify-between gap-3">
        {deadline === null ? (
          <Text variant="small">{tn("study.terms", paper.questions.length + paper.matching.length)}</Text>
        ) : (
          <TimeLeft deadline={deadline} onUp={onTimeUp} />
        )}
        <Button icon="check" onClick={onFinish}>
          {t("test.finish")}
        </Button>
      </div>

      {paper.questions.map((question, i) => (
        <Card key={i} className="mb-4">
          <Text variant="small" className="mb-1">
            {i + 1}. {t(question.label)}
          </Text>
          <Heading className="mb-4">{question.prompt}</Heading>
          {/* The picture only on questions that show the term: never one that asks for it. */}
          {question.promptSide === "term" && images?.[question.termId] && (
            <div className="mb-4 flex justify-center">
              <TermImage src={images[question.termId]} alt="" />
            </div>
          )}
          {question.kind === "written" ? (
            <TextField
              label={t("study.yourAnswer")}
              value={answers[i] ?? ""}
              onChange={(value) => onAnswer(i, value)}
              maxLength={1000}
            />
          ) : (
            <div className="flex flex-col gap-3">
              {question.options.map((option) => (
                <AnswerOption
                  key={option}
                  label={
                    question.kind === "truefalse" ? (option === "true" ? t("test.true") : t("test.false")) : option
                  }
                  state={answers[i] === option ? "selected" : "idle"}
                  onSelect={() => onAnswer(i, option)}
                />
              ))}
            </div>
          )}
        </Card>
      ))}

      {paper.matching.length > 0 && (
        <Card className="mb-4">
          <Text variant="small" className="mb-1">
            {t("test.matching")}
          </Text>
          <Text variant="muted" className="mb-4">
            {t("study.matchingHint")}
          </Text>
          <div className="grid grid-cols-2 gap-3">
            {tiles.map((tile) => (
              <MatchTile
                key={tile.key}
                label={tile.label}
                state={board.stateOf(tile)}
                onClick={() => void board.tap(tile)}
              />
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
