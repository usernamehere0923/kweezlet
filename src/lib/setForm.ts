import { useCallback, useRef, useState } from "react";
import type { TKey } from "../i18n";
import type { TermEditorHandle } from "../ui";
import { api } from "./api";

/** One term in the set form; `id` once the server has it. */
export type Row = {
  /** Stays with the row while rows above it come and go (React key, image picks). */
  uid?: number;
  id?: number;
  term: string;
  definition: string;
  /** The row's picture (a data URL); null when it has none. */
  image?: string | null;
  /** The user picked or removed an image: it has to be saved. */
  imageChanged?: boolean;
};

export const emptyRow: Row = { term: "", definition: "" };

let lastUid = 0;
const withUid = (row: Row): Row => (row.uid === undefined ? { ...row, uid: ++lastUid } : row);

/**
 * The editable term rows of a set form. Enter in a row's definition (next)
 * jumps to the following row, or adds one; the last row cannot be removed.
 * Wire each <TermEditorRow ref> into `rowRefs`, keyed by `row.uid`.
 */
export function useTermRows(initial: Row[] = [emptyRow]) {
  const [rows, setRawRows] = useState<Row[]>(() => initial.map(withUid));
  const rowRefs = useRef<(TermEditorHandle | null)[]>([]);
  const setRows = useCallback((list: Row[]) => setRawRows(list.map(withUid)), []);

  return {
    rows,
    setRows,
    rowRefs,
    update: (i: number, term: string, definition: string) =>
      setRawRows((list) => list.map((row, j) => (j === i ? { ...row, term, definition } : row))),
    /**
     * A picked picture (or null, when it was removed) on one row. By uid, not
     * index: shrinking a photo takes a while, and rows above may go meanwhile.
     */
    updateImage: (uid: number | undefined, image: string | null) =>
      setRawRows((list) => list.map((row) => (row.uid === uid ? { ...row, image, imageChanged: true } : row))),
    next: (i: number) => {
      if (rows[i + 1]) rowRefs.current[i + 1]?.focus();
      else {
        setRawRows((list) => [...list, withUid(emptyRow)]);
        setTimeout(() => rowRefs.current[i + 1]?.focus());
      }
    },
    remove: (i: number) => setRawRows((list) => (list.length > 1 ? list.filter((_, j) => j !== i) : list)),
    add: () => setRawRows((list) => [...list, withUid(emptyRow)]),
  };
}

/**
 * The checks before sending: a title, at least one term, no half-filled row.
 * Rows still completely empty simply disappear (`kept` is what gets sent); a
 * row with a picture counts as filled and cannot disappear silently.
 */
export function checkSetForm(
  title: string,
  rows: Row[],
): { kept: Row[]; titleError: TKey | null; formError: TKey | null } {
  const kept = rows.filter((row) => row.term.trim() || row.definition.trim() || row.image);
  if (!title.trim()) return { kept, titleError: "validation.too_small", formError: null };
  if (kept.length === 0) return { kept, titleError: null, formError: "sets.termsNeeded" };
  if (kept.some((row) => !row.term.trim() || !row.definition.trim())) {
    return { kept, titleError: null, formError: "sets.termsIncomplete" };
  }
  return { kept, titleError: null, formError: null };
}

/**
 * Sends the rows' image changes after the set itself is saved. A row that
 * had an id keeps it; a new row gets the id of the saved term at its place
 * (the saved terms come back in the order of `kept`). A new row whose
 * picture was taken off again has nothing to send.
 * Answers how many images failed: the text is saved either way.
 */
export async function saveImageChanges(kept: Row[], savedTerms: { id: number }[]): Promise<number> {
  const changes = kept.flatMap((row, i) => {
    const termId = row.id ?? savedTerms[i]?.id;
    if (!row.imageChanged || termId === undefined || (row.id === undefined && !row.image)) return [];
    return [{ termId, image: row.image ?? null }];
  });
  const results = await Promise.all(
    changes.map((change) =>
      api.terms[":id"].image.$put({ param: { id: String(change.termId) }, json: { image: change.image } }),
    ),
  );
  return results.filter((res) => !res.ok).length;
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
