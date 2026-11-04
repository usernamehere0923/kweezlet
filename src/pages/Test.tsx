import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useT } from "../i18n";
import { useMatchBoard } from "../lib/matchBoard";
import { buildMatchRound, buildTest, scoreTest, type TestPaper } from "../lib/quiz";
import { useStudyDay } from "../lib/studyDay";
import { useStudyActivity } from "../lib/studyTime";
import { useStudySet } from "../lib/studySet";
import { EmptyState, Heading, PageLoadFailed, PageLoading, ResultSummary, StudyHeader } from "../ui";
import { TestPaperView } from "./test/TestPaperView";
import { TestSetup, type TestChoices } from "./test/TestSetup";

export function TestPage() {
  const { t } = useT();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [view, setView] = useState<"setup" | "paper" | "result">("setup");
  // What the running paper was built from: "Study again" builds the next one the same way.
  const [choices, setChoices] = useState<TestChoices | null>(null);

  // The paper and the answers on it
  const [paper, setPaper] = useState<TestPaper | null>(null);
  const [answers, setAnswers] = useState<(string | null)[]>([]);
  // A matching-only paper has no answers to give: handing it in counts too.
  // The timer running out on an empty paper does not.
  const [handedIn, setHandedIn] = useState(false);
  const streak = useStudyDay(handedIn || answers.some((answer) => answer !== null));
  // Study time and, once a paper is done, its score for the statistics.
  const { record } = useStudyActivity({
    active: handedIn || answers.some((answer) => answer !== null),
    setId: Number(id),
    mode: "test",
  });
  const recorded = useRef(false);
  const [deadline, setDeadline] = useState<number | null>(null);

  const { set, images, failed, retry } = useStudySet(id, ["sets"]);
  // Time is up: hand in the paper.
  const timeUp = useCallback(() => setView("result"), []);

  const tiles = useMemo(() => (paper ? buildMatchRound(paper.matching, paper.matching.length) : []), [paper]);
  const board = useMatchBoard(tiles);

  // The paper is done: its score goes to the statistics, once per paper (a
  // timed-out paper counts only when something was answered on it).
  useEffect(() => {
    if (view !== "result" || !paper || recorded.current) return;
    if (!handedIn && !answers.some((answer) => answer !== null)) return;
    recorded.current = true;
    const score = scoreTest(paper, answers, board.matched.size);
    record({ cards: score.total, correct: score.correct, wrong: score.total - score.correct });
  }, [view, paper, handedIn, answers, board, record]);

  function start(next: TestChoices) {
    if (!set) return;
    const built = buildTest(set.terms, {
      count: next.count ?? set.terms.length,
      types: next.types,
      matching: next.matching,
      answerWith: next.answerWith,
    });
    recorded.current = false;
    setChoices(next);
    setPaper(built);
    setAnswers(Array<string | null>(built.questions.length).fill(null));
    board.reset();
    setDeadline(next.minutes === null ? null : Date.now() + next.minutes * 60_000);
    setView("paper");
  }

  function answer(questionIndex: number, given: string) {
    setAnswers((list) => list.map((value, i) => (i === questionIndex ? given : value)));
  }

  if (failed) {
    return <PageLoadFailed title={t("sets.loadFailed")} onRetry={retry} />;
  }
  if (!set) {
    return <PageLoading />;
  }

  const score = paper ? scoreTest(paper, answers, board.matched.size) : null;

  return (
    <div className="mx-auto max-w-2xl">
      <StudyHeader backTo={`/sets/${id}`} backLabel={t("study.backToSet")} streak={streak} />

      <Heading level={3} className="mb-4">
        {set.title}
      </Heading>

      {set.terms.length === 0 ? (
        <EmptyState icon="checkCircle" title={t("test.emptyTitle")} text={t("test.emptyText")} />
      ) : view === "setup" ? (
        <TestSetup answerWith={set.answerWith} onStart={start} />
      ) : view === "paper" && paper ? (
        <TestPaperView
          paper={paper}
          answers={answers}
          images={images}
          onAnswer={answer}
          tiles={tiles}
          board={board}
          deadline={deadline}
          onTimeUp={timeUp}
          onFinish={() => {
            setHandedIn(true);
            setView("result");
          }}
        />
      ) : score && choices ? (
        <ResultSummary
          correct={score.correct}
          total={score.total}
          onStudyAgain={() => start(choices)}
          onDone={() => navigate(`/sets/${id}`)}
        />
      ) : null}
    </div>
  );
}
