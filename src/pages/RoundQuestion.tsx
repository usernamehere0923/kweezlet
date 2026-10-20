import { useT } from "../i18n";
import type { Answered, QuestionRound } from "../lib/questionRound";
import { speechFor, type SetLangs } from "../lib/quiz";
import { QuestionCard, SlideSwap } from "../ui";

/**
 * The current question of a Learn-style round (Learn, Review) on a
 * <QuestionCard>. `onAnswer` gets every answer once; `langs` are the
 * languages of the question's set, for the speaker.
 */
export function RoundQuestion({
  round,
  langs,
  onAnswer,
  onContinue,
}: {
  round: QuestionRound;
  langs: SetLangs | undefined;
  onAnswer: (answered: Answered) => void;
  onContinue: () => void;
}) {
  const { t } = useT();
  const { question } = round;
  if (!question) return null;
  const answered = (result: Answered | null) => result && onAnswer(result);
  return (
    <SlideSwap id={question}>
      <QuestionCard
        label={t(question.label)}
        prompt={question.prompt}
        answer={question.answer}
        options={question.options}
        typed={round.typed}
        onTyped={round.setTyped}
        picked={round.picked}
        feedback={round.feedback}
        onPick={(option) => answered(round.pick(option))}
        onSubmitTyped={() => answered(round.submitTyped())}
        onContinue={onContinue}
        speak={speechFor(question, langs)}
      />
    </SlideSwap>
  );
}
