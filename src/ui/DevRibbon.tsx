import { useT } from "../i18n";
import { cx } from "./cx";

/**
 * Red band across the top-right corner: "this is the local dev server, not
 * the live app". App renders it only under `import.meta.env.DEV`, so the live
 * app never shows it. Taps go through it.
 * `contained` pins it to the nearest positioned parent instead of the window.
 */
export function DevRibbon({ contained }: { contained?: boolean }) {
  const { t } = useT();
  return (
    <div
      aria-hidden
      className={cx("pointer-events-none top-0 right-0 z-50 size-24 overflow-hidden", contained ? "absolute" : "fixed")}
    >
      <div className="absolute top-5 -right-9 w-36 rotate-45 bg-wrong py-1 text-center text-xs font-bold tracking-widest text-on-accent shadow-raised">
        {t("dev.ribbon")}
      </div>
    </div>
  );
}
