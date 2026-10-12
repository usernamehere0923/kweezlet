import { useT } from "../i18n";
import { cx } from "./cx";

/**
 * Red band across the top-right corner: "this is the local test server, not
 * the live app". App renders it only under `import.meta.env.DEV`, so the live
 * app never shows it. Taps go through it.
 * `contained` pins it to the nearest positioned parent instead of the window.
 */
export function DevRibbon({ contained }: { contained?: boolean }) {
  const { t } = useT();
  return (
    <div
      aria-hidden
      className={cx("pointer-events-none top-0 right-0 z-50 size-44 overflow-hidden", contained ? "absolute" : "fixed")}
    >
      {/* Two reds in fine diagonal stripes, a darker edge and a stitched hairline along each side. */}
      <div className="absolute top-[23px] -right-[94px] w-72 rotate-45 bg-[repeating-linear-gradient(45deg,var(--color-wrong)_0_8px,var(--color-wrong-strong)_8px_16px)] border-y-2 border-wrong-strong py-[9px]">
        <div className="border-y border-dashed border-on-accent/55 py-[8px] text-center text-[15px] leading-none font-bold pl-[0.4em] tracking-[0.4em] text-on-accent uppercase">
          {t("dev.ribbon")}
        </div>
      </div>
    </div>
  );
}
