import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
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
 * Picks close the list; so do a click outside, the focus leaving it (Tab away,
 * another window) and Esc. Closing by pick or Esc puts the focus back on the
 * button. Arrows walk the items.
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
   * Which edge of the button the list lines up with. "auto" decides on open:
   * a button in the right half of the screen gets "end", so the list grows
   * toward the room, whatever the layout puts it at that width.
   */
  align?: "start" | "end" | "auto";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<"start" | "end">("start");
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  // A pick (or Esc, or the button again) unmounts the focused list: hand the
  // focus to the button first, or it falls to body and the next Tab starts
  // over at the top of the page.
  const close = () => {
    box.current?.querySelector<HTMLButtonElement>("[data-menu-trigger]")?.focus();
    setOpen(false);
  };
  // align="auto": the side with room, from where the button sits right now.
  const place = useCallback(() => {
    if (align !== "auto" || !box.current) return;
    const { left, width } = box.current.getBoundingClientRect();
    setSide(left + width / 2 > document.documentElement.clientWidth / 2 ? "end" : "start");
  }, [align]);
  const toggle = () => {
    if (open) return close();
    place();
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    // The focus goes into the list on open, so the keys always arrive here.
    // Safari and Firefox on macOS give a clicked button no focus: without
    // this, Esc and the arrows went to body after a mouse open.
    list.current?.focus();
    // A tap outside. Focus leaving would catch most of it, but iOS Safari
    // keeps the focus when the tap lands on something that can't take it.
    const down = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", down);
    // A rotation or resize while open can move the button to the other half.
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("pointerdown", down);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  // Focus leaving the box closes it: Tab past the last item, a click on
  // something else, another window (relatedTarget null). A mousedown inside
  // can't cause it: the box keeps its focus (onMouseDown below).
  const blur = (event: ReactFocusEvent<HTMLDivElement>) => {
    if (open && !box.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
  };

  const keys = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    // Someone else's key: handled already, an IME composing, or a shortcut.
    if (!open || event.defaultPrevented || event.nativeEvent.isComposing) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const picks = [...(list.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
    const at = picks.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Escape") close();
    else if (event.key === "ArrowDown") {
      event.preventDefault();
      (picks[at + 1] ?? picks[0])?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      (picks[at - 1] ?? picks.at(-1))?.focus();
    }
  };

  return (
    <div
      ref={box}
      className={cx("relative inline-block", className)}
      onKeyDown={keys}
      onBlur={blur}
      // A mousedown would move the focus (to body on Safari/Firefox, whose
      // buttons take none): the list would close before the click lands.
      // The click itself still happens.
      onMouseDown={(event) => open && event.preventDefault()}
    >
      <Button
        data-menu-trigger
        aria-haspopup="menu"
        aria-expanded={open}
        variant={variant}
        size={size}
        icon={icon}
        onClick={toggle}
      >
        <span className="flex items-center gap-1.5">
          {label}
          <Icon name="chevronDown" size="1rem" className="opacity-70" />
        </span>
      </Button>
      {open && (
        <div
          ref={list}
          role="menu"
          aria-label={label}
          tabIndex={-1}
          className={cx(
            "absolute top-full z-40 mt-1.5 min-w-44 animate-fade-in rounded-ui-lg border border-line-soft bg-surface py-1.5 shadow-overlay outline-none",
            (align === "auto" ? side : align) === "end" ? "right-0" : "left-0",
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

const itemClass =
  "flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[15px] text-ink transition-colors hover:bg-sunken active:bg-sunken";
