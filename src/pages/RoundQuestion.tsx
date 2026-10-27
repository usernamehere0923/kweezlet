import { useT } from "../i18n";
import type { Answered, QuestionRound } from "../lib/questionRound";
import { speechFor, type SetLangs } from "../lib/quiz";
import { QuestionCard, SlideSwap } from "../ui";

/**
 * The current question of a Learn-style round (Learn, Review) on a
 * <QuestionCard>. `onAnswer` gets every answer once; `langs` are the
 * languages of the question's set, for the speaker. `images` (term id ->
 * data URL) shows the asked term's picture under the prompt — only when the
 * prompt IS the term: a picture would give the answer away otherwise.
 */
export function RoundQuestion({
  round,
  langs,
  images,
  onAnswer,
  onContinue,
}: {
  round: QuestionRound;
  langs: SetLangs | undefined;
  images?: Record<number, string>;
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
        image={question.showImage ? images?.[question.termId] : undefined}
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
