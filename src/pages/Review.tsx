import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import type { ReviewCard } from "../../worker/review";
import { useT } from "../i18n";
import { api, offline } from "../lib/api";
import { useLive } from "../lib/live";
import { useQuestionRound, type Answered } from "../lib/questionRound";
import { buildQuestion, shuffle } from "../lib/quiz";
import { useStudyDay } from "../lib/studyDay";
import { ButtonLink, EmptyState, Heading, PageLoading, ResultSummary, StreakBadge, Tag } from "../ui";
import { RoundQuestion } from "./RoundQuestion";

/** Due cards fetched when another device answers: enough to see which of ours are still due. */
const REFRESH_LIMIT = 100;

/**
 * The review session: every term whose interval has elapsed, across all sets,
 * asked in the Learn style. A card is out of the round once it is answered
 * correctly; a mistake brings it back later. Answering goes through
 * POST /api/terms/:id/answer, which also schedules the next review.
 */
export function ReviewPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const round = useQuestionRound();
  const { start } = round;
  // The day only counts once something was answered, not for "all caught up".
  const streak = useStudyDay(round.score.total > 0);
  const [cards, setCards] = useState<ReviewCard[] | null>(null);
  // Answered on this device in this round, and answered on another one.
  const answeredHere = useRef(new Set<number>());
  const gone = useRef(new Set<number>());

  const askFrom = useCallback(
    (pool: ReviewCard[]) => (termId: number) => {
      const card = pool.find((candidate) => candidate.id === termId);
      if (!card || gone.current.has(termId)) return null;
      // Wrong options from the card's own set, not from unrelated ones.
      return buildQuestion(
        pool.filter((candidate) => candidate.setId === card.setId),
        card,
      );
    },
    [],
  );

  /** A new round on whatever is due now. */
  const load = useCallback(
    () =>
      api.review.$get({ query: {} }).then(async (res) => {
        if (!res.ok) return;
        const { cards: due } = await res.json();
        answeredHere.current = new Set();
        gone.current = new Set();
        setCards(due);
        start(shuffle(due.map((card) => card.id)), askFrom(due));
      }),
    [askFrom, start],
  );

  useEffect(() => void load(), [load]);

  // Another device answered: cards it took care of are skipped here.
  useLive("study", () => {
    void api.review.$get({ query: { limit: String(REFRESH_LIMIT) } }).then(async (res) => {
      if (!res.ok) return;
      const stillDue = new Set((await res.json()).cards.map((card) => card.id));
      for (const card of cards ?? []) {
        if (!stillDue.has(card.id) && !answeredHere.current.has(card.id)) gone.current.add(card.id);
      }
    });
  });

  async function save(termId: number, correct: boolean) {
    const res = await api.terms[":id"].answer.$post({ param: { id: String(termId) }, json: { correct } });
    // Not saved (offline, server error; api.ts shows the toast): ask it again
    // so the answer gets another try. A 404 means the term is gone.
    if (offline(res) || res.status >= 500) round.askAgain(termId);
  }

  function onAnswer({ termId, correct }: Answered) {
    answeredHere.current.add(termId);
    // A mistake comes back later in this round.
    if (!correct) round.askAgain(termId);
    void save(termId, correct);
  }

  if (!cards) {
    return <PageLoading label={t("common.loading")} />;
  }

  const question = round.question;
  // The card behind the question carries its set's languages (worker/review.ts).
  const card = cards.find((candidate) => candidate.id === question?.termId);

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

      {round.done && round.score.total > 0 ? (
        <ResultSummary
          correct={round.score.correct}
          total={round.score.total}
          // Not the same cards again: the next ones due, if there are any.
          onStudyAgain={() => void load()}
          onDone={() => navigate("/")}
        />
      ) : question ? (
        <>
          <div className="mb-5">
            <Tag tone="neutral">
              {t("learn.remaining")} {round.left}
            </Tag>
          </div>
          <RoundQuestion round={round} langs={card} onAnswer={onAnswer} onContinue={() => round.next(askFrom(cards))} />
        </>
      ) : (
        <EmptyState
          icon="checkCircle"
          title={t("review.caughtUpTitle")}
          text={t("review.caughtUpText")}
          action={<ButtonLink to="/">{t("common.backHome")}</ButtonLink>}
        />
      )}
    </div>
  );
}
