import { useCallback, useRef, useState } from "react";
import type { TestQuestion } from "./quiz";
import { gradeAnswer } from "./study";

/** The question for a term id, or null when the term is gone (deleted, answered elsewhere). */
export type AskTerm = (termId: number) => TestQuestion | null;

/**
 * One Learn-style round, the part Learn and Review share: a queue of term ids
 * asked one by one, the answer the user gave, the score. Which terms come
 * back and what an answer saves is up to the page: pick() and submitTyped()
 * return what was answered, askAgain() puts a term back in the queue.
 * Show it with <QuestionCard> (src/ui/study).
 */
export function useQuestionRound() {
  const [question, setQuestion] = useState<TestQuestion | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const [typed, setTyped] = useState("");
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [left, setLeft] = useState(0);
  const [done, setDone] = useState(false);
  // The round lives outside the render: the ids still to ask.
  const queue = useRef<number[]>([]);

  /** The next question; terms `ask` no longer knows are skipped. */
  const next = useCallback((ask: AskTerm) => {
    for (;;) {
      const id = queue.current.shift();
      if (id === undefined) {
        setQuestion(null);
        setLeft(0);
        setDone(true);
        return;
      }
      const asked = ask(id);
      if (asked) {
        setQuestion(asked);
        setLeft(queue.current.length + 1);
        setPicked(null);
        setFeedback(null);
        setTyped("");
        return;
      }
    }
  }, []);

  /** A new round over `ids`, in this order. */
  const start = useCallback(
    (ids: number[], ask: AskTerm) => {
      queue.current = [...ids];
      setScore({ correct: 0, total: 0 });
      setDone(false);
      next(ask);
    },
    [next],
  );

  /** Asks the term again later in this round (once, however often it is called). */
  const askAgain = useCallback((termId: number) => {
    if (!queue.current.includes(termId)) queue.current.push(termId);
  }, []);

  function answer(correct: boolean, given: string) {
    // Enter in the read-only answer box must not count the answer twice.
    if (!question || feedback) return null;
    setPicked(given);
    setFeedback(correct ? "correct" : "wrong");
    setScore((s) => ({ correct: s.correct + (correct ? 1 : 0), total: s.total + 1 }));
    return { termId: question.termId, correct };
  }

  return {
    question,
    picked,
    feedback,
    typed,
    setTyped,
    score,
    /** Questions still to ask, the current one included. */
    left,
    /** The queue ran out: show the summary. */
    done,
    start,
    next,
    askAgain,
    pick: (option: string) => answer(option === question?.answer, option),
    submitTyped: () => answer(question ? gradeAnswer(typed, question.answer) : false, typed),
  };
}
