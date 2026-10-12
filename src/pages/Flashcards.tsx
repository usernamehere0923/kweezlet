import { useMemo, useState } from "react";
import { useParams } from "react-router";
import type { SetTerm } from "../../worker/sets";
import { useT } from "../i18n";
import { api } from "../lib/api";
import { useStudySet } from "../lib/studySet";
import { shuffle, useStudyDay } from "../lib/study";
import {
  ButtonLink,
  CardNav,
  EmptyState,
  FlipCard,
  Heading,
  IconButton,
  KnowItButtons,
  ProgressBar,
  SegmentedControl,
  PageLoading,
  SlideSwap,
  StreakBadge,
} from "../ui";

type Side = "term" | "definition";
type Filter = "all" | "still_learning" | "know_it" | "starred";

function matches(filter: Filter, term: SetTerm): boolean {
  if (filter === "all") return true;
  if (filter === "starred") return term.starred;
  return term.status === filter;
}

export function FlashcardsPage() {
  const { t } = useT();
  const { id = "" } = useParams();
  const [side, setSide] = useState<Side>("term");
  const [filter, setFilter] = useState<Filter>("all");
  const [order, setOrder] = useState<number[]>([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  /** The last move went to an earlier card: slide the other way. */
  const [back, setBack] = useState(false);
  const [started, setStarted] = useState(false);
  const streak = useStudyDay(started);

  // Another device marked or renamed something: catch up, keep the position.
  const [set, setSet] = useStudySet(id, ["sets", "study"], (data) => {
    // Surviving terms keep their shuffled place; new ones go to the end.
    setOrder((prev) => {
      const had = new Set(prev);
      const seen = new Set(data.terms.map((term) => term.id));
      return [
        ...prev.filter((termId) => seen.has(termId)),
        ...data.terms.map((term) => term.id).filter((termId) => !had.has(termId)),
      ];
    });
  });

  // The deck is the shuffled order, cut down to the chosen filter. Marking a
  // card can pull it out of the deck; the index clamps when that happens.
  const deck = useMemo(() => {
    if (!set) return [];
    const byId = new Map(set.terms.map((term) => [term.id, term]));
    return order.flatMap((termId) => {
      const term = byId.get(termId);
      return term && matches(filter, term) ? [term] : [];
    });
  }, [set, order, filter]);
  const at = deck.length === 0 ? 0 : Math.min(Math.max(index, 0), deck.length - 1);
  const current = deck[at] ?? null;

  function updateTerm(termId: number, state: Partial<SetTerm>) {
    setSet((s) =>
      s ? { ...s, terms: s.terms.map((term) => (term.id === termId ? { ...term, ...state } : term)) } : s,
    );
  }

  /** `back`: slide as if going to an earlier card. A new order or filter goes forward. */
  function goTo(next: number, back = next < at) {
    setBack(back);
    setIndex(next);
    setFlipped(false);
  }

  function reshuffle() {
    setOrder((cards) => shuffle(cards));
    goTo(0, false);
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
    const keeps = matches(filter, { ...current, status });
    if (await saveState(current.id, { status })) goTo(keeps ? at + 1 : at);
  }

  async function toggleStar() {
    if (!current) return;
    await saveState(current.id, { starred: !current.starred });
  }

  if (!set) {
    return <PageLoading label={t("common.loading")} />;
  }

  const known = set.terms.filter((term) => term.status === "know_it").length;
  const learning = set.terms.filter((term) => term.status === "still_learning").length;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between gap-2">
        <ButtonLink to={`/sets/${id}`} variant="ghost" icon="chevronLeft" className="-ml-3">
          {t("study.backToSet")}
        </ButtonLink>
        {streak > 0 && <StreakBadge days={streak} />}
      </div>

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
        <SegmentedControl<Filter>
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
              front={side === "term" ? current.term : current.definition}
              back={side === "term" ? current.definition : current.term}
              frontLabel={t(side === "term" ? "study.term" : "study.definition")}
              backLabel={t(side === "term" ? "study.definition" : "study.term")}
              flipped={flipped}
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
              onShuffle={reshuffle}
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
