import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useT } from "../i18n";
import { useStudySet } from "../lib/studySet";
import { useMatchBoard } from "../lib/matchBoard";
import { buildMatchRound, buildTest, scoreTest, type QuestionKind, type TestPaper } from "../lib/quiz";
import { formatTime, useStudyDay } from "../lib/study";
import {
  AnswerOption,
  Button,
  ButtonLink,
  Card,
  Checkbox,
  EmptyState,
  Heading,
  MatchTile,
  ResultSummary,
  SegmentedControl,
  PageLoading,
  StreakBadge,
  Tag,
  Text,
  TextField,
  type AnswerState,
} from "../ui";

type TimerChoice = "off" | "5" | "10";
type LengthChoice = "5" | "10" | "all";

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

export function TestPage() {
  const { t, tn } = useT();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [view, setView] = useState<"setup" | "paper" | "result">("setup");

  // Setup choices
  const [length, setLength] = useState<LengthChoice>("5");
  const [kinds, setKinds] = useState<Record<QuestionKind, boolean>>({
    choice: true,
    truefalse: true,
    written: true,
  });
  const [withMatching, setWithMatching] = useState(true);
  const [timer, setTimer] = useState<TimerChoice>("off");

  // The paper and the answers on it
  const [paper, setPaper] = useState<TestPaper | null>(null);
  const [answers, setAnswers] = useState<(string | null)[]>([]);
  // A matching-only paper has no answers to give: handing it in counts too.
  const streak = useStudyDay(view === "result" || answers.some((answer) => answer !== null));
  const [deadline, setDeadline] = useState<number | null>(null);

  const [set] = useStudySet(id, ["sets"]);
  // Time is up: hand in the paper.
  const timeUp = useCallback(() => setView("result"), []);

  const tiles = useMemo(() => (paper ? buildMatchRound(paper.matching, paper.matching.length) : []), [paper]);
  const board = useMatchBoard(tiles);

  function start() {
    if (!set) return;
    const types = (Object.keys(kinds) as QuestionKind[]).filter((kind) => kinds[kind]);
    const next = buildTest(set.terms, {
      count: length === "all" ? set.terms.length : Number(length),
      types,
      matching: withMatching,
    });
    setPaper(next);
    setAnswers(Array<string | null>(next.questions.length).fill(null));
    board.reset();
    setDeadline(timer === "off" ? null : Date.now() + Number(timer) * 60_000);
    setView("paper");
  }

  function answer(questionIndex: number, given: string) {
    setAnswers((list) => list.map((value, i) => (i === questionIndex ? given : value)));
  }

  if (!set) {
    return <PageLoading label={t("common.loading")} />;
  }

  const canStart = withMatching || Object.values(kinds).some(Boolean);
  const score = paper ? scoreTest(paper, answers, board.matched.size) : null;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between gap-2">
        <ButtonLink to={`/sets/${id}`} variant="ghost" icon="chevronLeft" className="-ml-3">
          {t("study.backToSet")}
        </ButtonLink>
        {streak > 0 && <StreakBadge days={streak} />}
      </div>

      <Heading level={3} className="mb-4">
        {set.title}
      </Heading>

      {set.terms.length === 0 ? (
        <EmptyState icon="checkCircle" title={t("test.emptyTitle")} text={t("test.emptyText")} />
      ) : view === "setup" ? (
        <div className="flex flex-col gap-5">
          <Card>
            <Heading level={3} className="mb-3">
              {t("test.length")}
            </Heading>
            <SegmentedControl<LengthChoice>
              label={t("test.length")}
              value={length}
              onChange={setLength}
              options={[
                { value: "5", label: "5" },
                { value: "10", label: "10" },
                { value: "all", label: t("test.lengthAll") },
              ]}
            />
          </Card>

          <Card>
            <Heading level={3} className="mb-4">
              {t("test.types")}
            </Heading>
            <div className="flex flex-col gap-3">
              <Checkbox
                label={t("test.multipleChoice")}
                checked={kinds.choice}
                onChange={(checked) => setKinds((all) => ({ ...all, choice: checked }))}
              />
              <Checkbox
                label={t("test.trueFalse")}
                checked={kinds.truefalse}
                onChange={(checked) => setKinds((all) => ({ ...all, truefalse: checked }))}
              />
              <Checkbox
                label={t("test.written")}
                checked={kinds.written}
                onChange={(checked) => setKinds((all) => ({ ...all, written: checked }))}
              />
              <Checkbox label={t("test.matching")} checked={withMatching} onChange={setWithMatching} />
            </div>
          </Card>

          <Card>
            <Heading level={3} className="mb-3">
              {t("test.timer")}
            </Heading>
            <SegmentedControl<TimerChoice>
              label={t("test.timer")}
              value={timer}
              onChange={setTimer}
              options={[
                { value: "off", label: t("test.timerOff") },
                { value: "5", label: tn("test.minutes", 5) },
                { value: "10", label: tn("test.minutes", 10) },
              ]}
            />
          </Card>

          <div>
            <Button icon="checkCircle" disabled={!canStart} onClick={start}>
              {t("test.start")}
            </Button>
          </div>
        </div>
      ) : view === "paper" && paper ? (
        <>
          <div className="mb-5 flex items-center justify-between gap-3">
            {deadline === null ? (
              <Text variant="small">{tn("study.terms", paper.questions.length + paper.matching.length)}</Text>
            ) : (
              <TimeLeft deadline={deadline} onUp={timeUp} />
            )}
            <Button icon="check" onClick={() => setView("result")}>
              {t("test.finish")}
            </Button>
          </div>

          {paper.questions.map((question, i) => (
            <Card key={i} className="mb-4">
              <Text variant="small" className="mb-1">
                {i + 1}. {t(question.label)}
              </Text>
              <Heading className="mb-4">{question.prompt}</Heading>
              {question.kind === "written" ? (
                <TextField
                  label={t("study.yourAnswer")}
                  value={answers[i] ?? ""}
                  onChange={(value) => answer(i, value)}
                  maxLength={1000}
                />
              ) : (
                <div className="flex flex-col gap-3">
                  {question.options.map((option) => {
                    const state: AnswerState = answers[i] === option ? "selected" : "idle";
                    return (
                      <AnswerOption
                        key={option}
                        label={
                          question.kind === "truefalse"
                            ? option === "true"
                              ? t("test.true")
                              : t("test.false")
                            : option
                        }
                        state={state}
                        onSelect={() => answer(i, option)}
                      />
                    );
                  })}
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
                {t("test.matchingHint")}
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
      ) : paper && score ? (
        <ResultSummary
          correct={score.correct}
          total={score.total}
          onStudyAgain={start}
          onDone={() => navigate(`/sets/${id}`)}
        />
      ) : null}
    </div>
  );
}
