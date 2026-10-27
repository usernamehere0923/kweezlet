import { useCallback, useEffect, useRef, useState } from "react";
import type { DraftDetail } from "../../worker/ai";
import type { Language } from "../../worker/languages";
import type { TKey } from "../i18n";
import { api, fieldErrors } from "./api";

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

/** Why the server did not take an edit: a run started elsewhere, or the edit itself was refused. */
export type EditRefused = "running" | "invalid";

/** What a draft is called before it has a title: its file, or "Pasted text" for pasted text. */
export function sourceLabel(t: (key: TKey) => string, sourceName: string): string {
  return sourceName === "pasted" || !sourceName ? t("ai.draft.pasted") : sourceName;
}

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

/**
 * Only what changed against what the server has: a title keystroke does not
 * send 500 cards. The cards go when `rows` is a new array (every card edit
 * makes one).
 */
function patchOf(edits: DraftEdits, saved: DraftEdits | null) {
  return {
    ...(edits.rows !== saved?.rows && { cards: edits.rows.map((row) => row.card) }),
    ...(edits.title !== saved?.title && { title: edits.title }),
    ...(edits.termLang !== saved?.termLang && { termLang: edits.termLang || null }),
    ...(edits.defLang !== saved?.defLang && { defLang: edits.defLang || null }),
    ...(edits.setId !== saved?.setId && { setId: edits.setId }),
  };
}

/** The server trims what it stores: equal after trimming is what we sent, not news. */
function sameAsSaved(edits: DraftEdits, draft: DraftDetail): boolean {
  const trimmed = (value: DraftEdits) =>
    JSON.stringify({
      ...value,
      title: value.title.trim(),
      rows: value.rows.map(({ card }) => ({ ...card, term: card.term.trim(), definition: card.definition.trim() })),
    });
  return trimmed(edits) === trimmed(toEdits(draft, null));
}

/**
 * A draft and the user's edits to it. Edits go out after a pause in typing
 * (`now` for a tap), one PATCH at a time. A reload (the live topic "ai", also
 * the echo of our own PATCH) takes the server's edits only when none of ours
 * are waiting or were sent since it started, so a card being typed in is
 * never reset.
 */
export function useDraft(draftId: string) {
  const [draft, setDraft] = useState<DraftDetail | null>(null);
  const [edits, setEdits] = useState<DraftEdits | null>(null);
  const [missing, setMissing] = useState(false);
  const [refused, setRefused] = useState<EditRefused | null>(null);
  const latest = useRef<DraftEdits | null>(null);
  /** The edits the server has: a PATCH sends only what differs. */
  const saved = useRef<DraftEdits | null>(null);
  const dirty = useRef(false);
  const sending = useRef<Promise<unknown> | null>(null);
  /** Counts PATCHes sent: a reload started before one must not undo it. */
  const patches = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  /** Saved or discarded: the live echo of that must not reload a draft that is gone. */
  const closed = useRef(false);

  const load = useCallback(async () => {
    if (closed.current) return;
    const before = patches.current;
    return api.ai.drafts[":id"].$get({ param: { id: draftId } }).then(async (res) => {
      if (closed.current) return;
      if (res.status === 404) setMissing(true);
      if (!res.ok) return;
      const next = await res.json();
      setDraft(next);
      // The run that refused an edit is over: its message is too.
      if (next.status !== "running") setRefused((now) => (now === "running" ? null : now));
      if (dirty.current || sending.current || patches.current !== before) return;
      if (latest.current && sameAsSaved(latest.current, next)) return;
      latest.current = toEdits(next, latest.current);
      saved.current = latest.current;
      setEdits(latest.current);
    });
  }, [draftId]);

  /** Sends what is waiting and resolves once the server has it: false when it did not take it. */
  const flush = useCallback(async (): Promise<boolean> => {
    clearTimeout(timer.current);
    // Again after a retry (the picked set was gone).
    for (;;) {
      while (sending.current) await sending.current;
      if (!dirty.current || !latest.current) return true;
      dirty.current = false;
      const sent = latest.current;
      patches.current++;
      const send = api.ai.drafts[":id"]
        .$patch({ param: { id: draftId }, json: patchOf(sent, saved.current) })
        .then(async (res): Promise<"ok" | "retry" | "refused" | "kept"> => {
          if (res.ok) {
            saved.current = sent;
            return "ok";
          }
          if (res.status === 404) {
            setMissing(true);
            return "refused";
          }
          if (res.status === 409) {
            setRefused("running");
            return "refused";
          }
          if (res.status === 400 && (await fieldErrors(res)).setId) {
            // The set picked to save into was deleted meanwhile: back to a new set.
            latest.current = { ...latest.current!, setId: null };
            setEdits(latest.current);
            dirty.current = true;
            return "retry";
          }
          if (res.status === 400) {
            setRefused("invalid");
            return "refused";
          }
          // Offline or a server error: kept, the next edit or the save tries again.
          dirty.current = true;
          return "kept";
        });
      sending.current = send;
      const outcome = await send;
      sending.current = null;
      if (outcome === "retry") continue;
      // Refused: what the server has is what counts now (a run owns the cards).
      if (outcome === "refused") await load();
      return outcome === "ok";
    }
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
