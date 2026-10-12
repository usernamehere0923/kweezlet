import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import type { ReviewCard, ReviewOverview } from "../../worker/review";
import { useT } from "../i18n";
import { api } from "../lib/api";
import { useLive } from "../lib/live";
import { buildQuestion, type TestQuestion } from "../lib/quiz";
import { gradeAnswer, shuffle, useStudyDay } from "../lib/study";
import {
  AnswerInput,
  AnswerOption,
  ButtonLink,
  Card,
  EmptyState,
  FeedbackBanner,
  Heading,
  PageLoading,
  ResultSummary,
  StreakBadge,
  Tag,
  Text,
  type AnswerState,
} from "../ui";

/**
 * The review session: every term whose interval has elapsed, across all sets,
 * asked in the Learn style. A card is out of the round once it is answered
 * correctly; a mistake brings it back later. Answering goes through
 * POST /api/terms/:id/answer, which also schedules the next review.
 */
export function ReviewPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const streak = useStudyDay();
  const [overview, setOverview] = useState<ReviewOverview | null>(null);
  const [cards, setCards] = useState<ReviewCard[]>([]);
  const [question, setQuestion] = useState<TestQuestion | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const [typed, setTyped] = useState("");
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [left, setLeft] = useState(0);
  const [view, setView] = useState<"questions" | "summary">("questions");
  // The round lives outside the render: the ids still to ask.
  const queue = useRef<number[]>([]);

  const draw = useCallback((pool: ReviewCard[]) => {
    // One pass per queued id: cards answered elsewhere are skipped.
    for (;;) {
      const next = queue.current.shift();
      if (next === undefined) {
        setQuestion(null);
        setLeft(0);
        setView("summary");
        return;
      }
      const card = pool.find((candidate) => candidate.id === next);
      if (card) {
        setQuestion(buildQuestion(pool, card));
        setLeft(queue.current.length + 1);
        setPicked(null);
        setFeedback(null);
        setTyped("");
        return;
      }
    }
  }, []);

  const startRound = useCallback(
    (pool: ReviewCard[]) => {
      queue.current = shuffle(pool.map((card) => card.id));
      setScore({ correct: 0, total: 0 });
      setView("questions");
      draw(pool);
    },
    [draw],
  );

  const load = useCallback(
    (first: boolean) =>
      api.review.$get({ query: {} }).then(async (res) => {
        if (!res.ok) return;
        const data = await res.json();
        setOverview(data);
        // Only the first load opens a round; later updates keep it running.
        if (first && data.cards.length > 0) {
          setCards(data.cards);
          startRound(data.cards);
        }
      }),
    [startRound],
  );

  useEffect(() => void load(true), [load]);
  // Another device reviewed or answered something: refresh the counts.
  useLive("study", () => void load(false));

  function submitAnswer(correct: boolean, given: string) {
    // Enter in the read-only answer box must not count the answer twice.
    if (!question || feedback) return;
    // A mistake comes back later in this round.
    if (!correct) queue.current.push(question.termId);
    setPicked(given);
    setFeedback(correct ? "correct" : "wrong");
    setScore((s) => ({ correct: s.correct + (correct ? 1 : 0), total: s.total + 1 }));
    void api.terms[":id"].answer.$post({ param: { id: String(question.termId) }, json: { correct } });
  }

  if (!overview) {
    return <PageLoading label={t("common.loading")} />;
  }

  const optionState = (option: string): AnswerState =>
    !feedback ? "idle" : option === question?.answer ? "correct" : option === picked ? "wrong" : "idle";

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between gap-2">
        <ButtonLink to="/" variant="ghost" icon="chevronLeft" className="-ml-3">
          {t("sets.back")}
        </ButtonLink>
        {streak > 0 && <StreakBadge days={streak} />}
      </div>

      <Heading level={3} className="mb-3">
        {t("review.title")}
      </Heading>

      {view === "summary" ? (
        <ResultSummary
          correct={score.correct}
          total={score.total}
          onStudyAgain={() => startRound(cards)}
          onDone={() => navigate("/")}
        />
      ) : question ? (
        <>
          <div className="mb-5">
            <Tag tone="neutral">
              {t("learn.remaining")} {left}
            </Tag>
          </div>

          <Card className="mb-5">
            <Text variant="small">{t(question.label)}</Text>
            <Heading className="mt-1">{question.prompt}</Heading>
          </Card>

          {question.kind === "written" ? (
            <AnswerInput
              value={typed}
              onChange={setTyped}
              state={feedback ?? "idle"}
              onSubmit={() => submitAnswer(gradeAnswer(typed, question.answer), typed)}
            />
          ) : (
            <div className="flex flex-col gap-3">
              {question.options.map((option, i) => (
                <AnswerOption
                  key={option}
                  label={option}
                  shortcut={i + 1}
                  state={optionState(option)}
                  disabled={feedback !== null}
                  onSelect={() => submitAnswer(option === question.answer, option)}
                />
              ))}
            </div>
          )}

          {feedback && (
            <div className="mt-5">
              <FeedbackBanner state={feedback} correctAnswer={question.answer} onContinue={() => draw(cards)} />
            </div>
          )}
        </>
      ) : (
        <EmptyState
          icon="checkCircle"
          title={t("review.caughtUpTitle")}
          text={t("review.caughtUpText")}
          action={<ButtonLink to="/">{t("notFound.action")}</ButtonLink>}
        />
      )}
    </div>
  );
}
