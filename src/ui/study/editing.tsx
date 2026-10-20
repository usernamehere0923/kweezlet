import { useImperativeHandle, useRef, type Ref } from "react";
import type { TermProgress } from "../../../worker/progress";
import { useT } from "../../i18n";
import { cx } from "../cx";
import { IconButton } from "../Button";
import { SpeakButton } from "../speech";
import { surface } from "../surfaces";

export type TermEditorHandle = { focus: () => void };

const cell =
  "w-full border-0 border-b-2 border-line bg-transparent px-0 pt-1 pb-1.5 text-base text-ink outline-none transition-colors focus:border-accent";

/** One input of a TermEditorRow, its caption under it. Enter runs onEnter instead of submitting. */
function Cell({
  ref,
  label,
  value,
  onChange,
  onEnter,
}: {
  ref: Ref<HTMLInputElement>;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onEnter: () => void;
}) {
  return (
    <label className="block">
      <input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onEnter();
          }
        }}
        className={cell}
      />
      <span className="mt-1.5 block text-xs font-semibold tracking-wide text-faint uppercase">{label}</span>
    </label>
  );
}

/**
 * One term/definition pair while creating a set. Side by side on a wide
 * screen, stacked on the phone. Enter in "term" jumps to "definition";
 * Enter in "definition" calls onNext (usually: focus or add the next row).
 *
 *   <TermEditorRow ref={rowRef} index={0} term={t} definition={d} onChange={...} onNext={...} onDelete={...} />
 *   rowRef.current?.focus();
 */
export function TermEditorRow({
  ref,
  index,
  term,
  definition,
  onChange,
  onNext,
  onDelete,
}: {
  ref?: Ref<TermEditorHandle>;
  index: number;
  term: string;
  definition: string;
  onChange: (term: string, definition: string) => void;
  onNext?: () => void;
  onDelete?: () => void;
}) {
  const { t } = useT();
  const termRef = useRef<HTMLInputElement>(null);
  const defRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => ({ focus: () => termRef.current?.focus() }));

  return (
    <div className={cx(surface, "p-4 md:p-5")}>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-faint">{index + 1}</span>
        {onDelete && <IconButton icon="trash" size="sm" label={t("study.deleteTerm")} onClick={onDelete} />}
      </div>
      <div className="grid gap-5 md:grid-cols-2 md:gap-8">
        <Cell
          ref={termRef}
          label={t("study.term")}
          value={term}
          onChange={(value) => onChange(value, definition)}
          onEnter={() => defRef.current?.focus()}
        />
        <Cell
          ref={defRef}
          label={t("study.definition")}
          value={definition}
          onChange={(value) => onChange(term, value)}
          onEnter={() => onNext?.()}
        />
      </div>
    </div>
  );
}

const progressDots: Record<TermProgress, string> = {
  known: "bg-correct",
  learning: "bg-accent",
  new: "bg-line",
};

/** Small coloured dot for where a term stands; the word is there for screen readers. */
export function TermProgressDot({ progress }: { progress: TermProgress }) {
  const { t } = useT();
  return (
    <span className={cx("inline-block size-2.5 shrink-0 rounded-full", progressDots[progress])}>
      <span className="sr-only">{t(`study.${progress}`)}</span>
    </span>
  );
}

/** The terms of a set, read-only. `progress` adds a status dot before each term;
 * `speak` adds a speaker per term and definition (the set's languages). */
export function TermList({
  terms,
  speak,
}: {
  terms: { term: string; definition: string; progress?: TermProgress }[];
  speak?: { termLang: string | null; defLang: string | null };
}) {
  return (
    <ul className={cx(surface, "divide-y divide-line-soft overflow-hidden")}>
      {terms.map((item, i) => (
        <li key={i} className="grid gap-1 px-5 py-4 md:grid-cols-[1fr_2fr] md:gap-8">
          <span className="flex items-center gap-2.5 font-medium text-ink">
            {item.progress && <TermProgressDot progress={item.progress} />}
            <span className="flex-1">{item.term}</span>
            {speak && <SpeakButton speech={{ text: item.term, lang: speak.termLang }} />}
          </span>
          <span className="flex items-start justify-between gap-2 text-ink-soft">
            <span className="flex-1">{item.definition}</span>
            {speak && <SpeakButton speech={{ text: item.definition, lang: speak.defLang }} />}
          </span>
        </li>
      ))}
    </ul>
  );
}
