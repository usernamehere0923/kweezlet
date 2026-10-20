import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useT } from "../i18n";
import { api } from "../lib/api";
import { useStudySet } from "../lib/studySet";
import { useMatchBoard } from "../lib/matchBoard";
import { buildMatchRound, MATCH_PAIRS, MIN_MATCH_TERMS, type MatchTileData } from "../lib/quiz";
import { formatTime } from "../lib/formatTime";
import { useStudyDay } from "../lib/studyDay";
import { ButtonLink, EmptyState, Heading, MatchResult, MatchTile, PageLoading, StreakBadge, Tag, Text } from "../ui";

type RoundResult = { seconds: number; best: number; isNewBest: boolean };

/**
 * The Match game: tap a term, tap its definition, as fast as you can. The
 * clock starts with the first tap and stops with the last pair; a faster
 * time than the stored best is saved as the new one (worker/match.ts).
 */
export function MatchPage() {
  const { t } = useT();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [tiles, setTiles] = useState<MatchTileData[]>([]);
  const board = useMatchBoard(tiles);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const streak = useStudyDay(startedAt !== null);
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  const [result, setResult] = useState<RoundResult | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // A new best time comes in on "match", from this device or another one.
  const { set, setSet } = useStudySet(id, ["sets", "match"], {
    onLoad: (detail) => {
      // The first round starts here; later reloads leave a running one alone.
      setTiles((current) =>
        current.length > 0 || detail.terms.length < MIN_MATCH_TERMS
          ? current
          : buildMatchRound(detail.terms, MATCH_PAIRS),
      );
    },
  });

  // The clock: only ticks while a round is running.
  useEffect(() => {
    if (startedAt === null || finishedAt !== null) return;
    const tick = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(tick);
  }, [startedAt, finishedAt]);

  function startRound() {
    if (!set) return;
    setTiles(buildMatchRound(set.terms, MATCH_PAIRS));
    board.reset();
    setStartedAt(null);
    setFinishedAt(null);
    setResult(null);
    setNow(Date.now());
  }

  /** The round is over: record the time and let the server judge the best. */
  function finish(started: number, end: number) {
    setFinishedAt(end);
    setNow(end);
    // Floored like the clock, so the result shows the time the clock stopped at.
    const seconds = Math.max(1, Math.floor((end - started) / 1000));
    void api.sets[":id"].match.$post({ param: { id }, json: { seconds } }).then(async (res) => {
      // Not saved (api.ts reports why): show the time, claim no record.
      const { best, isNewBest } = res.ok ? await res.json() : { best: set?.bestSeconds ?? seconds, isNewBest: false };
      setResult({ seconds, best, isNewBest });
      if (res.ok) setSet((s) => (s ? { ...s, bestSeconds: best } : s));
    });
  }

  /** `at` is the tap's timestamp, read in the click handler (react purity). */
  function tapTile(tile: MatchTileData, at: number) {
    const pairs = board.tap(tile);
    if (pairs === null) return;
    const started = startedAt ?? at;
    if (startedAt === null) {
      setStartedAt(at);
      setNow(at);
    }
    if (pairs === tiles.length / 2) finish(started, at);
  }

  if (!set) {
    return <PageLoading label={t("common.loading")} />;
  }

  const elapsed = startedAt === null ? 0 : Math.floor(((finishedAt ?? now) - startedAt) / 1000);
  const best = set.bestSeconds;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-3 flex items-center justify-between gap-2">
        <ButtonLink to={`/sets/${id}`} variant="ghost" icon="chevronLeft" className="-ml-3">
          {t("study.backToSet")}
        </ButtonLink>
        {streak > 0 && <StreakBadge days={streak} />}
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <Heading level={3}>{set.title}</Heading>
        <div className="flex items-center gap-2">
          {best !== null && <Tag icon="starFilled">{t("match.bestTime", { time: formatTime(best) })}</Tag>}
          <Tag tone="accent" icon="clock">
            {t("match.timerLabel")} {formatTime(elapsed)}
          </Tag>
        </div>
      </div>

      {result ? (
        <MatchResult
          time={formatTime(result.seconds)}
          isNewBest={result.isNewBest}
          bestTime={formatTime(result.best)}
          onPlayAgain={startRound}
          onDone={() => navigate(`/sets/${id}`)}
        />
      ) : set.terms.length < MIN_MATCH_TERMS ? (
        <EmptyState
          icon="warning"
          title={t("match.tooFewTitle")}
          text={t("match.tooFewText")}
          action={
            <ButtonLink to={`/sets/${id}/edit`} icon="edit">
              {t("sets.edit")}
            </ButtonLink>
          }
        />
      ) : (
        <>
          <Text variant="small" className="mb-3">
            {t("study.matchingHint")}
          </Text>
          <div className="grid grid-cols-2 gap-2">
            {tiles.map((tile) => {
              return (
                <MatchTile
                  key={tile.key}
                  label={tile.label}
                  state={board.stateOf(tile)}
                  onClick={() => tapTile(tile, Date.now())}
                />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
