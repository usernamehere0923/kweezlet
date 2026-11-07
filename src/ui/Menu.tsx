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
  /**
   * Which edge of the button the list lines up with. "start sm:end": the button
   * sits at the left on the phone and at the right end of a row from sm up.
   */
  align?: "start" | "end" | "start sm:end";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const close = () => backToButton(box.current, setOpen);

  // The list lives only while open: a click outside or the focus leaving closes it.
  useEffect(() => {
    if (!open) return;
    const down = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    // Focus going nowhere (relatedTarget null) is ambiguous. Safari and Firefox on
    // macOS drop it to body on a mousedown inside the list: closing then would
    // swallow the click on the item. Tab into the browser chrome or switching
    // apps also sends null, but the window loses focus: that one closes.
    let check: ReturnType<typeof setTimeout> | undefined;
    const out = (event: FocusEvent) => {
      const to = event.relatedTarget as Node | null;
      if (to) {
        if (!box.current?.contains(to)) setOpen(false);
        return;
      }
      clearTimeout(check);
      check = setTimeout(() => {
        if (!document.hasFocus()) setOpen(false);
      });
    };
    // Keys on the document, not the box: a mouse open on Safari/Firefox (macOS)
    // leaves focus on body, where a box-level onKeyDown never hears Esc/arrows.
    const keys = (event: KeyboardEvent) => {
      // Someone else's key: handled already, an IME composing, or a shortcut.
      if (event.defaultPrevented || event.isComposing) return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const here = document.activeElement;
      if (here && here !== document.body && !box.current?.contains(here)) return;
      const picks = [...(box.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
      const at = picks.indexOf(here as HTMLElement);
      if (event.key === "Escape") backToButton(box.current, setOpen, true);
      else if (event.key === "ArrowDown") {
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
      clearTimeout(check);
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
            ALIGN[align],
          )}
        >
          {items.map(({ label: text, icon: glyph, to, onClick }) =>
            to ? (
              <Link key={text} to={to} role="menuitem" onClick={close} className={itemClass}>
                {glyph && <Icon name={glyph} size="1.125rem" className="text-ink-soft" />}
                {text}
              </Link>
            ) : (
              <button
                key={text}
                type="button"
                role="menuitem"
                onClick={() => {
                  close();
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

/**
 * Closes the list with the focus on the button. A pick unmounts the focused
 * item; without this the focus falls to body and the next Tab starts over at
 * the top of the page. `always` (Esc) moves it even from body; a pick only
 * when the focus was in the list, so a Safari mouse pick (focus on body) draws
 * no ring on a button nobody tabbed to.
 */
function backToButton(box: HTMLElement | null, setOpen: (open: boolean) => void, always = false) {
  if (always || box?.contains(document.activeElement)) {
    box?.querySelector<HTMLButtonElement>("[data-menu-trigger]")?.focus();
  }
  setOpen(false);
}

const ALIGN = {
  start: "left-0",
  end: "right-0",
  "start sm:end": "left-0 sm:left-auto sm:right-0",
} as const;

const itemClass =
  "flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[15px] text-ink transition-colors hover:bg-sunken active:bg-sunken";
