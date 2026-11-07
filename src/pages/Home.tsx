import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import type { StudyMode } from "../../worker/activity";
import type { DraftSummary } from "../../worker/ai";
import type { Folder } from "../../worker/folders";
import type { RecentStats, Stats } from "../../worker/stats";
import type { SetSummary } from "../../worker/sets";
import { useT, type TKey } from "../i18n";
import { api } from "../lib/api";
import { sourceLabel } from "../lib/draft";
import { useLive } from "../lib/live";
import { useUser } from "../lib/session";
import { localDay } from "../lib/studyDay";
import {
  ButtonLink,
  Card,
  EmptyState,
  Heading,
  IconButton,
  Menu,
  PageTitle,
  SearchField,
  Select,
  PageLoading,
  SideList,
  StatTile,
  StreakBadge,
  StudySetCard,
  Text,
  UnfinishedDrafts,
  useMediaQuery,
} from "../ui";
import { FolderEditor } from "./home/FolderEditor";
import { FolderSuggestions, folderIdeas } from "./home/FolderSuggestions";

/** How long typing has to pause before the search goes out. */
const SEARCH_PAUSE_MS = 250;

/** Where "continue" goes for each mode of the last studied set. */
const RESUME_PATH: Record<StudyMode, (id: number) => string> = {
  flashcards: (id) => `/sets/${id}/flashcards`,
  learn: (id) => `/sets/${id}/learn`,
  test: (id) => `/sets/${id}/test`,
  match: (id) => `/sets/${id}/match`,
  review: () => "/review",
};
const MODE_LABEL: Record<StudyMode, TKey> = {
  flashcards: "study.mode.flashcards",
  learn: "study.mode.learn",
  test: "study.mode.test",
  match: "study.mode.match",
  review: "review.title",
};

export function HomePage() {
  const { t, tn, formatNumber } = useT();
  const user = useUser();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  // What was searched: follows q once typing pauses, so not every key is a request.
  const [query, setQuery] = useState("");
  const [sets, setSets] = useState<SetSummary[] | null>(null);
  const [dueCount, setDueCount] = useState(0);
  const [streak, setStreak] = useState({ streak: 0, studiedToday: false });
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  // Distinguished from "no folders": the suggestions wait for the answer so
  // they do not flash up for folders the user already has.
  const [foldersReady, setFoldersReady] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<RecentStats | null>(null);
  const [editing, setEditing] = useState<Folder | null>(null);
  // The folder filter lives in the URL: back from a set lands in the same folder.
  const [params, setParams] = useSearchParams();
  const folder = params.get("folder") ?? "all";
  const pickFolder = useCallback(
    (value: string) => setParams(value === "all" ? {} : { folder: value }, { replace: true }),
    [setParams],
  );
  const request = useRef(0);
  // Wide screens get the folder sidebar, the phone the dropdown below.
  const wide = useMediaQuery("(min-width: 768px)");

  useEffect(() => {
    const pause = setTimeout(() => setQuery(q), q ? SEARCH_PAUSE_MS : 0);
    return () => clearTimeout(pause);
  }, [q]);

  const reload = useCallback(() => {
    const mine = ++request.current;
    return api.sets
      .$get({ query: { ...(query ? { q: query } : {}), ...(folder !== "all" ? { folder } : {}) } })
      .then(async (res) => {
        // An older answer must not overwrite a newer one.
        if (res.ok && mine === request.current) setSets(await res.json());
        // A folder deleted elsewhere: back to all sets.
        else if (res.status === 400) pickFolder("all");
      });
  }, [query, folder, pickFolder]);

  useEffect(() => void reload(), [reload]);

  const loadFolders = useCallback(
    () =>
      api.folders.$get().then(async (res) => {
        if (res.ok) {
          setFolders(await res.json());
          setFoldersReady(true);
        }
      }),
    [],
  );
  useEffect(() => void loadFolders(), [loadFolders]);
  const picked = folders.find((candidate) => String(candidate.id) === folder) ?? null;
  const folderName = (id: number | null) => folders.find((candidate) => candidate.id === id)?.name;

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

  // Days studied in a row, shown before studying (worker/streak.ts).
  const loadStreak = useCallback(
    () =>
      api.study.streak.$get({ query: { day: localDay() } }).then(async (res) => {
        if (res.ok) setStreak(await res.json());
      }),
    [],
  );
  useEffect(() => void loadStreak(), [loadStreak]);

  // The compact numbers of the dashboard strip: learned today, learning rate.
  const loadStats = useCallback(
    () =>
      api.stats.$get({ query: { day: localDay(), days: "1" } }).then(async (res) => {
        if (res.ok) setStats(await res.json());
      }),
    [],
  );
  useEffect(() => void loadStats(), [loadStats]);

  // Quick resume and the recently used sets (worker/stats.ts).
  const loadRecent = useCallback(
    () =>
      api.stats.recent.$get().then(async (res) => {
        if (res.ok) setRecent(await res.json());
      }),
    [],
  );
  useEffect(() => void loadRecent(), [loadRecent]);

  // AI drafts not saved or discarded yet: found again here (also from the other device).
  const draftsRequest = useRef(0);
  const loadDrafts = useCallback(() => {
    const mine = ++draftsRequest.current;
    return api.ai.drafts.$get().then(async (res) => {
      // Two live events close together: the older answer must not land last.
      if (!res.ok) return;
      const { drafts } = await res.json();
      if (mine === draftsRequest.current) setDrafts(drafts);
    });
  }, []);
  useEffect(() => void loadDrafts(), [loadDrafts]);
  useLive("ai", () => void loadDrafts());

  // Marks and answers elsewhere move the bars, the due count and the streak;
  // editing or deleting a set moves the bars and the due count.
  useLive("study", () => {
    void reload();
    void loadDue();
    void loadStreak();
    void loadStats();
    void loadRecent();
  });
  useLive("sets", () => {
    void reload();
    void loadDue();
    void loadFolders();
    void loadStats();
    void loadRecent();
  });

  // The set cards of the grid and the "recently" rows above it.
  const setCard = (set: SetSummary, i: number) => (
    <StudySetCard
      key={set.id}
      index={i}
      title={set.title}
      tag={folder === "all" ? folderName(set.folderId) : undefined}
      termCount={set.termCount}
      known={set.knownCount}
      learning={set.learningCount}
      onClick={() => navigate(`/sets/${set.id}`)}
    />
  );

  // The dashboard strip belongs to the unfiltered overview only: searching
  // or a folder filter is about one thing, not the whole account.
  const unfiltered = !query && !q && folder === "all";
  const resume = recent?.studied[0] ?? null;
  // Category folders with one tap still to make (hidden once the name is taken).
  const ideas = foldersReady ? folderIdeas(t, folders) : [];
  const afterFolder = () => {
    void loadFolders();
    void reload();
  };

  return (
    <div>
      {/* Wide screens: greeting, streak and due share one band. The phone stays a plain stack. */}
      <div className="flex flex-col md:mb-6 md:flex-row md:items-center md:justify-between md:gap-6 md:rounded-ui-xl md:bg-sunken/50 md:p-6">
        <PageTitle subtitle={t("app.tagline")} className="md:mb-0">
          {t("home.greeting", { name: user.username })}
        </PageTitle>
        <div className="md:flex md:items-center md:gap-3">
          {streak.streak > 0 && (
            <div className="mb-6 md:mb-0">
              <StreakBadge days={streak.streak} notYetToday={!streak.studiedToday} />
            </div>
          )}

          {dueCount > 0 && (
            <Card className="mb-6 flex items-center justify-between gap-3 md:mb-0">
              <Heading level={3}>{tn("review.due", dueCount)}</Heading>
              <ButtonLink to="/review">{t("review.start")}</ButtonLink>
            </Card>
          )}
        </div>
      </div>

      {drafts.length > 0 && (
        <div className="mb-6">
          <UnfinishedDrafts
            drafts={drafts.map((draft) => ({
              to: `/create/ai/${draft.id}`,
              title: draft.title || sourceLabel(t, draft.sourceName),
              status: draft.status,
              cardCount: draft.cardCount,
            }))}
          />
        </div>
      )}

      {/* The dashboard strip: compact numbers, quick resume, recently used. */}
      {unfiltered && sets !== null && sets.length > 0 && (
        <div className="mb-6 flex flex-col gap-6">
          {stats && (
            <div className="grid grid-cols-2 gap-3">
              <StatTile label={t("stats.learnedToday")} value={formatNumber(stats.learnedToday)} icon="star" />
              <StatTile
                label={t("stats.learningRate")}
                value={formatNumber(stats.learningRate, { style: "percent", maximumFractionDigits: 0 })}
                icon="checkCircle"
              />
            </div>
          )}

          {resume && (
            <Card>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <Text variant="small" className="text-muted">
                    {t("home.resume")}
                  </Text>
                  <Heading level={3} className="truncate">
                    {resume.title}
                  </Heading>
                  <Text variant="small" className="text-muted">
                    {t(MODE_LABEL[resume.mode])}
                  </Text>
                </div>
                <ButtonLink to={RESUME_PATH[resume.mode](resume.id)} variant="secondary" icon="play">
                  {t("home.continue")}
                </ButtonLink>
              </div>
            </Card>
          )}

          {recent && recent.studied.length > 0 && (
            <div>
              <Heading level={3} className="mb-2">
                {t("home.recentStudied")}
              </Heading>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {recent.studied.slice(0, 4).map((set, i) => setCard(set, i))}
              </div>
            </div>
          )}

          {recent && recent.created.length > 0 && (
            <div>
              <Heading level={3} className="mb-2">
                {t("home.recentCreated")}
              </Heading>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {recent.created.slice(0, 4).map((set, i) => setCard(set, i))}
              </div>
            </div>
          )}
        </div>
      )}

      {sets === null ? (
        <PageLoading />
      ) : sets.length === 0 && !query && !q && folder === "all" ? (
        <EmptyState
          icon="folderPlus"
          title={t("sets.emptyTitle")}
          text={t("sets.emptyText")}
          action={
            <Menu
              label={t("sets.emptyAction")}
              icon="plus"
              variant="primary"
              items={[
                { label: t("sets.new"), icon: "plus", to: "/sets/new" },
                { label: t("home.fromMaterial"), icon: "bulb", to: "/create/ai" },
              ]}
            />
          }
        />
      ) : (
        <div className="flex flex-col gap-6 md:flex-row md:items-start">
          {/* Wide screens: folders in a list at the side. The phone keeps the dropdown. */}
          {wide && (folders.length > 0 || ideas.length > 0) && (
            <aside className="md:w-52 md:shrink-0">
              {folders.length > 0 && (
                <>
                  <Heading level={3} className="mb-2">
                    {t("folders.label")}
                  </Heading>
                  <SideList
                    label={t("folders.label")}
                    value={folder}
                    onChange={pickFolder}
                    items={[
                      { id: "all", label: t("folders.all") },
                      ...folders.map((item) => ({
                        id: String(item.id),
                        label: item.name,
                        editLabel: t("folders.editTitle"),
                        onEdit: () => setEditing(item),
                      })),
                      { id: "none", label: t("folders.none") },
                    ]}
                  />
                </>
              )}
              {ideas.length > 0 && (
                <div className="mt-3">
                  <FolderSuggestions names={ideas} onCreated={afterFolder} />
                </div>
              )}
            </aside>
          )}
          <div className="min-w-0 flex-1">
            {!wide && folders.length > 0 && (
              <div className="mb-3 flex items-end gap-2">
                <Select
                  label={t("folders.label")}
                  value={folder}
                  onChange={pickFolder}
                  className="flex-1"
                  options={[
                    { value: "all", label: t("folders.all") },
                    ...folders.map((item) => ({ value: String(item.id), label: item.name })),
                    { value: "none", label: t("folders.none") },
                  ]}
                />
                {picked && <IconButton icon="edit" label={t("folders.editTitle")} onClick={() => setEditing(picked)} />}
              </div>
            )}
            {!wide && ideas.length > 0 && (
              <div className="mb-3">
                <FolderSuggestions names={ideas} onCreated={afterFolder} />
              </div>
            )}
            {/* The phone: search on its own line, the create-set menu under it. */}
            <div className="mb-6 flex flex-wrap items-center gap-2">
              <SearchField
                value={q}
                onChange={setQ}
                label={t("sets.searchLabel")}
                placeholder={t("search.placeholder")}
                clearLabel={t("common.clear")}
                className="basis-full sm:flex-1 sm:basis-auto"
              />
              <Menu
                label={t("sets.new")}
                icon="plus"
                variant={dueCount > 0 ? "secondary" : "primary"}
                items={[
                  { label: t("sets.new"), icon: "plus", to: "/sets/new" },
                  { label: t("home.fromMaterial"), icon: "bulb", to: "/create/ai" },
                ]}
              />
            </div>
            {/* Same tree position with and without results, so the input keeps focus while typing. */}
            {sets.length === 0 ? (
              query || q ? (
                <EmptyState icon="search" title={t("sets.noResults")} text={t("sets.noResultsText")} />
              ) : (
                <EmptyState icon="folder" title={t("folders.emptyTitle")} text={t("folders.emptyText")} />
              )
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{sets.map((set, i) => setCard(set, i))}</div>
            )}
          </div>
        </div>
      )}
      <FolderEditor
        folder={editing}
        onClose={() => setEditing(null)}
        onDeleted={() => {
          setEditing(null);
          pickFolder("all");
        }}
      />
    </div>
  );
}
