import { THEMES, type Theme } from "../../worker/themes";
import { useT } from "../i18n";
import { cx } from "./cx";
import { Icon } from "./Icon";

/**
 * Every theme as a small tile in its own colours and display font: the tile's
 * preview carries data-theme, so the tokens inside it are that theme's.
 *   <ThemePicker label={t("settings.theme")} value={theme} onChange={pick} />
 */
export function ThemePicker({
  value,
  onChange,
  label,
}: {
  value: Theme;
  onChange: (theme: Theme) => void;
  /** For screen readers. */
  label: string;
}) {
  const { t } = useT();
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-2.5">
      {THEMES.map((id) => {
        const active = id === value;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(id)}
            className={cx(
              "rounded-ui-lg border-2 bg-surface p-1 text-left transition-colors",
              active ? "border-accent-strong" : "border-line-soft hover:border-line",
            )}
          >
            <span
              data-theme={id}
              aria-hidden="true"
              className="flex h-20 flex-col justify-between rounded-[9px] border border-line bg-bg p-2.5 text-ink"
            >
              <span className="font-display text-2xl leading-none">Aa</span>
              <span className="flex items-center gap-1.5">
                <span className="h-3.5 w-8 rounded-md bg-accent-strong" />
                <span className="size-3 rounded-full bg-teal" />
                <span className="size-3 rounded-full bg-correct" />
                <span className="size-3 rounded-full bg-wrong" />
              </span>
            </span>
            <span className="flex items-center justify-between gap-1.5 px-1.5 pt-2 pb-1 text-sm leading-tight font-medium text-ink">
              {t(`theme.${id}`)}
              {active && <Icon name="check" size="1rem" className="shrink-0 text-accent-strong" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
