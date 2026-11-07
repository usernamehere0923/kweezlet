import { useEffect, useId, useRef, useState } from "react";
import { cx } from "./cx";
import { IconButton } from "./Button";
import { surface } from "./surfaces";
import { Heading } from "./Text";

export type SideItem = {
  id: string;
  label: string;
  /** Pencil next to the picked row (e.g. to rename a folder). */
  editLabel?: string;
  onEdit?: () => void;
};

/**
 * A short list to pick one thing from, for the side of a wide screen
 * (the phone gets a Select instead). The picked row is marked, and only it
 * shows the edit pencil. `label` is the visible heading above it and names the
 * group. Pick-one filter, so native radios (arrows move the pick), not a nav
 * landmark and not toggle buttons.
 *
 *   <SideList label="Folder" value={folder} onChange={setFolder}
 *     items={[{ id: "all", label: "All sets" }, { id: "3", label: "Spanish", editLabel: "Edit folder", onEdit: edit }]} />
 */
/** A keyboard pick waits this long for the next arrow before it counts. */
const SETTLE_MS = 300;

export function SideList({
  label,
  items,
  value,
  onChange,
  className,
}: {
  label: string;
  items: SideItem[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  const heading = useId();
  // Arrows move a radio pick on every press. Walking past five folders must
  // not switch (and load) five times: keyboard picks settle first, clicks don't wait.
  const [walking, setWalking] = useState<string | null>(null);
  const keyed = useRef(false);
  const settle = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(settle.current), []);
  const shown = walking ?? value;
  const pick = (id: string) => {
    clearTimeout(settle.current);
    if (!keyed.current) {
      setWalking(null);
      onChange(id);
      return;
    }
    setWalking(id);
    settle.current = setTimeout(() => {
      setWalking(null);
      onChange(id);
    }, SETTLE_MS);
  };
  return (
    <div
      role="radiogroup"
      aria-labelledby={heading}
      className={className}
      onKeyDown={() => (keyed.current = true)}
      onPointerDown={() => (keyed.current = false)}
    >
      <Heading level={3} id={heading} className="mb-2">
        {label}
      </Heading>
      <ul className={cx(surface, "flex flex-col gap-1 overflow-hidden p-2")}>
        {items.map((item) => {
          const active = item.id === shown;
          return (
            <li key={item.id} className="flex items-center gap-1">
              <label
                className={cx(
                  "flex-1 cursor-pointer truncate rounded-ui px-3 py-2 text-left text-[15px] transition-colors",
                  // The input is hidden: the row wears the app's focus ring for it.
                  "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent",
                  active ? "bg-sunken font-medium text-ink" : "text-ink-soft hover:bg-sunken/70 hover:text-ink",
                )}
              >
                <input
                  type="radio"
                  name={heading}
                  value={item.id}
                  checked={active}
                  onChange={() => pick(item.id)}
                  className="sr-only"
                />
                {item.label}
              </label>
              {active && !walking && item.onEdit && item.editLabel && (
                <IconButton icon="edit" size="sm" label={item.editLabel} onClick={item.onEdit} />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
