import { useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { MASTERY, termProgress } from "../../worker/progress";
import type { SetTerm } from "../../worker/sets";
import { useT } from "../i18n";
import { api } from "../lib/api";
import { useStudySet } from "../lib/studySet";
import { useQuestionRound, type Answered } from "../lib/questionRound";
import { buildQuestion, shuffle } from "../lib/quiz";
import { useStudyDay } from "../lib/studyDay";
import { Button, ButtonLink, EmptyState, Heading, PageLoading, ResultSummary, StreakBadge, Tag } from "../ui";
import { RoundQuestion } from "./RoundQuestion";

export function LearnPage() {
  const { t } = useT();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const round = useQuestionRound();
  const streak = useStudyDay(round.score.total > 0);
  const [allLearned, setAllLearned] = useState(false);
  // How many of this round's two correct answers each term has.
  const inRound = useRef(new Map<number, number>());

  const askFrom = (terms: SetTerm[]) => (termId: number) => {
    // Terms deleted elsewhere are skipped.
    const term = terms.find((candidate) => candidate.id === termId);
    return term ? buildQuestion(terms, term) : null;
  };

  function startRound(all: SetTerm[], pick: SetTerm[]) {
    inRound.current = new Map();
    setAllLearned(false);
    round.start(shuffle(pick.map((term) => term.id)), askFrom(all));
  }

  /** Start where the user left off: only the terms not learned yet. */
  function begin(terms: SetTerm[]) {
    const remaining = terms.filter((term) => term.streak < MASTERY);
    if (remaining.length === 0) setAllLearned(true);
    else startRound(terms, remaining);
  }

  // Another device answered or renamed something: catch up, keep the question.
  const { set, updateTerm } = useStudySet(id, ["sets", "study"], {
    onLoad: (data, first) => {
      if (first) begin(data.terms);
    },
  });

  async function postAnswer(termId: number, correct: boolean) {
    const res = await api.terms[":id"].answer.$post({ param: { id: String(termId) }, json: { correct } });
    if (res.ok) {
      const saved = await res.json();
      updateTerm(termId, { streak: saved.streak, status: saved.status });
    }
  }

  function onAnswer({ termId, correct }: Answered) {
    const count = (inRound.current.get(termId) ?? 0) + (correct ? 1 : 0);
    inRound.current.set(termId, correct ? count : 0);
    // Mistakes and half-learned terms come back later in this round.
    if (!(correct && count >= MASTERY)) round.askAgain(termId);
    void postAnswer(termId, correct);
  }

  if (!set) {
    return <PageLoading label={t("common.loading")} />;
  }

  const count = (progress: string) => set.terms.filter((term) => termProgress(term) === progress).length;

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
          {t("study.new")} {count("new")}
        </Tag>
        <Tag tone="accent">
          {t("study.learning")} {count("learning")}
        </Tag>
        <Tag tone="correct">
          {t("study.known")} {count("known")}
        </Tag>
      </div>

      {allLearned ? (
        <EmptyState
          icon="learn"
          title={t("learn.allLearnedTitle")}
          text={t("learn.allLearnedText")}
          action={<Button onClick={() => startRound(set.terms, set.terms)}>{t("learn.studyAnyway")}</Button>}
        />
      ) : round.done ? (
        <ResultSummary
          correct={round.score.correct}
          total={round.score.total}
          onStudyAgain={() => startRound(set.terms, set.terms)}
          onDone={() => navigate(`/sets/${id}`)}
        />
      ) : (
        <RoundQuestion
          round={round}
          langs={set}
          onAnswer={onAnswer}
          onContinue={() => round.next(askFrom(set.terms))}
        />
      )}
    </div>
  );
}
