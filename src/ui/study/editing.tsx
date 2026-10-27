import { useImperativeHandle, useRef, type KeyboardEvent, type Ref, type RefObject } from "react";
import { clozeAnswer, clozeParts, filled, type TermKind } from "../../../worker/cloze";
import type { TermProgress } from "../../../worker/progress";
import { useT } from "../../i18n";
import { cx } from "../cx";
import { IconButton } from "../Button";
import { SegmentedControl } from "../SegmentedControl";
import { SpeakButton } from "../speech";
import { surface } from "../surfaces";
import { useAutoGrow } from "../useAutoGrow";
import { ClozeText } from "./cloze";
import { TermImage, TermImagePicker } from "./images";

export type TermEditorHandle = { focus: () => void };

const cell =
  "w-full border-0 border-b-2 border-line bg-transparent px-0 pt-1 pb-1.5 text-base text-ink outline-none transition-colors focus:border-accent";

/**
 * One input of a TermEditorRow (and of a DraftCard), its caption under it.
 * Enter runs onEnter instead of submitting. `wrap`: grows to show all of a
 * long text (an AI answer), still one line per Enter-less entry. Not exported
 * from src/ui: rows only.
 */
export function Cell({
  ref,
  areaRef,
  label,
  value,
  onChange,
  onEnter,
  wrap = false,
  maxLength,
}: {
  ref?: Ref<HTMLInputElement>;
  /** The text area of a `wrap` cell (to read its selection). */
  areaRef?: RefObject<HTMLTextAreaElement | null>;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onEnter?: () => void;
  wrap?: boolean;
  maxLength?: number;
}) {
  const area = useRef<HTMLTextAreaElement>(null);
  useAutoGrow(area, value);
  const keys = {
    value,
    maxLength,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onEnter?.();
      }
    },
  };
  return (
    <label className="block">
      {wrap ? (
        <textarea
          ref={(el) => {
            area.current = el;
            if (areaRef) areaRef.current = el;
          }}
          {...keys}
          rows={1}
          // A pasted line break would end up inside the card: a space instead.
          onChange={(e) => onChange(e.target.value.replace(/\r?\n/g, " "))}
          className={cx(cell, "field-sizing-content resize-none")}
        />
      ) : (
        <input ref={ref} {...keys} onChange={(e) => onChange(e.target.value)} className={cell} />
      )}
      <span className="mt-1.5 block text-xs font-semibold tracking-wide text-faint uppercase">{label}</span>
    </label>
  );
}

/**
 * One term/definition pair while creating a set. Side by side on a wide
 * screen, stacked on the phone. Enter in "term" jumps to "definition";
 * Enter in "definition" calls onNext (usually: focus or add the next row).
 * `image` + `onImage` add the picture slot (TermImagePicker) under the cells.
 *
 *   <TermEditorRow ref={rowRef} index={0} term={t} definition={d} onChange={...} onNext={...} onDelete={...} />
 *   rowRef.current?.focus();
 */
export function TermEditorRow({
  ref,
  index,
  kind = "pair",
  term,
  definition,
  image,
  onChange,
  onKind,
  onNext,
  onDelete,
  onImage,
}: {
  ref?: Ref<TermEditorHandle>;
  index: number;
  /** "cloze": one sentence with a {{gap}}; the definition follows the gap. */
  kind?: TermKind;
  term: string;
  definition: string;
  /** Leave out for a row that can't switch between a pair and a gap sentence. */
  onKind?: (kind: TermKind) => void;
  /** The row's picture as a data URL (or a plain URL in the design demo). */
  image?: string | null;
  onChange: (term: string, definition: string) => void;
  onNext?: () => void;
  onDelete?: () => void;
  /** Leave out for a row without an image slot. */
  onImage?: (image: string | null) => void;
}) {
  const { t } = useT();
  const termRef = useRef<HTMLInputElement>(null);
  const defRef = useRef<HTMLInputElement>(null);
  const sentenceRef = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => ({
    focus: () => (kind === "cloze" ? sentenceRef.current : termRef.current)?.focus(),
  }));

  /** The selected words become the gap; an earlier gap is opened up again first. */
  function makeGap() {
    const area = sentenceRef.current;
    if (!area || area.selectionStart === area.selectionEnd) return;
    const [start, end] = [area.selectionStart, area.selectionEnd];
    const text = term.slice(0, start) + "{{" + term.slice(start, end).trim() + "}}" + term.slice(end);
    // Only the new marker survives: take any other one off.
    const others = text.replace(/\{\{([^{}]*)\}\}/g, (marker, inner, at: number) => (at === start ? marker : inner));
    onChange(others, clozeAnswer(others) ?? "");
  }

  const parts = kind === "cloze" ? clozeParts(term) : null;
  return (
    <div className={cx(surface, "p-4 md:p-5")}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-faint">{index + 1}</span>
        {onKind && (
          <SegmentedControl<TermKind>
            size="sm"
            label={t("study.kind")}
            value={kind}
            onChange={onKind}
            options={[
              { value: "pair", label: t("study.kind.pair") },
              { value: "cloze", label: t("study.kind.cloze") },
            ]}
          />
        )}
        {onDelete && <IconButton icon="trash" size="sm" label={t("study.deleteTerm")} onClick={onDelete} />}
      </div>
      {kind === "cloze" ? (
        <div className="flex flex-col gap-3">
          <Cell
            areaRef={sentenceRef}
            label={t("study.clozeSentence")}
            value={term}
            wrap
            onChange={(value) => onChange(value, clozeAnswer(value) ?? "")}
            onEnter={() => onNext?.()}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-muted">{parts ? <ClozeText text={term} /> : t("study.clozeHint")}</span>
            {/* Down on the button: a tap must not take the selection away first. */}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={makeGap}
              className="text-sm font-medium text-teal hover:text-teal-strong"
            >
              {t("study.makeGap")}
            </button>
          </div>
        </div>
      ) : (
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
      )}
      {onImage && (
        <div className="mt-4">
          <TermImagePicker image={image ?? null} onChange={onImage} />
        </div>
      )}
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
 * `image` shows the term's picture as a thumbnail; `speak` adds a speaker per
 * term and definition (the set's languages). */
export function TermList({
  terms,
  speak,
}: {
  terms: { kind?: "pair" | "cloze"; term: string; definition: string; progress?: TermProgress; image?: string }[];
  speak?: { termLang: string | null; defLang: string | null };
}) {
  return (
    <ul className={cx(surface, "divide-y divide-line-soft overflow-hidden")}>
      {terms.map((item, i) =>
        item.kind === "cloze" ? (
          // A gap sentence holds its answer: one line, the hidden part marked.
          <li key={i} className="flex items-center gap-2.5 px-5 py-4 text-ink">
            {item.image && <TermImage src={item.image} alt="" variant="thumb" />}
            {item.progress && <TermProgressDot progress={item.progress} />}
            <span className="flex-1">
              <ClozeText text={item.term} reveal />
            </span>
            {speak && <SpeakButton speech={{ text: filled(item.term), lang: speak.termLang }} />}
          </li>
        ) : (
          <li key={i} className="grid gap-1 px-5 py-4 md:grid-cols-[1fr_2fr] md:gap-8">
            <span className="flex items-center gap-2.5 font-medium text-ink">
              {item.image && <TermImage src={item.image} alt="" variant="thumb" />}
              {item.progress && <TermProgressDot progress={item.progress} />}
              <span className="flex-1">{item.term}</span>
              {speak && <SpeakButton speech={{ text: item.term, lang: speak.termLang }} />}
            </span>
            <span className="flex items-start justify-between gap-2 text-ink-soft">
              <span className="flex-1">{item.definition}</span>
              {speak && <SpeakButton speech={{ text: item.definition, lang: speak.defLang }} />}
            </span>
          </li>
        ),
      )}
    </ul>
  );
}
