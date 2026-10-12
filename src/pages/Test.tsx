import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import type { SetDetail } from "../../worker/sets";
import { useT } from "../i18n";
import { api } from "../lib/api";
import { useLive } from "../lib/live";
import {
  buildMatchRound,
  buildTest,
  scoreTest,
  type MatchTileData,
  type QuestionKind,
  type TestPaper,
} from "../lib/quiz";
import { formatTime, useStudyDay } from "../lib/study";
import {
  AnswerOption,
  Button,
  ButtonLink,
  Card,
  Checkbox,
  Heading,
  MatchTile,
  ResultSummary,
  SegmentedControl,
  Spinner,
  StreakBadge,
  Tag,
  Text,
  TextField,
  type AnswerState,
  type MatchState,
} from "../ui";

type TimerChoice = "off" | "5" | "10";
type LengthChoice = "5" | "10" | "all";

export function TestPage() {
  const { t, tn } = useT();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const streak = useStudyDay();
  const [set, setSet] = useState<SetDetail | null>(null);
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
  const [matched, setMatched] = useState<Set<number>>(new Set());
  const [pickedTile, setPickedTile] = useState<string | null>(null);
  const [mismatch, setMismatch] = useState<string | null>(null);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(
    () =>
      api.sets[":id"].$get({ param: { id } }).then(async (res) => {
        if (!res.ok) {
          navigate(`/sets/${id}`);
          return;
        }
        setSet(await res.json());
      }),
    [id, navigate],
  );

  useEffect(() => void load(), [load]);
  useLive("sets", () => void load());

  // The clock: when the deadline passes, the paper is over.
  useEffect(() => {
    if (deadline === null || view !== "paper") return;
    const tick = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(tick);
  }, [deadline, view]);

  const tiles = useMemo(() => (paper ? buildMatchRound(paper.matching, paper.matching.length) : []), [paper]);

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
    setMatched(new Set());
    setPickedTile(null);
    setMismatch(null);
    setNow(Date.now());
    setDeadline(timer === "off" ? null : Date.now() + Number(timer) * 60_000);
    setView("paper");
  }

  function answer(questionIndex: number, given: string) {
    setAnswers((list) => list.map((value, i) => (i === questionIndex ? given : value)));
  }

  function tapTile(tile: MatchTileData) {
    if (matched.has(tile.pairId)) return;
    if (pickedTile === null || pickedTile === tile.key) {
      setPickedTile(pickedTile === tile.key ? null : tile.key);
      return;
    }
    const picked = tiles.find((candidate) => candidate.key === pickedTile);
    if (picked && picked.pairId === tile.pairId && picked.kind !== tile.kind) {
      setMatched((all) => new Set(all).add(tile.pairId));
      setPickedTile(null);
    } else {
      setMismatch(tile.key);
      setTimeout(() => {
        setMismatch(null);
        setPickedTile(null);
      }, 450);
    }
  }

  if (!set) {
    return (
      <div className="flex justify-center py-16 text-muted">
        <Spinner size={28} label={t("common.loading")} />
      </div>
    );
  }

  const expired = deadline !== null && now >= deadline;
  const timeLeft = deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / 1000));
  const canStart = withMatching || Object.values(kinds).some(Boolean);
  const score = paper ? scoreTest(paper, answers, matched.size) : null;

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

      {view === "setup" ? (
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
      ) : view === "paper" && !expired && paper ? (
        <>
          <div className="mb-5 flex items-center justify-between gap-3">
            {timeLeft === null ? (
              <Text variant="small">{tn("study.terms", paper.questions.length + paper.matching.length)}</Text>
            ) : (
              <Tag tone="accent" icon="clock">
                {t("test.timeLeft")} {formatTime(timeLeft)}
              </Tag>
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
                {tiles.map((tile) => {
                  const state: MatchState = matched.has(tile.pairId)
                    ? "matched"
                    : pickedTile === tile.key
                      ? "selected"
                      : mismatch === tile.key
                        ? "mismatch"
                        : "idle";
                  return <MatchTile key={tile.key} label={tile.label} state={state} onClick={() => tapTile(tile)} />;
                })}
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
