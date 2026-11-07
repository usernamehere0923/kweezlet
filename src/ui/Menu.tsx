import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Button, type ButtonVariant } from "./Button";
import { cx } from "./cx";
import { Icon, type IconName } from "./Icon";

export type MenuItem = {
  label: string;
  icon?: IconName;
  /** A page in the app. Without it the item is a button that runs `onClick`. */
  to?: string;
  onClick?: () => void;
};

/**
 * A button that opens a short list under itself: more ways to do one thing.
 * Picks close the list; so do a click outside, Tab away and Esc (which puts the
 * focus back on the button). Arrows walk the items.
 *
 *   <Menu label="Create a set" icon="plus" items={[
 *     { label: "Create a set", icon: "plus", to: "/sets/new" },
 *     { label: "From material", icon: "bulb", to: "/create/ai" },
 *   ]} />
 */
export function Menu({
  label,
  icon,
  items,
  variant = "secondary",
  size = "md",
  align = "start",
  className,
}: {
  label: string;
  icon?: IconName;
  items: MenuItem[];
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  /** Which edge of the button the list lines up with. */
  align?: "start" | "end";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const trigger = () => box.current?.querySelector<HTMLButtonElement>("[data-menu-trigger]");

  // The list lives only while open: a click outside or the focus leaving closes it.
  useEffect(() => {
    if (!open) return;
    const down = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    // Focus going nowhere (relatedTarget null) is not "leaving": Safari and Firefox
    // on macOS drop focus to body on mousedown, which would close the list before
    // the click on an item lands. Clicks outside are the pointerdown's job.
    const out = (event: FocusEvent) => {
      const to = event.relatedTarget as Node | null;
      if (to && !box.current?.contains(to)) setOpen(false);
    };
    // Keys on the document, not the box: a mouse open on Safari/Firefox (macOS)
    // leaves focus on body, where a box-level onKeyDown never hears Esc/arrows.
    const keys = (event: KeyboardEvent) => {
      const here = document.activeElement;
      if (here && here !== document.body && !box.current?.contains(here)) return;
      const picks = [...(box.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
      const at = picks.indexOf(here as HTMLElement);
      if (event.key === "Escape") {
        setOpen(false);
        trigger()?.focus();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        (picks[at + 1] ?? picks[0])?.focus();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        (picks[at - 1] ?? picks.at(-1))?.focus();
      }
    };
    document.addEventListener("pointerdown", down);
    document.addEventListener("focusout", out);
    document.addEventListener("keydown", keys);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("focusout", out);
      document.removeEventListener("keydown", keys);
    };
  }, [open]);

  return (
    <div ref={box} className={cx("relative inline-block", className)}>
      <Button
        data-menu-trigger
        aria-haspopup="menu"
        aria-expanded={open}
        variant={variant}
        size={size}
        icon={icon}
        onClick={() => setOpen((was) => !was)}
      >
        <span className="flex items-center gap-1.5">
          {label}
          <Icon name="chevronDown" size="1rem" className="opacity-70" />
        </span>
      </Button>
      {open && (
        <div
          role="menu"
          aria-label={label}
          className={cx(
            "absolute top-full z-40 mt-1.5 min-w-44 animate-fade-in rounded-ui-lg border border-line-soft bg-surface py-1.5 shadow-overlay",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {items.map(({ label: text, icon: glyph, to, onClick }) =>
            to ? (
              <Link key={text} to={to} role="menuitem" onClick={() => setOpen(false)} className={itemClass}>
                {glyph && <Icon name={glyph} size="1.125rem" className="text-ink-soft" />}
                {text}
              </Link>
            ) : (
              <button
                key={text}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onClick?.();
                }}
                className={itemClass}
              >
                {glyph && <Icon name={glyph} size="1.125rem" className="text-ink-soft" />}
                {text}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

const itemClass =
  "flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[15px] text-ink transition-colors hover:bg-sunken active:bg-sunken";
