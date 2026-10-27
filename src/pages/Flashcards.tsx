import { useState } from "react";
import { useParams } from "react-router";
import { useT } from "../i18n";
import { api } from "../lib/api";
import { useStudySet } from "../lib/studySet";
import { inDeck, useDeck, type DeckFilter } from "../lib/deck";
import { useStudyDay } from "../lib/studyDay";
import {
  CardNav,
  EmptyState,
  FlipCard,
  Heading,
  IconButton,
  KnowItButtons,
  PageLoadFailed,
  PageLoading,
  ProgressBar,
  SegmentedControl,
  SlideSwap,
  StudyHeader,
  TermImage,
} from "../ui";

type Side = "term" | "definition";
export function FlashcardsPage() {
  const { t } = useT();
  const { id = "" } = useParams();
  // Until the user picks a side: the one the set's questions don't ask for.
  const [pickedSide, setSide] = useState<Side | null>(null);
  const [filter, setFilter] = useState<DeckFilter>("all");
  const [flipped, setFlipped] = useState(false);
  const [started, setStarted] = useState(false);
  const streak = useStudyDay(started);

  // Another device marked or renamed something: catch up, keep the position.
  const { set, images, updateTerm, failed, retry } = useStudySet(id, ["sets", "study"]);
  const { deck, at, current, back, goTo: moveTo, reshuffle } = useDeck(set?.terms, filter);
  const side: Side = pickedSide ?? (set?.answerWith === "term" ? "definition" : "term");

  /** Every move shows the next card's front. */
  function goTo(next: number, back?: boolean) {
    moveTo(next, back);
    setFlipped(false);
  }

  async function saveState(termId: number, state: { status?: "still_learning" | "know_it"; starred?: boolean }) {
    const res = await api.terms[":id"].state.$patch({ param: { id: String(termId) }, json: state });
    if (res.ok) {
      const saved = await res.json();
      updateTerm(termId, { status: saved.status, starred: saved.starred });
    }
    return res.ok;
  }

  async function mark(status: "still_learning" | "know_it") {
    if (!current) return;
    setStarted(true);
    // A card that no longer matches the filter leaves the deck and the next
    // one slides into its place: stay put instead of jumping over it.
    const keeps = inDeck(filter, { ...current, status });
    if (await saveState(current.id, { status })) goTo(keeps ? at + 1 : at);
  }

  async function toggleStar() {
    if (!current) return;
    await saveState(current.id, { starred: !current.starred });
  }

  if (failed) {
    return <PageLoadFailed title={t("sets.loadFailed")} onRetry={retry} />;
  }
  if (!set) {
    return <PageLoading />;
  }

  const known = set.terms.filter((term) => term.status === "know_it").length;
  // The speaker says the face that is showing, in that side's language.
  const showingTerm = side === "term" ? !flipped : flipped;
  const speak = current
    ? { text: showingTerm ? current.term : current.definition, lang: showingTerm ? set.termLang : set.defLang }
    : undefined;
  // The picture belongs to the term's face only: on the other one it would
  // answer the question before it is asked.
  const termFace = (text: string) =>
    current && images[current.id] ? (
      <span className="flex flex-col items-center gap-3">
        <TermImage src={images[current.id]} alt="" />
        <span>{text}</span>
      </span>
    ) : (
      text
    );
  const learning = set.terms.filter((term) => term.status === "still_learning").length;

  return (
    <div className="mx-auto max-w-2xl">
      <StudyHeader backTo={`/sets/${id}`} backLabel={t("study.backToSet")} streak={streak} />

      <div className="mb-3 flex items-center justify-between gap-3">
        <Heading level={3}>{set.title}</Heading>
        {current && (
          <IconButton
            icon={current.starred ? "starFilled" : "star"}
            label={t(current.starred ? "study.unstarTerm" : "study.starTerm")}
            onClick={() => void toggleStar()}
            className={current.starred ? "text-accent" : undefined}
          />
        )}
      </div>

      <ProgressBar value={known} learning={learning} max={set.terms.length} />

      <div className="my-4 flex flex-wrap items-center gap-2">
        <SegmentedControl<Side>
          label={t("study.cardOrder")}
          value={side}
          onChange={setSide}
          size="sm"
          options={[
            { value: "term", label: t("study.termFirst") },
            { value: "definition", label: t("study.definitionFirst") },
          ]}
        />
        <SegmentedControl<DeckFilter>
          label={t("study.filterLabel")}
          value={filter}
          onChange={(f) => {
            setFilter(f);
            goTo(0, false);
          }}
          size="sm"
          options={[
            { value: "all", label: t("study.filter.all") },
            { value: "still_learning", label: t("study.stillLearning") },
            { value: "know_it", label: t("study.knowIt") },
            { value: "starred", label: t("study.filter.starred") },
          ]}
        />
      </div>

      {current ? (
        <>
          {/* The old card slides away as it was, flipped or not: its answer never shows on the next one. */}
          <SlideSwap id={current.id} back={back}>
            <FlipCard
              front={side === "term" ? termFace(current.term) : current.definition}
              back={side === "term" ? current.definition : termFace(current.term)}
              frontLabel={t(side === "term" ? "study.term" : "study.definition")}
              backLabel={t(side === "term" ? "study.definition" : "study.term")}
              flipped={flipped}
              speak={speak}
              onFlip={(next) => {
                setFlipped(next);
                setStarted(true);
              }}
            />
          </SlideSwap>

          <div className="mt-4">
            <CardNav
              index={at}
              total={deck.length}
              onPrev={() => goTo(at - 1)}
              onNext={() => goTo(at + 1)}
              onShuffle={() => {
                reshuffle();
                setFlipped(false);
              }}
            />
          </div>

          <div className="mt-4">
            <KnowItButtons onStillLearning={() => void mark("still_learning")} onKnowIt={() => void mark("know_it")} />
          </div>
        </>
      ) : (
        <EmptyState icon="copy" title={t("study.emptyDeckTitle")} text={t("study.emptyDeckText")} />
      )}
    </div>
  );
}
