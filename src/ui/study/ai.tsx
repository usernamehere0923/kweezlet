import { useMemo, useState } from "react";
import { useT } from "../../i18n";
import { formatCost } from "../../lib/cost";
import { ButtonLink, IconButton } from "../Button";
import { cx } from "../cx";
import { Checkbox } from "../fields";
import { Icon } from "../Icon";
import { Card, surface, Tag } from "../surfaces";
import { Heading, Text } from "../Text";
import { Cell } from "./editing";
import { ProgressBar } from "./ProgressBar";

/**
 * What an AI run cost: "$0.02 · 14,210 tokens · 38 s". `estimate` is the line
 * before a run ("about 6,000 tokens · about $0.01"), without a time.
 */
export function CostLine({
  nanos,
  tokens,
  durationMs,
  estimate = false,
}: {
  nanos: number;
  tokens: number;
  durationMs?: number;
  estimate?: boolean;
}) {
  const { t, tn, formatNumber } = useT();
  const about = (value: string) => (estimate ? t("ai.about", { value }) : value);
  const parts = estimate
    ? [about(tn("ai.tokens", tokens, { tokens: formatNumber(tokens) })), about(formatCost(nanos))]
    : [formatCost(nanos), tn("ai.tokens", tokens, { tokens: formatNumber(tokens) })];
  // Rounded up like the cost: a started second counts, a run never shows "0 s".
  if (!estimate && durationMs !== undefined) parts.push(t("ai.seconds", { seconds: Math.ceil(durationMs / 1000) }));
  return <p className="text-sm text-muted tabular-nums">{parts.join(" · ")}</p>;
}

/**
 * One page (or Word section, slide, sheet) in the material picker: a
 * thumbnail, or the start of its text, and its number. Tap to pick it.
 * `used`: an earlier run already had it ("More cards"). `scan`: an image page,
 * its cards cannot be checked. `disabled`: a run's limit is reached; a picked
 * tile stays tappable even then, so a page can be swapped for another.
 */
export function PageTile({
  n,
  label,
  thumbnail,
  selected,
  onToggle,
  used = false,
  scan = false,
  disabled = false,
}: {
  n: number;
  /** The text shown without a thumbnail, and part of the tile's name: a heading, a slide title. */
  label?: string;
  thumbnail?: string;
  selected: boolean;
  onToggle: (selected: boolean) => void;
  used?: boolean;
  scan?: boolean;
  disabled?: boolean;
}) {
  const { t } = useT();
  const off = disabled && !selected;
  // The button's name says everything the tile shows: "Page 3: Kantone, scan, used".
  const name = [label ? `${t("ai.page", { n })}: ${label}` : t("ai.page", { n })];
  if (scan) name.push(t("ai.scan"));
  if (used) name.push(t("ai.used"));
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={name.join(", ")}
      disabled={off}
      onClick={() => onToggle(!selected)}
      className={cx(
        "relative flex flex-col overflow-hidden rounded-ui-lg border-2 bg-surface text-left transition-colors",
        selected ? "border-accent" : "border-line-soft enabled:hover:border-line",
        off && "opacity-50",
      )}
    >
      <span className="block aspect-[3/4] w-full overflow-hidden bg-sunken">
        {thumbnail ? (
          <img src={thumbnail} alt="" className="size-full object-cover" />
        ) : (
          // Room on the right for the check mark of a picked tile.
          <span className="line-clamp-6 block p-2 pr-8 text-xs text-ink-soft">{label}</span>
        )}
      </span>
      <span className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-semibold text-ink-soft">
        <span className="tabular-nums">{n}</span>
        {scan && <Icon name="eye" size="0.85rem" className="text-faint" />}
        {used && <span className="ml-auto font-medium text-faint">{t("ai.used")}</span>}
      </span>
      {selected && (
        <span className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-accent-strong text-on-accent">
          <Icon name="check" size="0.9rem" />
        </span>
      )}
    </button>
  );
}

/** A card side holds at most this many characters (worker/ai.ts draftCard). */
const MAX_SIDE_CHARS = 1000;

/**
 * One card the AI proposed, on the draft's review screen: keep it or not,
 * edit it, see its source quote. An unverified card (its quote is not in the
 * material, or it came from a scan) says so; the page starts it unchecked.
 */
export function DraftCard({
  index,
  term,
  definition,
  onChange,
  checked,
  onCheck,
  source,
  page,
  verified,
  onDelete,
}: {
  index: number;
  term: string;
  definition: string;
  onChange: (term: string, definition: string) => void;
  checked: boolean;
  onCheck: (checked: boolean) => void;
  /** The quote the card rests on, "" when the AI gave none. */
  source: string;
  page: number | null;
  verified: boolean;
  onDelete?: () => void;
}) {
  const { t } = useT();
  const [showSource, setShowSource] = useState(false);
  return (
    // A group named "Card 3", so a screen reader can tell the many "Term" fields apart.
    <div
      role="group"
      aria-label={t("ai.card", { n: index + 1 })}
      className={cx(surface, "p-4 transition-opacity md:p-5", !checked && "opacity-70")}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Checkbox label={t("ai.keep", { n: index + 1 })} checked={checked} onChange={onCheck} />
        {page !== null && <Tag tone="neutral">{t("ai.pageShort", { n: page })}</Tag>}
        {!verified && (
          <Tag tone="accent" icon="warning">
            {t("ai.unverified")}
          </Tag>
        )}
        <span className="ml-auto">
          {onDelete && <IconButton icon="trash" size="sm" label={t("study.deleteTerm")} onClick={onDelete} />}
        </span>
      </div>
      <div className="grid gap-5 md:grid-cols-2 md:gap-8">
        <Cell
          label={t("study.term")}
          value={term}
          onChange={(value) => onChange(value, definition)}
          wrap
          maxLength={MAX_SIDE_CHARS}
        />
        <Cell
          label={t("study.definition")}
          value={definition}
          onChange={(value) => onChange(term, value)}
          wrap
          maxLength={MAX_SIDE_CHARS}
        />
      </div>
      {!verified && <p className="mt-3 text-sm text-muted">{t("ai.unverifiedHint")}</p>}
      {source ? (
        <div className="mt-3">
          <button
            type="button"
            aria-expanded={showSource}
            onClick={() => setShowSource((open) => !open)}
            className="text-sm font-medium text-teal hover:text-teal-strong"
          >
            {t(showSource ? "ai.hideSource" : "ai.showSource")}
          </button>
          {showSource && (
            <blockquote className="mt-2 border-l-2 border-line pl-3 text-sm text-ink-soft italic">{source}</blockquote>
          )}
        </div>
      ) : (
        <p className="mt-3 text-sm text-faint">{t("ai.noSource")}</p>
      )}
    </div>
  );
}

/** A draft as Home lists it. */
export type DraftItem = {
  /** Where "Open" goes: the draft's review screen. */
  to: string;
  title: string;
  status: "running" | "ready" | "failed";
  cardCount: number;
};

/**
 * Home's card for AI drafts not saved or discarded yet, newest first, each
 * with how far it is and a way back in. All of them: Home is the only way
 * back to a draft, and untouched ones go after 30 days.
 */
export function UnfinishedDrafts({ drafts }: { drafts: DraftItem[] }) {
  const { t, tn } = useT();
  return (
    <Card className="flex flex-col gap-3">
      <Heading level={3}>{tn("ai.home.drafts", drafts.length)}</Heading>
      <ul className="flex flex-col gap-3">
        {drafts.map((draft) => (
          <li key={draft.to} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-medium text-ink">{draft.title}</p>
              <Text variant="small">
                {draft.status === "running"
                  ? t("ai.draft.making")
                  : draft.status === "failed" && draft.cardCount === 0
                    ? t("ai.home.failed")
                    : tn("ai.draft.cards", draft.cardCount)}
              </Text>
            </div>
            <ButtonLink to={draft.to} variant="secondary" size="sm">
              {t("ai.home.open")}
            </ButtonLink>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** One AI run, as Settings lists it. */
export type AiRun = { at: Date; action: "create" | "regenerate" | "more"; tokens: number; nanos: number };

const RUN_ACTIONS = {
  create: "settings.aiAction.create",
  regenerate: "settings.aiAction.regenerate",
  more: "settings.aiAction.more",
} as const;

/**
 * What the AI cost: this month against the budget (`capNanos` null: no
 * limit, no bar), all time, and the last runs.
 */
export function AiUsage({
  monthNanos,
  totalNanos,
  capNanos,
  runs,
}: {
  monthNanos: number;
  totalNanos: number;
  capNanos: number | null;
  runs: AiRun[];
}) {
  const { t, tn, locale, formatNumber } = useT();
  const when = useMemo(
    () => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
    [locale],
  );
  const month = formatCost(monthNanos);
  return (
    <div className="flex flex-col gap-4">
      {capNanos === null ? (
        <Text>{t("settings.aiMonthNoCap", { cost: month })}</Text>
      ) : (
        <div className="flex flex-col gap-2">
          <Text>{t("settings.aiMonth", { cost: month, cap: formatCost(capNanos) })}</Text>
          {/* The run that crosses the budget still ends: the month can go past it. */}
          <ProgressBar value={Math.min(monthNanos, capNanos)} max={capNanos} label={t("settings.aiBudget")} />
          <Text variant="small">{t(monthNanos >= capNanos ? "ai.error.capReached" : "settings.aiCapHint")}</Text>
        </div>
      )}
      <Text variant="muted">{t("settings.aiTotal", { cost: formatCost(totalNanos) })}</Text>
      {runs.length === 0 ? (
        <Text variant="small">{t("settings.aiNone")}</Text>
      ) : (
        <div>
          <Heading level={3} className="mb-2">
            {t("settings.aiRecent")}
          </Heading>
          <ul className="divide-y divide-line-soft text-sm">
            {runs.map((run, i) => (
              <li key={`${run.at.getTime()}-${i}`} className="flex items-start justify-between gap-3 py-2">
                <div>
                  <p className="text-ink">{t(RUN_ACTIONS[run.action])}</p>
                  <p className="text-muted">{when.format(run.at)}</p>
                </div>
                <div className="text-right tabular-nums">
                  <p className="text-ink">{formatCost(run.nanos)}</p>
                  <p className="text-muted">{tn("ai.tokens", run.tokens, { tokens: formatNumber(run.tokens) })}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
