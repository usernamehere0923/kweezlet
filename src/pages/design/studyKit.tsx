import { useState } from "react";
import { useT } from "../../i18n";
import { useTermRows } from "../../lib/setForm";
import {
  AnswerInput,
  AnswerOption,
  Button,
  Card,
  CardNav,
  ClozeText,
  FeedbackBanner,
  FlipCard,
  KnowItButtons,
  MatchResult,
  ProgressBar,
  ResultSummary,
  SpeakButton,
  StreakBadge,
  StudyHeader,
  StudyModeTile,
  StudySetCard,
  TermEditorRow,
  TermImage,
  TermImagePicker,
  TermList,
  Text,
  type AnswerState,
  type StudyMode,
} from "../../ui";
import { ANIMALS, Chapter, Section } from "./layout";
import { MatchDemo } from "./MatchDemo";
import { MotionSection } from "./motion";
import { QuestionDemo } from "./QuestionDemo";

const CLOZE = "Bern has been the {{federal city}} of Switzerland since 1848.";

export function StudyKit() {
  const { t } = useT();
  const [mode, setMode] = useState<StudyMode>("flashcards");
  const [card, setCard] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState(2);
  const [learning, setLearning] = useState(1);
  const [picked, setPicked] = useState<number | null>(null);
  const [typed, setTyped] = useState("");
  const [typedState, setTypedState] = useState<"idle" | "correct" | "wrong">("idle");
  const termRows = useTermRows(ANIMALS.slice(0, 2));
  const [replays, setReplays] = useState(0);
  const [demoImage, setDemoImage] = useState<string | null>("icon-192.png");

  const go = (i: number) => {
    setCard(i);
    setFlipped(false);
  };

  // Multiple choice demo: option 2 ("the dog") is right.
  const choices = ["the cat", "the dog", "the horse", "the fish"];
  const choiceState = (i: number): AnswerState =>
    picked === null ? "idle" : i === 1 ? "correct" : i === picked ? "wrong" : "idle";

  return (
    <Chapter title={t("design.study")} intro={t("design.studyIntro")}>
      <Section
        title="StudySetCard · StreakBadge"
        code={`<StudySetCard title="Spanish animals" termCount={6} owner="anna" tag="Spanish" onClick={open} />
<StudySetCard title="Photosynthesis" termCount={24} known={9} learning={5} />   // known + learning: thin progress bar
<StreakBadge days={5} />
<StreakBadge days={5} notYetToday />   // Home, before today's study`}
      >
        <div className="mb-4 flex flex-col items-start gap-3">
          <StreakBadge days={5} />
          <StreakBadge days={5} notYetToday />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StudySetCard title="Spanish animals" termCount={6} owner="anna" tag="Spanish" />
          <StudySetCard title="Capitals of Europe" termCount={1} owner="ben" />
          <StudySetCard title="Photosynthesis" termCount={24} tag="Biology" known={9} learning={5} />
        </div>
      </Section>

      <Section
        title="StudyHeader"
        code={`<StudyHeader backTo={setUrl} backLabel={t("study.backToSet")} streak={streak} />   // top of every study mode; no badge at 0`}
      >
        <StudyHeader backTo="/design" backLabel={t("study.backToSet")} streak={5} />
      </Section>

      <Section
        title="StudyModeTile"
        code={`<StudyModeTile mode="match" hint="Best time 0:23" onClick={() => start("match")} />   // flashcards | learn | test | match · hint | disabled`}
      >
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {(["flashcards", "learn", "test", "match"] as const).map((m) => (
            <StudyModeTile
              key={m}
              mode={m}
              active={mode === m}
              onClick={() => setMode(m)}
              hint={m === "match" ? t("match.bestTime", { time: "0:23" }) : undefined}
              disabled={m === "test"}
            />
          ))}
        </div>
      </Section>

      <Section
        title="FlipCard · CardNav · KnowItButtons · ProgressBar"
        code={`<ProgressBar value={known} learning={learning} max={terms.length} />   // compact: thin, no counts
<FlipCard front={card.term} back={card.definition} flipped={flipped} onFlip={setFlipped}
  speak={{ text: flipped ? card.definition : card.term, lang: flipped ? defLang : termLang }} />
<CardNav index={i} total={terms.length} onPrev={prev} onNext={next} onShuffle={shuffle} />
<KnowItButtons onKnowIt={...} onStillLearning={...} />`}
      >
        <div className="mx-auto flex max-w-2xl flex-col gap-5">
          <ProgressBar value={known} learning={learning} max={ANIMALS.length} />
          <FlipCard
            front={ANIMALS[card].term}
            back={ANIMALS[card].definition}
            flipped={flipped}
            onFlip={setFlipped}
            speak={{ text: flipped ? ANIMALS[card].definition : ANIMALS[card].term, lang: flipped ? "en" : "es" }}
          />
          <CardNav
            index={card}
            total={ANIMALS.length}
            onPrev={() => go(Math.max(0, card - 1))}
            onNext={() => go(Math.min(ANIMALS.length - 1, card + 1))}
            onShuffle={() => go(Math.floor(Math.random() * ANIMALS.length))}
          />
          <KnowItButtons
            onStillLearning={() => setLearning((n) => Math.min(ANIMALS.length - known, n + 1))}
            onKnowIt={() => setKnown((n) => Math.min(ANIMALS.length - learning, n + 1))}
          />
          <ProgressBar value={card + 1} max={ANIMALS.length} />
          <ProgressBar compact value={known} learning={learning} max={ANIMALS.length} />
        </div>
      </Section>

      <Section
        title={t("design.progressMotion")}
        code={`// THE way progress animates. Only through ProgressBar, never hand-made:
// appears → track fades in (animate-track-in), fill wipes in from the left (animate-wipe-in, 0.7 s)
// changes → segments slide (0.5 s ease-out) · reduced motion → none (global rule in index.css)
<ProgressBar value={known} learning={learning} max={total} />`}
      >
        <div className="mx-auto flex max-w-2xl flex-col gap-5">
          <Text variant="small">{t("design.progressMotionText")}</Text>
          {/* A new key remounts the bars, so the entrance plays again. */}
          <div key={replays} className="flex flex-col gap-5">
            <ProgressBar value={5} learning={3} max={12} />
            <ProgressBar compact value={5} learning={3} max={12} />
          </div>
          <div>
            <Button variant="secondary" icon="retry" onClick={() => setReplays((n) => n + 1)}>
              {t("design.replay")}
            </Button>
          </div>
        </div>
      </Section>

      <MotionSection />

      <Section
        title="AnswerOption · FeedbackBanner"
        code={`<AnswerOption label="the dog" shortcut={2} state={state} onSelect={() => pick(1)} />
// state: "idle" | "selected" | "correct" | "wrong"
<FeedbackBanner state="wrong" correctAnswer="the dog" onContinue={next} />`}
      >
        <div className="mx-auto flex max-w-2xl flex-col gap-3">
          <Card padding="sm" className="mb-2 text-center">
            <span className="font-display text-2xl">el perro</span>
          </Card>
          <div className="grid gap-3 sm:grid-cols-2">
            {choices.map((c, i) => (
              <AnswerOption
                key={c}
                label={c}
                shortcut={i + 1}
                state={choiceState(i)}
                chosen={i === picked}
                disabled={picked !== null}
                onSelect={() => setPicked(i)}
              />
            ))}
          </div>
          {picked !== null && (
            <FeedbackBanner
              state={picked === 1 ? "correct" : "wrong"}
              correctAnswer="the dog"
              onContinue={() => setPicked(null)}
            />
          )}
        </div>
      </Section>

      <Section
        title="AnswerInput"
        code={`<AnswerInput value={answer} onChange={setAnswer} onSubmit={check} state={state} />   // idle | correct | wrong`}
      >
        <div className="mx-auto flex max-w-2xl flex-col gap-3">
          <Text variant="muted">
            the dog → <span className="text-ink">?</span>
          </Text>
          <AnswerInput
            value={typed}
            onChange={setTyped}
            state={typedState}
            onSubmit={() => setTypedState(typed.trim().toLowerCase() === "el perro" ? "correct" : "wrong")}
          />
          {typedState !== "idle" && (
            <FeedbackBanner
              state={typedState}
              correctAnswer="el perro"
              onContinue={() => {
                setTyped("");
                setTypedState("idle");
              }}
            />
          )}
        </div>
      </Section>

      <Section
        title="QuestionCard"
        code={`// One Learn / Review question. Pages use <RoundQuestion round={round} ... /> (src/pages/RoundQuestion.tsx),
// which wires useQuestionRound() (src/lib/questionRound.ts) to it.
<QuestionCard label="Give the definition" prompt="el gato" answer="the cat"
  options={["the dog", "the cat"]}   // [] = type the answer
  typed={typed} onTyped={setTyped} picked={picked} feedback={feedback}
  onPick={pick} onSubmitTyped={check} onContinue={next} />`}
      >
        <QuestionDemo />
      </Section>

      <Section
        title="SpeakButton"
        code={`<SpeakButton speech={{ text: "el gato", lang: "es" }} />   // Web Speech API; tap again to stop
<FlipCard ... speak={{ text: visible.text, lang: visible.lang }} />   // speaks the visible face
<TermList terms={terms} speak={{ termLang: set.termLang, defLang: set.defLang }} />`}
      >
        <div className="flex items-center gap-3">
          <SpeakButton speech={{ text: "el gato", lang: "es" }} />
          <SpeakButton speech={{ text: "the cat", lang: "en" }} size="md" />
        </div>
      </Section>

      <Section
        title="MatchTile"
        code={`<MatchTile label="el gato" state={state} onClick={() => pick(tile)} />   // idle | selected | matched | mismatch`}
      >
        <MatchDemo />
      </Section>

      <Section
        title="ClozeText"
        code={`<ClozeText text="Bern has been the {{federal city}} since 1848." />          // the gap
<ClozeText text="Bern has been the {{federal city}} since 1848." reveal />   // the answer, marked`}
      >
        <div className="flex flex-col gap-2 text-lg text-ink">
          <ClozeText text={CLOZE} />
          <ClozeText text={CLOZE} reveal />
        </div>
      </Section>

      <Section
        title="TermEditorRow · TermList"
        code={`const { rows, rowRefs, update, next, remove, add } = useTermRows();   // src/lib/setForm.ts
<TermEditorRow ref={(el) => (rowRefs.current[i] = el)} index={i} term={row.term} definition={row.definition}
  onChange={(term, definition) => update(i, term, definition)}
  onNext={() => next(i)}   // Enter in "definition": next row, or a new one
  onDelete={() => remove(i)} />
// kind + onKind: switch a row to a gap sentence ("Bern is the {{capital}}."); Make gap marks the selection
<TermList terms={terms} />   // progress: "known" | "learning" | "new" adds a TermProgressDot; kind "cloze" shows the sentence
<TermProgressDot progress="learning" />`}
      >
        <div className="flex flex-col gap-3">
          {termRows.rows.map((row, i) => (
            <TermEditorRow
              key={row.uid}
              ref={(el) => {
                termRows.rowRefs.current[i] = el;
              }}
              index={i}
              kind={row.kind}
              onKind={(kind) => termRows.setKind(i, kind)}
              term={row.term}
              definition={row.definition}
              onChange={(term, definition) => termRows.update(i, term, definition)}
              onNext={() => termRows.next(i)}
              onDelete={termRows.rows.length > 1 ? () => termRows.remove(i) : undefined}
            />
          ))}
          <Button variant="secondary" icon="plus" onClick={termRows.add}>
            {t("study.addTerm")}
          </Button>
        </div>
        <div className="mt-6">
          <TermList terms={[...ANIMALS, { kind: "cloze", term: CLOZE, definition: "federal city" }]} />
          <TermList
            terms={ANIMALS.slice(0, 3).map((item, i) => ({
              ...item,
              ...(i === 0 ? { image: "icon-192.png" } : {}),
              progress: (["known", "learning", "new"] as const)[i],
            }))}
          />
        </div>
      </Section>

      <Section
        title="TermImage · TermImagePicker"
        code={`<TermImage src={dataUrl} alt="" />                      // on a card: whole picture, never taller than 224px
<TermImage src={dataUrl} alt="" variant="thumb" />     // the small square in a list or a form row
<TermImagePicker image={image} onChange={setImage} />  // add / replace / remove; a picked file arrives shrunk (src/lib/images.ts)`}
      >
        <div className="flex max-w-md flex-col gap-4">
          <Card className="flex justify-center">
            <TermImage src="icon-192.png" alt="" />
          </Card>
          <TermImagePicker image={demoImage} onChange={setDemoImage} />
        </div>
      </Section>

      <Section
        title="ResultSummary"
        code={`<ResultSummary correct={5} total={6} onStudyAgain={restart} onDone={() => navigate("/")} />`}
      >
        <div className="mx-auto max-w-md">
          <ResultSummary correct={5} total={6} onStudyAgain={() => {}} onDone={() => {}} />
        </div>
      </Section>

      <Section
        title="MatchResult"
        code={`<MatchResult time="0:23" isNewBest bestTime="0:23" onPlayAgain={restart} onDone={() => navigate("/")} />`}
      >
        <div className="mx-auto max-w-md">
          <MatchResult time="0:23" isNewBest bestTime="0:23" onPlayAgain={() => {}} onDone={() => {}} />
        </div>
      </Section>
    </Chapter>
  );
}
