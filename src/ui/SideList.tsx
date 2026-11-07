import { useId } from "react";
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
 * group: a filter, so a group of pressed buttons, not a nav landmark.
 *
 *   <SideList label="Folder" value={folder} onChange={setFolder}
 *     items={[{ id: "all", label: "All sets" }, { id: "3", label: "Spanish", editLabel: "Edit folder", onEdit: edit }]} />
 */
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
  return (
    <div role="group" aria-labelledby={heading} className={className}>
      <Heading level={3} id={heading} className="mb-2">
        {label}
      </Heading>
      <ul className={cx(surface, "flex flex-col gap-1 overflow-hidden p-2")}>
        {items.map((item) => {
          const active = item.id === value;
          return (
            <li key={item.id} className="flex items-center gap-1">
              <button
                type="button"
                aria-pressed={active}
                onClick={() => onChange(item.id)}
                className={cx(
                  "flex-1 truncate rounded-ui px-3 py-2 text-left text-[15px] transition-colors",
                  active ? "bg-sunken font-medium text-ink" : "text-ink-soft hover:bg-sunken/70 hover:text-ink",
                )}
              >
                {item.label}
              </button>
              {active && item.onEdit && item.editLabel && (
                <IconButton icon="edit" size="sm" label={item.editLabel} onClick={item.onEdit} />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
