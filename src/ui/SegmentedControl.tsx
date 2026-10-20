import { useLayoutEffect, useRef } from "react";
import { cx } from "./cx";
import type { Option } from "./fields";

/**
 * A row of 2-4 options where exactly one is active (e.g. language).
 * The white pill slides to the chosen option.
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  label,
  size = "md",
}: {
  value: T;
  onChange: (value: T) => void;
  options: Option<T>[];
  /** For screen readers. */
  label: string;
  size?: "sm" | "md";
}) {
  const group = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLSpanElement>(null);
  // Put the pill under the active option: on every change, and when the
  // options resize (the font arrives late). Straight to the DOM, no re-render.
  useLayoutEffect(() => {
    const place = () => {
      const active = group.current?.querySelector<HTMLElement>('[aria-checked="true"]');
      // Hidden (width 0): wait for the resize when it shows.
      if (!active?.offsetWidth || !pill.current) return;
      pill.current.style.translate = `${active.offsetLeft}px 0`;
      pill.current.style.width = `${active.offsetWidth}px`;
      // Only after the first placement: on mount it sits there, it doesn't fly in.
      pill.current.dataset.placed = "";
    };
    place();
    if (typeof ResizeObserver !== "function" || !group.current) return;
    const observer = new ResizeObserver(place);
    observer.observe(group.current);
    return () => observer.disconnect();
  }, [value, options]);

  return (
    <div
      ref={group}
      role="radiogroup"
      aria-label={label}
      className="relative inline-flex w-fit rounded-ui border border-line bg-sunken/60 p-1"
    >
      <span
        ref={pill}
        aria-hidden="true"
        data-testid="segment-pill"
        className="absolute inset-y-1 left-0 rounded-[7px] bg-surface shadow-raised data-placed:transition-[translate,width] data-placed:duration-300 data-placed:ease-out"
      />
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cx(
              "relative rounded-[7px] font-medium transition-colors",
              size === "sm" ? "h-7 px-3 text-sm" : "h-9 px-4 text-[15px]",
              active ? "text-ink" : "text-muted hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
