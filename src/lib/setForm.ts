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

/** At most this many terms in a set, and characters on one side of a term (as in worker/sets.ts). */
export const MAX_TERMS = 500;
export const MAX_SIDE = 1000;

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
    /** Imported rows go after the filled ones; rows still completely empty make room. */
    append: (more: Row[]) =>
      setRawRows((list) => [
        ...list.filter((row) => row.term.trim() || row.definition.trim() || row.image),
        ...more.map(withUid),
      ]),
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
  // The server's limits (worker/sets.ts), caught here so a big import says so at once.
  if (kept.length > MAX_TERMS) return { kept, titleError: null, formError: "sets.termsTooMany" };
  if (kept.some((row) => row.term.trim().length > MAX_SIDE || row.definition.trim().length > MAX_SIDE)) {
    return { kept, titleError: null, formError: "sets.termTooLong" };
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

/** What splits a term from its definition in a pasted list; "auto" picks one for the whole text. */
export type PasteBetween = "auto" | "tab" | "comma" | "dash";
/** What splits one term from the next in a pasted list. */
export type PasteRows = "newline" | "semicolon";

const DASH = / [-–—] /;

/** The quote marks of a field that is fully quoted ("a, b" → a, b; "" → "). */
function unquote(field: string): string {
  const trimmed = field.trim();
  return trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')
    ? trimmed.slice(1, -1).replaceAll('""', '"').trim()
    : trimmed;
}

/** Where the first separator outside quotes starts, and how long it is; null when there is none. */
function firstSeparator(line: string, between: Exclude<PasteBetween, "auto">): [number, number] | null {
  if (between === "dash") {
    const match = DASH.exec(line);
    return match ? [match.index, match[0].length] : null;
  }
  const separator = between === "tab" ? "\t" : ",";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') quoted = !quoted;
    else if (!quoted && line[i] === separator) return [i, 1];
  }
  return null;
}

/**
 * Terms from a pasted list (a Quizlet or Anki export, a spreadsheet column
 * pair, typed notes). One term per line (or per semicolon), the first
 * separator splits term from definition; fields in quotes may hold the
 * separator. Lines without one, or with an empty side, are counted as skipped.
 */
export function parsePastedTerms(
  text: string,
  between: PasteBetween = "auto",
  rows: PasteRows = "newline",
): { terms: Row[]; skipped: number } {
  const lines = text
    .split(rows === "newline" ? /\r?\n/ : ";")
    .map((line) => line.trim())
    .filter(Boolean);
  const split =
    between !== "auto"
      ? between
      : lines.some((line) => line.includes("\t"))
        ? "tab"
        : lines.some((line) => DASH.test(line))
          ? "dash"
          : "comma";
  const terms: Row[] = [];
  let skipped = 0;
  for (const line of lines) {
    const at = firstSeparator(line, split);
    const term = at ? unquote(line.slice(0, at[0])) : "";
    const definition = at ? unquote(line.slice(at[0] + at[1])) : "";
    if (term && definition) terms.push({ term, definition });
    else skipped++;
  }
  return { terms, skipped };
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
