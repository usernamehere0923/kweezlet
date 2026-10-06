import { useT } from "../../i18n";
import { cx } from "../cx";
import { Icon, type IconName } from "../Icon";
import { Tag } from "../surfaces";

/** A study set in a list or search result. */
export function StudySetCard({
  title,
  termCount,
  owner,
  tag,
  onClick,
}: {
  title: string;
  termCount: number;
  owner?: string;
  tag?: string;
  onClick?: () => void;
}) {
  const { tn, t } = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full flex-col gap-3 rounded-ui-xl border border-line-soft bg-surface p-5 text-left transition-all hover:-translate-y-0.5 hover:border-line hover:shadow-raised"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[17px] leading-snug font-semibold text-ink">{title}</h3>
        {tag && <Tag>{tag}</Tag>}
      </div>
      <div className="flex items-center gap-3 text-sm text-muted">
        <span className="inline-flex h-6 items-center rounded-full bg-sunken px-2.5 font-medium text-ink-soft">
          {tn("study.terms", termCount)}
        </span>
        {owner && (
          <span className="inline-flex items-center gap-1.5">
            <Icon name="user" size="0.95rem" />
            {t("study.by", { name: owner })}
          </span>
        )}
      </div>
    </button>
  );
}

export type StudyMode = "flashcards" | "learn" | "test" | "match";

const modeIcons: Record<StudyMode, IconName> = {
  flashcards: "copy",
  learn: "learn",
  test: "checkCircle",
  match: "sliders",
};

/** Big tappable tile to start a study mode. */
export function StudyModeTile({ mode, onClick, active }: { mode: StudyMode; onClick?: () => void; active?: boolean }) {
  const { t } = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        "flex min-h-24 flex-col items-start justify-between gap-3 rounded-ui-xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-raised",
        active ? "border-accent bg-accent-wash" : "border-line-soft bg-surface hover:border-line",
      )}
    >
      <span className="flex size-10 items-center justify-center rounded-ui bg-teal-wash text-teal">
        <Icon name={modeIcons[mode]} size="1.3rem" />
      </span>
      <span className="text-[15px] font-semibold text-ink">{t(`study.mode.${mode}`)}</span>
    </button>
  );
}
