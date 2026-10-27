import { useCallback, useEffect, useRef, useState } from "react";
import type { DraftDetail } from "../../worker/ai";
import type { Language } from "../../worker/languages";
import { api } from "./api";

export type DraftCardData = DraftDetail["cards"][number];
/** A card with a key of its own: deleting one must not hand its state to the next. */
export type DraftRow = { uid: number; card: DraftCardData };

/** What the review screen edits. Saved as the user goes. */
export type DraftEdits = {
  rows: DraftRow[];
  title: string;
  termLang: Language | "";
  defLang: Language | "";
  /** The set to save into; null: a new set. Picked early, "More cards" skips its terms too. */
  setId: number | null;
};

/** Typing pauses this long before the edits go out. */
export const SAVE_PAUSE_MS = 500;

let nextUid = 1;

/** The draft's fields as edits; rows keep the keys they had by position, so inputs keep focus. */
function toEdits(draft: DraftDetail, before: DraftEdits | null): DraftEdits {
  return {
    rows: draft.cards.map((card, i) => ({ uid: before?.rows[i]?.uid ?? nextUid++, card })),
    title: draft.title,
    termLang: draft.termLang ?? "",
    defLang: draft.defLang ?? "",
    setId: draft.setId,
  };
}

function patchOf(edits: DraftEdits) {
  return {
    cards: edits.rows.map((row) => row.card),
    title: edits.title,
    termLang: edits.termLang || null,
    defLang: edits.defLang || null,
    setId: edits.setId,
  };
}

/** The server trims what it stores: equal after trimming is what we sent, not news. */
function sameAsSaved(edits: DraftEdits, draft: DraftDetail): boolean {
  const trimmed = (value: ReturnType<typeof patchOf>) =>
    JSON.stringify({
      ...value,
      title: value.title.trim(),
      cards: value.cards.map((card) => ({ ...card, term: card.term.trim(), definition: card.definition.trim() })),
    });
  return trimmed(patchOf(edits)) === trimmed(patchOf(toEdits(draft, null)));
}

/**
 * A draft and the user's edits to it. Edits go out after a pause in typing
 * (`now` for a tap), one PATCH at a time. A reload (the live topic "ai", also
 * the echo of our own PATCH) takes the server's edits only when none of ours
 * are waiting, so a card being typed in is never reset.
 */
export function useDraft(draftId: string) {
  const [draft, setDraft] = useState<DraftDetail | null>(null);
  const [edits, setEdits] = useState<DraftEdits | null>(null);
  const [missing, setMissing] = useState(false);
  /** An edit the server refused: "ai_running" (a run started on another device). */
  const [refused, setRefused] = useState<string | null>(null);
  const latest = useRef<DraftEdits | null>(null);
  const dirty = useRef(false);
  const sending = useRef<Promise<boolean> | null>(null);
  const lastSaved = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  /** Saved or discarded: the live echo of that must not reload a draft that is gone. */
  const closed = useRef(false);

  const load = useCallback(async () => {
    if (closed.current) return;
    return api.ai.drafts[":id"].$get({ param: { id: draftId } }).then(async (res) => {
      if (closed.current) return;
      if (res.status === 404) setMissing(true);
      if (!res.ok) return;
      const next = await res.json();
      setDraft(next);
      // The run that refused an edit is over: its message is too.
      if (next.status !== "running") setRefused(null);
      if (dirty.current || sending.current) return;
      if (latest.current && sameAsSaved(latest.current, next)) return;
      latest.current = toEdits(next, latest.current);
      setEdits(latest.current);
    });
  }, [draftId]);

  /** Sends what is waiting and resolves once the server has it: false when it did not take it. */
  const flush = useCallback(async (): Promise<boolean> => {
    clearTimeout(timer.current);
    while (sending.current) await sending.current;
    if (!dirty.current || !latest.current) return lastSaved.current;
    dirty.current = false;
    const send = api.ai.drafts[":id"]
      .$patch({ param: { id: draftId }, json: patchOf(latest.current) })
      .then(async (res) => {
        if (res.ok) return true;
        if (res.status === 404) setMissing(true);
        else if (res.status === 409) setRefused("ai_running");
        // Offline or a server error: kept, the next edit or the save tries again.
        else dirty.current = true;
        return false;
      });
    sending.current = send;
    lastSaved.current = await send;
    sending.current = null;
    // Refused: the run owns the cards now, show what it has.
    if (!lastSaved.current && !dirty.current) await load();
    return lastSaved.current;
  }, [draftId, load]);

  const edit = useCallback(
    (change: (edits: DraftEdits) => DraftEdits, now = false) => {
      if (!latest.current) return;
      latest.current = change(latest.current);
      setEdits(latest.current);
      setRefused(null);
      dirty.current = true;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), now ? 0 : SAVE_PAUSE_MS);
    },
    [flush],
  );

  /** Drops edits not sent yet: the draft is about to be made anew or deleted. */
  const forget = useCallback(async () => {
    clearTimeout(timer.current);
    dirty.current = false;
    while (sending.current) await sending.current;
  }, []);

  /** The draft was saved or discarded: nothing more to load or send. */
  const close = useCallback(() => {
    closed.current = true;
    clearTimeout(timer.current);
    dirty.current = false;
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  // Leaving the page: what is waiting still goes out.
  useEffect(() => () => void (dirty.current && flush()), [flush]);

  return { draft, edits, missing, refused, load, edit, flush, forget, close };
}
