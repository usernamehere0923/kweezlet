import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import type { SetDetail, SetTerm } from "../../worker/sets";
import { useT } from "../i18n";
import { api } from "../lib/api";
import { useLive } from "../lib/live";
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
  Spinner,
  StreakBadge,
} from "../ui";

type Side = "term" | "definition";
type Filter = "all" | "still_learning" | "know_it" | "starred";

/** Today as YYYY-MM-DD in the user's own timezone (the streak day). */
function localDay(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function matches(filter: Filter, term: SetTerm): boolean {
  if (filter === "all") return true;
  if (filter === "starred") return term.starred;
  return term.status === filter;
}

export function FlashcardsPage() {
  const { t } = useT();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [set, setSet] = useState<SetDetail | null>(null);
  const [side, setSide] = useState<Side>("term");
  const [filter, setFilter] = useState<Filter>("all");
  const [order, setOrder] = useState<number[]>([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [streak, setStreak] = useState(0);

  const reload = useCallback(
    () =>
      api.sets[":id"].$get({ param: { id } }).then(async (res) => {
        if (!res.ok) {
          navigate(`/sets/${id}`);
          return;
        }
        const data = await res.json();
        setSet(data);
        setOrder(data.terms.map((_, i) => i));
      }),
    [id, navigate],
  );

  useEffect(() => void reload(), [reload]);
  useEffect(() => {
    void api.study.day.$post({ json: { day: localDay() } }).then(async (res) => {
      if (res.ok) setStreak((await res.json()).streak);
    });
  }, []);
  // Another device marked or renamed something: catch up, keep the position.
  useLive("study", () => void reload());
  useLive("sets", () => void reload());

  // The deck is the shuffled order, cut down to the chosen filter. Marking a
  // card can pull it out of the deck; the index clamps when that happens.
  const deck = useMemo(() => (set ? order.filter((i) => matches(filter, set.terms[i])) : []), [set, order, filter]);
  const at = Math.min(index, deck.length - 1);
  const current = set?.terms[deck[at]] ?? null;

  function updateTerm(termId: number, state: Partial<SetTerm>) {
    setSet((s) =>
      s ? { ...s, terms: s.terms.map((term) => (term.id === termId ? { ...term, ...state } : term)) } : s,
    );
  }

  function goTo(next: number) {
    setIndex(next);
    setFlipped(false);
  }

  function shuffle() {
    setOrder((cards) => {
      const mixed = [...cards];
      for (let i = mixed.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [mixed[i], mixed[j]] = [mixed[j], mixed[i]];
      }
      return mixed;
    });
    goTo(0);
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
    if (await saveState(current.id, { status })) goTo(Math.min(at + 1, deck.length - 1));
  }

  async function toggleStar() {
    if (!current) return;
    await saveState(current.id, { starred: !current.starred });
  }

  if (!set) {
    return (
      <div className="flex justify-center py-16 text-muted">
        <Spinner size={28} label={t("common.loading")} />
      </div>
    );
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
            goTo(0);
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
          <FlipCard
            front={side === "term" ? current.term : current.definition}
            back={side === "term" ? current.definition : current.term}
            frontLabel={t(side === "term" ? "study.term" : "study.definition")}
            backLabel={t(side === "term" ? "study.definition" : "study.term")}
            flipped={flipped}
            onFlip={setFlipped}
          />

          <div className="mt-4">
            <CardNav
              index={at}
              total={deck.length}
              onPrev={() => goTo(at - 1)}
              onNext={() => goTo(at + 1)}
              onShuffle={shuffle}
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
