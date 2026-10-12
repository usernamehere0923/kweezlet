import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import type { SetDetail, SetTerm } from "../../worker/sets";
import { useT, type TKey } from "../i18n";
import { api } from "../lib/api";
import { useLive } from "../lib/live";
import { gradeAnswer, shuffle, useStudyDay } from "../lib/study";
import {
  AnswerInput,
  AnswerOption,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  FeedbackBanner,
  Heading,
  ResultSummary,
  Spinner,
  StreakBadge,
  Tag,
  Text,
  type AnswerState,
} from "../ui";

/** Two correct answers in a row learn a term. */
const MASTERY = 2;

type Question = {
  termId: number;
  /** What the user sees; `answer` is what they must give. */
  prompt: string;
  answer: string;
  label: TKey;
  options: string[];
  written: boolean;
};

function buildQuestion(terms: SetTerm[], term: SetTerm): Question {
  // Half the time the user names the term for a definition, half the time the
  // other way round.
  const askTerm = Math.random() < 0.5;
  const answer = askTerm ? term.term : term.definition;
  const distractors = shuffle(terms.filter((other) => other.id !== term.id))
    .slice(0, 3)
    .map((other) => (askTerm ? other.term : other.definition));
  return {
    termId: term.id,
    prompt: askTerm ? term.definition : term.term,
    answer,
    label: askTerm ? "learn.askTerm" : "learn.askDefinition",
    options: shuffle([...new Set([answer, ...distractors])]),
    // Written from the first correct answer on. Without other terms there is
    // nothing to choose from, so those are written from the start.
    written: term.streak >= 1 || terms.length < 2,
  };
}

export function LearnPage() {
  const { t } = useT();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const streak = useStudyDay();
  const [set, setSet] = useState<SetDetail | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const [typed, setTyped] = useState("");
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [view, setView] = useState<"questions" | "summary" | "allLearned">("questions");
  // The round lives outside the render: terms still to ask (ids) and how many
  // of this round's two correct answers each of them has.
  const queue = useRef<number[]>([]);
  const round = useRef(new Map<number, number>());

  const draw = useCallback((terms: SetTerm[]) => {
    // One pass per queued id: terms deleted elsewhere are skipped.
    for (;;) {
      const next = queue.current.shift();
      if (next === undefined) {
        setQuestion(null);
        setView("summary");
        return;
      }
      const term = terms.find((candidate) => candidate.id === next);
      if (term) {
        setQuestion(buildQuestion(terms, term));
        setPicked(null);
        setFeedback(null);
        setTyped("");
        return;
      }
    }
  }, []);

  const startRound = useCallback(
    (all: SetTerm[], pick: SetTerm[]) => {
      round.current = new Map();
      queue.current = shuffle(pick.map((term) => term.id));
      setScore({ correct: 0, total: 0 });
      setView("questions");
      draw(all);
    },
    [draw],
  );

  /** Start where the user left off: only the terms not learned yet. */
  const begin = useCallback(
    (terms: SetTerm[]) => {
      const remaining = terms.filter((term) => term.streak < MASTERY);
      if (remaining.length === 0) {
        setQuestion(null);
        setView("allLearned");
        return;
      }
      startRound(terms, remaining);
    },
    [startRound],
  );

  const load = useCallback(
    (start: boolean) =>
      api.sets[":id"].$get({ param: { id } }).then(async (res) => {
        if (!res.ok) {
          navigate(`/sets/${id}`);
          return;
        }
        const data = await res.json();
        setSet(data);
        if (start) begin(data.terms);
      }),
    [id, navigate, begin],
  );

  useEffect(() => void load(true), [load]);
  // Another device answered or renamed something: catch up, keep the question.
  useLive("study", () => void load(false));
  useLive("sets", () => void load(false));

  async function postAnswer(termId: number, correct: boolean) {
    const res = await api.terms[":id"].answer.$post({ param: { id: String(termId) }, json: { correct } });
    if (res.ok) {
      const saved = await res.json();
      setSet((s) =>
        s
          ? {
              ...s,
              terms: s.terms.map((term) =>
                term.id === termId ? { ...term, streak: saved.streak, status: saved.status } : term,
              ),
            }
          : s,
      );
    }
  }

  function submitAnswer(correct: boolean, given: string) {
    // Enter in the read-only answer box must not count the answer twice.
    if (!question || feedback) return;
    const inRound = (round.current.get(question.termId) ?? 0) + (correct ? 1 : 0);
    round.current.set(question.termId, correct ? inRound : 0);
    // Mistakes and half-learned terms come back later in this round.
    if (!(correct && inRound >= MASTERY)) queue.current.push(question.termId);
    setPicked(given);
    setFeedback(correct ? "correct" : "wrong");
    setScore((s) => ({ correct: s.correct + (correct ? 1 : 0), total: s.total + 1 }));
    void postAnswer(question.termId, correct);
  }

  if (!set) {
    return (
      <div className="flex justify-center py-16 text-muted">
        <Spinner size={28} label={t("common.loading")} />
      </div>
    );
  }

  const remaining = set.terms.filter((term) => term.streak < 1).length;
  const familiar = set.terms.filter((term) => term.streak === 1).length;
  const mastered = set.terms.filter((term) => term.streak >= MASTERY).length;
  const optionState = (option: string): AnswerState =>
    !feedback ? "idle" : option === question?.answer ? "correct" : option === picked ? "wrong" : "idle";

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between gap-2">
        <ButtonLink to={`/sets/${id}`} variant="ghost" icon="chevronLeft" className="-ml-3">
          {t("study.backToSet")}
        </ButtonLink>
        {streak > 0 && <StreakBadge days={streak} />}
      </div>

      <Heading level={3} className="mb-3">
        {set.title}
      </Heading>

      <div className="mb-5 flex flex-wrap gap-2">
        <Tag tone="neutral">
          {t("learn.remaining")} {remaining}
        </Tag>
        <Tag tone="accent">
          {t("learn.familiar")} {familiar}
        </Tag>
        <Tag tone="correct">
          {t("learn.mastered")} {mastered}
        </Tag>
      </div>

      {view === "allLearned" ? (
        <EmptyState
          icon="learn"
          title={t("learn.allLearnedTitle")}
          text={t("learn.allLearnedText")}
          action={<Button onClick={() => startRound(set.terms, set.terms)}>{t("learn.studyAnyway")}</Button>}
        />
      ) : view === "summary" ? (
        <ResultSummary
          correct={score.correct}
          total={score.total}
          onStudyAgain={() => startRound(set.terms, set.terms)}
          onDone={() => navigate(`/sets/${id}`)}
        />
      ) : (
        question && (
          <>
            <Card className="mb-5">
              <Text variant="small">{t(question.label)}</Text>
              <Heading className="mt-1">{question.prompt}</Heading>
            </Card>

            {question.written ? (
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
                <FeedbackBanner state={feedback} correctAnswer={question.answer} onContinue={() => draw(set.terms)} />
              </div>
            )}
          </>
        )
      )}
    </div>
  );
}
