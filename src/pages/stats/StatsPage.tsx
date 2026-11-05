import { useCallback, useEffect, useState } from "react";
import type { DayStats, Stats } from "../../../worker/stats";
import { useT } from "../../i18n";
import { api } from "../../lib/api";
import { formatDuration } from "../../lib/formatTime";
import { useLive } from "../../lib/live";
import { localDay } from "../../lib/studyDay";
import { byWeek, cumulative, dayLabel } from "../../lib/stats";
import {
  AreaChart,
  BarChart,
  Card,
  Heading,
  Heatmap,
  PageLoadFailed,
  PageLoading,
  PageTitle,
  SegmentedControl,
  StackedBarChart,
  StatTile,
} from "../../ui";

/** How far back the page looks: 26 weeks, for the graphs and the heatmap. */
const WINDOW_DAYS = 26 * 7;
/** The "per day" charts show the last month of that window. */
const DAY_CHART_DAYS = 30;

type Range = "day" | "week";

/** The Statistics page: the dashboard's numbers, graphs and heatmap. */
export function StatsPage() {
  const { t, locale, formatNumber } = useT();
  const [stats, setStats] = useState<Stats | null>(null);
  const [failed, setFailed] = useState(false);
  const [range, setRange] = useState<Range>("day");

  const load = useCallback(() => {
    return api.stats.$get({ query: { day: localDay(), days: String(WINDOW_DAYS) } }).then(async (res) => {
      if (res.ok) {
        setStats(await res.json());
        setFailed(false);
      } else {
        setFailed(true);
      }
    });
  }, []);
  useEffect(() => void load(), [load]);
  // Studying or editing sets on another device moves these numbers too.
  useLive("study", () => void load());
  useLive("sets", () => void load());

  if (failed) {
    return <PageLoadFailed title={t("stats.loadFailed")} onRetry={load} />;
  }
  if (!stats) {
    return <PageLoading />;
  }

  // The charts take labelled points: one bucket per day or per week.
  const rows: DayStats[] = range === "day" ? stats.days.slice(-DAY_CHART_DAYS) : byWeek(stats.days);
  const label = (row: DayStats) => dayLabel(row.day, locale);
  const points = (pick: (row: DayStats) => number) => rows.map((row) => ({ label: label(row), value: pick(row) }));
  const answers = rows.map((row) => ({ label: label(row), correct: row.correct, wrong: row.wrong }));
  // The progress line is the running total of cards learned, week by week.
  const weeks = byWeek(stats.days);
  const progress = cumulative(weeks, stats.learnedBefore).map((value, i) => ({ label: label(weeks[i]), value }));
  const heat = stats.days.map((day) => ({ day: day.day, count: day.cards }));

  return (
    <div>
      <PageTitle>{t("stats.title")}</PageTitle>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatTile label={t("stats.sets")} value={formatNumber(stats.sets)} icon="folder" />
        <StatTile label={t("stats.cards")} value={formatNumber(stats.cards)} icon="copy" />
        <StatTile
          label={t("stats.learningRate")}
          value={formatNumber(stats.learningRate, { style: "percent", maximumFractionDigits: 0 })}
          icon="checkCircle"
        />
        <StatTile label={t("stats.streak")} value={formatNumber(stats.streak)} icon="star" />
        <StatTile label={t("stats.learnedToday")} value={formatNumber(stats.learnedToday)} icon="learn" />
        <StatTile label={t("stats.totalTime")} value={formatDuration(stats.totalSeconds, formatNumber)} icon="clock" />
      </div>

      <div className="mt-6 flex justify-end">
        <SegmentedControl<Range>
          label={t("stats.rangeLabel")}
          value={range}
          onChange={setRange}
          size="sm"
          options={[
            { value: "day", label: t("stats.perDay") },
            { value: "week", label: t("stats.perWeek") },
          ]}
        />
      </div>

      <div className="mt-3 flex flex-col gap-6">
        <Card>
          <Heading level={3} className="mb-3">
            {t("stats.cardsSection")}
          </Heading>
          <BarChart
            label={t(range === "day" ? "stats.cardsChart" : "stats.cardsChartWeek")}
            points={points((row) => row.learned)}
            format={(value) => formatNumber(value)}
          />
        </Card>

        <Card>
          <Heading level={3} className="mb-3">
            {t("stats.timeSection")}
          </Heading>
          <BarChart
            label={t(range === "day" ? "stats.timeChart" : "stats.timeChartWeek")}
            points={points((row) => row.seconds)}
            format={(value) => formatDuration(value, formatNumber)}
          />
        </Card>

        <Card>
          <Heading level={3} className="mb-3">
            {t("stats.answersSection")}
          </Heading>
          <StackedBarChart
            label={t(range === "day" ? "stats.answersChart" : "stats.answersChartWeek")}
            points={answers}
            format={(value) => formatNumber(value)}
          />
        </Card>

        <Card>
          <Heading level={3} className="mb-3">
            {t("stats.progressSection")}
          </Heading>
          <AreaChart label={t("stats.progressChart")} points={progress} format={(value) => formatNumber(value)} />
        </Card>

        <Card>
          <Heading level={3} className="mb-3">
            {t("stats.activitySection")}
          </Heading>
          <Heatmap label={t("stats.activityChart")} days={heat} />
        </Card>
      </div>
    </div>
  );
}
