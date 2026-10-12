import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import type { SetSummary } from "../../worker/sets";
import { useT } from "../i18n";
import { api } from "../lib/api";
import { useLive } from "../lib/live";
import { useUser } from "../lib/session";
import { localDay } from "../lib/study";
import {
  ButtonLink,
  Card,
  EmptyState,
  Heading,
  PageTitle,
  SearchField,
  PageLoading,
  StreakBadge,
  StudySetCard,
} from "../ui";

/** How long typing has to pause before the search goes out. */
const SEARCH_PAUSE_MS = 250;

export function HomePage() {
  const { t, tn } = useT();
  const user = useUser();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  // What was searched: follows q once typing pauses, so not every key is a request.
  const [query, setQuery] = useState("");
  const [sets, setSets] = useState<SetSummary[] | null>(null);
  const [dueCount, setDueCount] = useState(0);
  const [streak, setStreak] = useState({ streak: 0, studiedToday: false });
  const request = useRef(0);

  useEffect(() => {
    const pause = setTimeout(() => setQuery(q), q ? SEARCH_PAUSE_MS : 0);
    return () => clearTimeout(pause);
  }, [q]);

  const reload = useCallback(() => {
    const mine = ++request.current;
    return api.sets.$get({ query: query ? { q: query } : {} }).then(async (res) => {
      // An older answer must not overwrite a newer one.
      if (res.ok && mine === request.current) setSets(await res.json());
    });
  }, [query]);

  useEffect(() => void reload(), [reload]);

  // How many terms are due for a review today (worker/review.ts). Only the
  // count is needed, so one card. Deleting a set elsewhere changes it too.
  const loadDue = useCallback(
    () =>
      api.review.$get({ query: { limit: "1" } }).then(async (res) => {
        if (res.ok) setDueCount((await res.json()).dueCount);
      }),
    [],
  );
  useEffect(() => void loadDue(), [loadDue]);

  // Days studied in a row, shown before studying (worker/study.ts).
  const loadStreak = useCallback(
    () =>
      api.study.streak.$get({ query: { day: localDay() } }).then(async (res) => {
        if (res.ok) setStreak(await res.json());
      }),
    [],
  );
  useEffect(() => void loadStreak(), [loadStreak]);

  // Marks and answers elsewhere move the bars, the due count and the streak;
  // editing or deleting a set moves the bars and the due count.
  useLive("study", () => {
    void reload();
    void loadDue();
    void loadStreak();
  });
  useLive("sets", () => {
    void reload();
    void loadDue();
  });

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle subtitle={t("app.tagline")}>{t("home.greeting", { name: user.username })}</PageTitle>

      {streak.streak > 0 && (
        <div className="mb-6">
          <StreakBadge days={streak.streak} notYetToday={!streak.studiedToday} />
        </div>
      )}

      {dueCount > 0 && (
        <Card className="mb-6 flex items-center justify-between gap-3">
          <Heading level={3}>{tn("review.due", dueCount)}</Heading>
          <ButtonLink to="/review">{t("review.start")}</ButtonLink>
        </Card>
      )}

      {sets === null ? (
        <PageLoading label={t("common.loading")} />
      ) : sets.length === 0 && !query && !q ? (
        <EmptyState
          icon="folderPlus"
          title={t("sets.emptyTitle")}
          text={t("sets.emptyText")}
          action={
            <ButtonLink to="/sets/new" icon="plus">
              {t("sets.emptyAction")}
            </ButtonLink>
          }
        />
      ) : (
        <>
          <div className="mb-6 flex items-center gap-2">
            <SearchField
              value={q}
              onChange={setQ}
              label={t("sets.searchLabel")}
              placeholder={t("search.placeholder")}
              clearLabel={t("common.clear")}
              className="flex-1"
            />
            <ButtonLink to="/sets/new" icon="plus" variant={dueCount > 0 ? "secondary" : "primary"}>
              {t("sets.new")}
            </ButtonLink>
          </div>
          {/* Same tree position with and without results, so the input keeps focus while typing. */}
          {sets.length === 0 ? (
            <EmptyState icon="search" title={t("sets.noResults")} text={t("sets.noResultsText")} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {sets.map((set, i) => (
                <StudySetCard
                  key={set.id}
                  index={i}
                  title={set.title}
                  termCount={set.termCount}
                  known={set.knownCount}
                  learning={set.learningCount}
                  onClick={() => navigate(`/sets/${set.id}`)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
