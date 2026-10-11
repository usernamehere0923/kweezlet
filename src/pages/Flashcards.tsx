import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import type { SetDetail, SetTerm } from "../../worker/sets";
import { useT } from "../i18n";
import { api } from "../lib/api";
import { useLive } from "../lib/live";
import {
  ButtonLink,
  CardNav,
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

/** Today as YYYY-MM-DD in the user's own timezone (the streak day). */
function localDay(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function FlashcardsPage() {
  const { t } = useT();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [set, setSet] = useState<SetDetail | null>(null);
  const [side, setSide] = useState<Side>("term");
  const [deck, setDeck] = useState<number[]>([]);
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
        setDeck(data.terms.map((_, i) => i));
        setIndex((i) => Math.min(i, data.terms.length - 1));
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

  const current = set?.terms[deck[index]] ?? null;

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
    setDeck((cards) => {
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
    if (await saveState(current.id, { status })) goTo(Math.min(index + 1, deck.length - 1));
  }

  async function toggleStar() {
    if (!current) return;
    await saveState(current.id, { starred: !current.starred });
  }

  if (!set || !current) {
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
        <IconButton
          icon={current.starred ? "starFilled" : "star"}
          label={t(current.starred ? "study.unstarTerm" : "study.starTerm")}
          onClick={() => void toggleStar()}
          className={current.starred ? "text-accent" : undefined}
        />
      </div>

      <ProgressBar value={known} learning={learning} max={set.terms.length} />

      <div className="my-4">
        <SegmentedControl<Side>
          label={t("study.cardOrder")}
          value={side}
          onChange={setSide}
          options={[
            { value: "term", label: t("study.termFirst") },
            { value: "definition", label: t("study.definitionFirst") },
          ]}
        />
      </div>

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
          index={index}
          total={deck.length}
          onPrev={() => goTo(index - 1)}
          onNext={() => goTo(index + 1)}
          onShuffle={shuffle}
        />
      </div>

      <div className="mt-4">
        <KnowItButtons onStillLearning={() => void mark("still_learning")} onKnowIt={() => void mark("know_it")} />
      </div>
    </div>
  );
}
