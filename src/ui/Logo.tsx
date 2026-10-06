import { cx } from "./cx";

/**
 * The K mark. The same three strokes as assets/icons/*.svg and
 * assets/og/card.html; there is no shared include, so mirror any change by hand.
 */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} aria-hidden="true">
      <rect x="0.5" y="0.5" width="63" height="63" rx="14" className="fill-bg stroke-line" />
      <g className="stroke-accent" strokeWidth="7" strokeLinecap="round" fill="none">
        <path d="M23 16 V48" />
        <path d="M42 16 L24 33" />
        <path d="M30 28 L43 48" />
      </g>
    </svg>
  );
}

/** Mark + "kweezlet" in the serif. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2.5", className)}>
      <LogoMark size={30} />
      <span className="font-serif text-[22px] leading-none tracking-tight text-ink">kweezlet</span>
    </span>
  );
}
