import { useT } from "../i18n";
import { cx } from "./cx";

export function Spinner({ size = 20, className, label }: { size?: number; className?: string; label?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={cx("animate-spin", className)}
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/**
 * A page's content while it loads: a big spinner, centered.
 * `fullScreen` centers it on the whole screen (the app's first load, before any page).
 */
export function PageLoading({ fullScreen }: { fullScreen?: boolean }) {
  const { t } = useT();
  return (
    <div className={cx("flex justify-center text-muted", fullScreen ? "min-h-dvh items-center" : "py-16")}>
      <Spinner size={28} label={t("common.loading")} />
    </div>
  );
}
