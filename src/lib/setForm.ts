import { useRef, useState } from "react";
import type { TKey } from "../i18n";
import type { TermEditorHandle } from "../ui";

/** One term in the set form; `id` once the server has it. */
export type Row = { id?: number; term: string; definition: string };

export const emptyRow: Row = { term: "", definition: "" };

/**
 * The editable term rows of a set form. Enter in a row's definition (next)
 * jumps to the following row, or adds one; the last row cannot be removed.
 * Wire each <TermEditorRow ref> into `rowRefs`.
 */
export function useTermRows(initial: Row[] = [emptyRow]) {
  const [rows, setRows] = useState<Row[]>(initial);
  const rowRefs = useRef<(TermEditorHandle | null)[]>([]);

  return {
    rows,
    setRows,
    rowRefs,
    update: (i: number, term: string, definition: string) =>
      setRows((list) => list.map((row, j) => (j === i ? { ...row, term, definition } : row))),
    next: (i: number) => {
      if (rows[i + 1]) rowRefs.current[i + 1]?.focus();
      else {
        setRows((list) => [...list, emptyRow]);
        setTimeout(() => rowRefs.current[i + 1]?.focus());
      }
    },
    remove: (i: number) => setRows((list) => (list.length > 1 ? list.filter((_, j) => j !== i) : list)),
    add: () => setRows((list) => [...list, emptyRow]),
  };
}

/**
 * The checks before sending: a title, at least one term, no half-filled row.
 * Rows still completely empty simply disappear (`kept` is what gets sent).
 */
export function checkSetForm(
  title: string,
  rows: Row[],
): { kept: Row[]; titleError: TKey | null; formError: TKey | null } {
  const kept = rows.filter((row) => row.term.trim() || row.definition.trim());
  if (!title.trim()) return { kept, titleError: "validation.too_small", formError: null };
  if (kept.length === 0) return { kept, titleError: null, formError: "sets.termsNeeded" };
  if (kept.some((row) => !row.term.trim() || !row.definition.trim())) {
    return { kept, titleError: null, formError: "sets.termsIncomplete" };
  }
  return { kept, titleError: null, formError: null };
}

/** The message for the server's errors on the terms, or null when there are none. */
export function termsError(errors: Record<string, TKey>): TKey | null {
  // "invalid_value" on the list means a term id went stale (changed on another device).
  if (errors.terms === "validation.invalid_value") return "sets.termsChanged";
  if (errors.terms === "validation.too_big") return "sets.termsTooMany";
  const rowCodes = Object.entries(errors).flatMap(([field, code]) => (field.startsWith("terms.") ? [code] : []));
  if (rowCodes.includes("validation.too_big")) return "sets.termTooLong";
  return rowCodes.length > 0 ? "sets.termsIncomplete" : null;
}
