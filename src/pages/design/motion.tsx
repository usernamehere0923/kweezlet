import { useState } from "react";
import { useT } from "../../i18n";
import { Button, FlipCard, IconButton, ResultSummary, SegmentedControl, SlideSwap, StudySetCard, Text } from "../../ui";
import { ANIMALS, Section } from "./layout";

/** Every other motion: wins, card changes, presses. Tokens in index.css, used only through these pieces. */
export function MotionSection() {
  const { t } = useT();
  const [replays, setReplays] = useState(0);
  const [card, setCard] = useState(0);
  const [back, setBack] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [filter, setFilter] = useState("all");
  const go = (i: number) => {
    setBack(i < card);
    setCard(i);
    setFlipped(false);
  };
  const { term, definition } = ANIMALS[card];

  return (
    <Section
      title={t("design.motion")}
      code={`// Correct answer → AnswerOption / AnswerInput pop (animate-pop-sm), the check pops in (animate-pop-in)
// Round done → ResultSummary fills the ring and counts up; 80 %+ pops and throws <Confetti />
// New best time → MatchResult: the tag pops in, confetti
<SlideSwap id={card.id} back={wentBack}><FlipCard ... /></SlideSwap>   // old card slides out as it was
<StudySetCard index={i} ... />   // in a list: the cards rise one after another
// Button presses in, SegmentedControl's pill slides: built in
// Reduced motion → none of it (global rule in index.css; Confetti and SlideSwap check it too)`}
    >
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <Text variant="small">{t("design.motionText")}</Text>
        <div key={replays} className="flex flex-col gap-6">
          <ResultSummary correct={5} total={6} onStudyAgain={() => {}} />
          <div className="grid gap-3 sm:grid-cols-2">
            {ANIMALS.slice(0, 4).map((a, i) => (
              <StudySetCard key={a.term} index={i} title={a.definition} termCount={6} known={i + 1} learning={1} />
            ))}
          </div>
        </div>
        <div>
          <Button variant="secondary" icon="retry" onClick={() => setReplays((n) => n + 1)}>
            {t("design.replay")}
          </Button>
        </div>
        <SlideSwap id={card} back={back}>
          <FlipCard front={term} back={definition} flipped={flipped} onFlip={setFlipped} hotkey={false} />
        </SlideSwap>
        {/* Not CardNav: the one further down already listens to the arrow keys. */}
        <div className="flex justify-center gap-4">
          <IconButton
            icon="chevronLeft"
            variant="secondary"
            label={t("study.prev")}
            onClick={() => go(card - 1)}
            disabled={card === 0}
          />
          <IconButton
            icon="chevronRight"
            variant="secondary"
            label={t("study.next")}
            onClick={() => go(card + 1)}
            disabled={card === ANIMALS.length - 1}
          />
        </div>
        <SegmentedControl
          label={t("design.motion")}
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: t("study.filter.all") },
            { value: "still_learning", label: t("study.stillLearning") },
            { value: "know_it", label: t("study.knowIt") },
          ]}
        />
      </div>
    </Section>
  );
}
