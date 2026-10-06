import { forwardRef, useImperativeHandle, useRef } from "react";
import { useT } from "../../i18n";
import { IconButton } from "../Button";

export type TermEditorHandle = { focus: () => void };

const cell =
  "w-full border-0 border-b-2 border-line bg-transparent px-0 pt-1 pb-1.5 text-base text-ink outline-none transition-colors focus:border-accent";

/**
 * One term/definition pair while creating a set. Side by side on a wide
 * screen, stacked on the phone. Enter in "term" jumps to "definition";
 * Enter in "definition" calls onNext (usually: focus or add the next row).
 *
 *   <TermEditorRow ref={rowRef} index={0} term={t} definition={d} onChange={...} onNext={...} onDelete={...} />
 *   rowRef.current?.focus();
 */
export const TermEditorRow = forwardRef<
  TermEditorHandle,
  {
    index: number;
    term: string;
    definition: string;
    onChange: (term: string, definition: string) => void;
    onNext?: () => void;
    onDelete?: () => void;
  }
>(function TermEditorRow({ index, term, definition, onChange, onNext, onDelete }, ref) {
  const { t } = useT();
  const termRef = useRef<HTMLInputElement>(null);
  const defRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => ({ focus: () => termRef.current?.focus() }));

  return (
    <div className="rounded-ui-xl border border-line-soft bg-surface p-4 md:p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-faint">{index + 1}</span>
        {onDelete && <IconButton icon="trash" size="sm" label={t("study.deleteTerm")} onClick={onDelete} />}
      </div>
      <div className="grid gap-5 md:grid-cols-2 md:gap-8">
        <label className="block">
          <input
            ref={termRef}
            value={term}
            onChange={(e) => onChange(e.target.value, definition)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                defRef.current?.focus();
              }
            }}
            className={cell}
          />
          <span className="mt-1.5 block text-xs font-semibold tracking-wide text-faint uppercase">
            {t("study.term")}
          </span>
        </label>
        <label className="block">
          <input
            ref={defRef}
            value={definition}
            onChange={(e) => onChange(term, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onNext?.();
              }
            }}
            className={cell}
          />
          <span className="mt-1.5 block text-xs font-semibold tracking-wide text-faint uppercase">
            {t("study.definition")}
          </span>
        </label>
      </div>
    </div>
  );
});

/** Read-only list of all terms in a set. */
export function TermList({ terms }: { terms: { term: string; definition: string }[] }) {
  return (
    <ul className="divide-y divide-line-soft overflow-hidden rounded-ui-xl border border-line-soft bg-surface">
      {terms.map((item, i) => (
        <li key={i} className="grid gap-1 px-5 py-4 md:grid-cols-[1fr_2fr] md:gap-8">
          <span className="font-medium text-ink">{item.term}</span>
          <span className="text-ink-soft">{item.definition}</span>
        </li>
      ))}
    </ul>
  );
}
