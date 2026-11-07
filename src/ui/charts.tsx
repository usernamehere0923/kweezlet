import { useEffect, useRef, type ReactNode } from "react";
import { useT } from "../i18n";
import { cx } from "./cx";
import { Icon, type IconName } from "./Icon";

/**
 * The Statistics page's charts, hand-rolled: SVG bars and lines over theme
 * tokens, no chart library. Every chart takes its points already labelled
 * (the page turns day_stats rows into points) and is one static picture for
 * screen readers (role="img", one aria-label); the exact numbers are the
 * native tooltips on the bars and segments.
 */

/** One label with the value behind it, as the charts take their data. */
export type ChartPoint = { label: string; value: number };

/** One big number with its label: the dashboard's top row of tiles. */
export function StatTile({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: IconName;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-ui-xl border border-line-soft bg-surface p-4 shadow-raised">
      <span className="flex items-center gap-2 text-[13px] font-medium text-muted">
        {/* The theme's accent, as on EmptyState: a small wash behind the icon. */}
        {icon && (
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-wash text-accent-strong">
            <Icon name={icon} size="0.85rem" />
          </span>
        )}
        {label}
      </span>
      <span className="font-display text-2xl leading-tight">{value}</span>
      {hint && <span className="text-[13px] text-faint">{hint}</span>}
    </div>
  );
}

/** The 100×100 box every chart draws in: stretched over the width, one name. */
function ChartFrame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="img" aria-label={label} className="w-full">
      {/* none: the box may stretch; bars and areas have no shape to distort. */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-36 w-full" aria-hidden>
        {children}
      </svg>
    </div>
  );
}

/** The axis under a chart: first and last label, a few in between. */
function AxisLabels({ points }: { points: { label: string }[] }) {
  const step = Math.max(1, Math.ceil(points.length / 6));
  return (
    <div className="mt-1.5 flex">
      {points.map((point, i) => (
        // Labels sit under their bar but may spill over the narrow columns;
        // with every fifth or sixth shown they never collide. The last one
        // appears only when it is far enough from the label before it.
        <span key={i} className="flex-1 whitespace-nowrap text-center text-[11px] text-faint">
          {i % step === 0 || (i === points.length - 1 && (points.length - 1) % step > step / 2) ? point.label : ""}
        </span>
      ))}
    </div>
  );
}

/** The quiet baseline every chart stands on. */
function Baseline() {
  return <rect x="0" y="99.6" width="100" height="0.4" className="fill-line-soft" />;
}

/** Vertical bars over one value per label ("cards studied per day"). */
export function BarChart({
  label,
  points,
  format = String,
}: {
  /** The chart's accessible name, e.g. t("stats.cardsChart"). */
  label: string;
  points: ChartPoint[];
  format?: (value: number) => string;
}) {
  const max = Math.max(1, ...points.map((point) => point.value));
  const slot = 100 / Math.max(1, points.length);
  return (
    <div>
      <ChartFrame label={label}>
        {points.map((point, i) => {
          // A day without study stands empty, never a hairline.
          const height = point.value === 0 ? 0 : Math.max(2, (point.value / max) * 100);
          return (
            <rect
              key={i}
              x={i * slot + 0.3}
              y={100 - height}
              width={Math.max(slot - 0.6, 0.1)}
              height={height}
              className="fill-accent"
            >
              <title>{`${point.label} · ${format(point.value)}`}</title>
            </rect>
          );
        })}
        <Baseline />
      </ChartFrame>
      <AxisLabels points={points} />
    </div>
  );
}

/** Two stacked bars per label: the wrong answers on top of the correct ones. */
export function StackedBarChart({
  label,
  points,
  format = String,
}: {
  label: string;
  points: { label: string; correct: number; wrong: number }[];
  format?: (value: number) => string;
}) {
  const { t } = useT();
  const max = Math.max(1, ...points.map((point) => point.correct + point.wrong));
  const slot = 100 / Math.max(1, points.length);
  return (
    <div>
      <ChartFrame label={label}>
        {points.map((point, i) => {
          const x = i * slot + 0.3;
          const width = Math.max(slot - 0.6, 0.1);
          const correct = (point.correct / max) * 100;
          const wrong = (point.wrong / max) * 100;
          return (
            <g key={i}>
              <rect x={x} y={100 - correct} width={width} height={correct} className="fill-correct">
                <title>{`${point.label} · ${t("chart.correct")}: ${format(point.correct)}`}</title>
              </rect>
              <rect x={x} y={100 - correct - wrong} width={width} height={wrong} className="fill-wrong">
                <title>{`${point.label} · ${t("chart.wrong")}: ${format(point.wrong)}`}</title>
              </rect>
            </g>
          );
        })}
        <Baseline />
      </ChartFrame>
      {/* Green and red mean one thing only: answers right and wrong. */}
      <div className="mt-1.5 flex items-center gap-4 text-[12px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-correct" />
          {t("chart.correct")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-wrong" />
          {t("chart.wrong")}
        </span>
      </div>
      <AxisLabels points={points} />
    </div>
  );
}

/** A filled line over one value per label ("cards learned over the weeks"). */
export function AreaChart({
  label,
  points,
  format = String,
}: {
  label: string;
  points: ChartPoint[];
  format?: (value: number) => string;
}) {
  const max = Math.max(1, ...points.map((point) => point.value));
  const x = (i: number) => (points.length === 1 ? 50 : (i * 100) / (points.length - 1));
  const y = (point: ChartPoint) => 100 - (point.value / max) * 94; // the stroke keeps its room
  const line = points.map((point, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(point).toFixed(2)}`).join("");
  const area = line && `${line} L${x(points.length - 1).toFixed(2)},100 L${x(0).toFixed(2)},100 Z`;
  return (
    <div>
      <ChartFrame label={label}>
        {area && <path d={area} className="fill-accent-wash" />}
        {points.length > 1 && (
          <path
            d={line}
            fill="none"
            className="stroke-accent"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            // The box stretches; the line keeps its 2px.
            vectorEffect="non-scaling-stroke"
          />
        )}
        {/* One invisible strip per point: hover tells the number behind it. */}
        {points.map((point, i) => {
          const slot = 100 / Math.max(1, points.length);
          return (
            <rect key={i} x={Math.max(x(i) - slot / 2, 0)} y="0" width={slot} height="100" fill="transparent">
              <title>{`${point.label} · ${format(point.value)}`}</title>
            </rect>
          );
        })}
        <Baseline />
      </ChartFrame>
      <AxisLabels points={points} />
    </div>
  );
}

/** The heat cells, quiet to busy: one Tailwind class per level (no wildcards). */
const HEAT = ["bg-heat-0", "bg-heat-1", "bg-heat-2", "bg-heat-3", "bg-heat-4"] as const;

/** A day in the heatmap: its local date (YYYY-MM-DD) and cards studied. */
export type HeatDay = { day: string; count: number };

/** Intensity 0..4 for a day, scaled to the busiest day in the data. */
function levelOf(count: number, max: number): number {
  return count === 0 ? 0 : Math.min(4, Math.ceil((count / max) * 4));
}

/**
 * GitHub-style learning activity: one cell per day over the last weeks, the
 * busier the darker. Columns are Sunday-first weeks; the grid scrolls sideways
 * on a phone. The caller picks the days (src/lib/stats.ts builds them).
 */
export function Heatmap({ label, days }: { label: string; days: HeatDay[] }) {
  const { t, tn, locale } = useT();
  // The weeks scroll sideways on a phone: start at the newest end.
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (box.current) box.current.scrollLeft = box.current.scrollWidth;
  }, []);
  const max = Math.max(1, ...days.map((day) => day.count));
  // Blank cells before the first day, so every column is one full week.
  const pad = days[0] ? new Date(`${days[0].day}T00:00:00Z`).getUTCDay() : 0;
  const cells: (HeatDay | null)[] = [...Array.from({ length: pad }, () => null), ...days];
  const weeks: (HeatDay | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  // Every formatter says UTC, like the parsing: a machine west of UTC would
  // otherwise name each day (and weekday) one early.
  const monthFmt = new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" });
  const dateFmt = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  const weekdayFmt = new Intl.DateTimeFormat(locale, { weekday: "narrow", timeZone: "UTC" });
  // Row n of the grid is the nth weekday of a week starting on a known Sunday.
  const weekday = (row: number) => weekdayFmt.format(new Date(Date.UTC(2024, 0, 7 + row)));
  const at = (day: HeatDay) => new Date(`${day.day}T00:00:00Z`);

  let lastMonth = "";
  return (
    <div role="img" aria-label={label} className="w-full">
      <div ref={box} className="w-full overflow-x-auto">
        <div className="flex w-max flex-col gap-1">
          {/* The month a week starts in, where it changes. */}
          <div className="flex gap-[3px] pl-[22px]">
            {weeks.map((week, i) => {
              const first = week.find((cell): cell is HeatDay => cell !== null);
              const month = first ? monthFmt.format(at(first)) : "";
              const shown = month === lastMonth ? "" : month;
              lastMonth = month;
              return (
                <span key={i} className="w-[13px] whitespace-nowrap text-[10px] text-faint">
                  {shown}
                </span>
              );
            })}
          </div>
          <div className="flex gap-[3px]">
            {/* Monday, Wednesday, Friday are label enough. */}
            <div className="flex w-[19px] flex-col gap-[3px]">
              {[0, 1, 2, 3, 4, 5, 6].map((row) => (
                <span key={row} className="flex h-[13px] items-center text-[10px] text-faint">
                  {row % 2 === 1 ? weekday(row) : ""}
                </span>
              ))}
            </div>
            <div className="grid grid-flow-col grid-rows-7 gap-[3px]">
              {cells.map((cell, i) =>
                cell ? (
                  <span
                    key={i}
                    className={cx("size-[13px] rounded-[3px]", HEAT[levelOf(cell.count, max)])}
                    title={`${dateFmt.format(at(cell))} · ${tn("chart.cards", cell.count)}`}
                  />
                ) : (
                  <span key={i} className="size-[13px]" />
                ),
              )}
            </div>
          </div>
        </div>
      </div>
      {/* The legend stands outside the scrolling weeks. */}
      <div className="mt-1 flex items-center gap-1 text-[10px] text-faint">
        <span>{t("chart.less")}</span>
        {HEAT.map((heat) => (
          <span key={heat} className={cx("size-[11px] rounded-[3px]", heat)} />
        ))}
        <span>{t("chart.more")}</span>
      </div>
    </div>
  );
}
