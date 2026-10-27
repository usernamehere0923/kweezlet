import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { LANG_KEY, useT, type TKey } from "../i18n";
import { api } from "../lib/api";
import { kindOptions, languageOptions, type CardKind } from "../lib/choices";
import { aiErrorMessage, aiRefusal } from "../lib/cost";
import { useDraft, type DraftEdits } from "../lib/draft";
import { useLive } from "../lib/live";
import {
  Button,
  ButtonLink,
  Card,
  CostLine,
  DraftCard,
  EmptyState,
  FormError,
  Heading,
  Modal,
  PageLoading,
  PageTitle,
  SegmentedControl,
  Select,
  Spinner,
  Text,
  TermList,
  TextField,
  useToast,
  type Option,
} from "../ui";

type Target = "new" | "existing";

/** A draft holds at most this many cards (worker/ai/pages.ts MAX_DRAFT_CARDS). */
const MAX_DRAFT_CARDS = 500;

/** What the save route's validation answers mean here. */
function saveError(fields: Record<string, TKey>): TKey {
  if (fields.title) return "ai.save.error.title";
  if (fields.setId) return "ai.save.error.pickSet";
  if (fields.cards === "validation.too_small") return "ai.save.error.none";
  if (fields.cards === "validation.too_big") return "ai.save.error.tooMany";
  if (fields.cards) return "ai.save.error.bothSides";
  return "ai.source.error.invalid";
}

/**
 * /create/ai/:draftId: the cards the AI made, to check before they become a
 * set. Keep, edit or delete each one; make more or make them anew; save into a
 * new set or an existing one. Edits save as the user goes, and the draft
 * follows its runs over the live topic "ai", so closing the app is fine.
 */
export function AiDraftPage() {
  const { t, tn } = useT();
  const navigate = useNavigate();
  const toast = useToast();
  const { draftId = "" } = useParams();
  const { draft, edits, missing, refused, load, edit, flush, forget, close } = useDraft(draftId);
  const [target, setTarget] = useState<Target | null>(null);
  const [sets, setSets] = useState<{ id: number; title: string }[]>([]);
  const [busy, setBusy] = useState<"retry" | "regenerate" | "discard" | "save" | "more" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState<"regenerate" | "discard" | null>(null);
  const [kind, setKind] = useState<CardKind>("auto");

  useLive("ai", () => void load());

  const loadSets = useCallback(
    () =>
      api.sets.$get({ query: {} }).then(async (res) => {
        if (res.ok) setSets((await res.json()).map((set) => ({ id: set.id, title: set.title })));
      }),
    [],
  );
  useEffect(() => void loadSets(), [loadSets]);
  useLive("sets", () => void loadSets());

  // Where to save starts where the draft says: a set picked earlier, or a new one.
  const targetNow: Target = target ?? (draft?.setId != null ? "existing" : "new");

  /** A run refused or a route that answered with an AI error: say why. */
  async function explain(res: Response, validation: (fields: Record<string, TKey>) => TKey = saveError) {
    setError(await aiRefusal(t, res, validation));
  }

  /** Makes the cards anew (a failed first run, or Regenerate). Unsent edits are dropped. */
  async function regenerate(as: CardKind, why: "retry" | "regenerate") {
    setBusy(why);
    setError(null);
    await forget();
    const res = await api.ai.drafts[":id"].regenerate.$post({ param: { id: draftId }, json: { kind: as } });
    setAsking(null);
    if (!res.ok) await explain(res);
    setBusy(null);
    await load();
  }

  async function discard() {
    setBusy("discard");
    await forget();
    const res = await api.ai.drafts[":id"].$delete({ param: { id: draftId } });
    setBusy(null);
    if (res.ok || res.status === 404) {
      close();
      navigate("/");
    } else setAsking(null);
  }

  async function more() {
    setBusy("more");
    if (await flush()) navigate(`/create/ai/${draftId}/more`);
    setBusy(null);
  }

  async function save(current: DraftEdits) {
    const kept = current.rows.filter((row) => row.card.checked);
    const check: TKey | null =
      kept.length === 0
        ? "ai.save.error.none"
        : kept.some((row) => !row.card.term.trim() || !row.card.definition.trim())
          ? "ai.save.error.bothSides"
          : targetNow === "new" && !current.title.trim()
            ? "ai.save.error.title"
            : targetNow === "existing" && current.setId === null
              ? "ai.save.error.pickSet"
              : null;
    setError(check && t(check));
    if (check) return;
    setBusy("save");
    // The save takes the cards the server has: every edit goes first.
    if (!(await flush())) {
      setBusy(null);
      return;
    }
    const res = await api.ai.drafts[":id"].save.$post({
      param: { id: draftId },
      json: {
        setId: targetNow === "existing" ? current.setId : null,
        title: current.title,
        termLang: current.termLang || null,
        defLang: current.defLang || null,
      },
    });
    setBusy(null);
    if (res.ok) {
      close();
      toast(tn("ai.save.done", kept.length), "success");
      navigate(`/sets/${(await res.json()).setId}`);
      return;
    }
    if (res.status === 404) {
      await load(); // saved on another device meanwhile: the draft is gone
    } else {
      await explain(res);
    }
  }

  if (missing) {
    return (
      <EmptyState
        title={t("ai.draft.missing")}
        action={<ButtonLink to="/create/ai">{t("ai.source.title")}</ButtonLink>}
      />
    );
  }
  if (!draft || !edits) return <PageLoading />;

  const rows = edits.rows;
  const running = draft.status === "running";
  const kept = rows.filter((row) => row.card.checked).length;
  const unverified = rows.filter((row) => !row.card.verified).length;
  const shownError =
    error ?? (refused && (refused === "running" ? aiErrorMessage(t, "ai_running") : t("ai.draft.editRefused")));

  const languages = languageOptions(t);
  const targets: Option<Target>[] = [
    { value: "new", label: t("ai.save.new") },
    { value: "existing", label: t("ai.save.existing") },
  ];
  const setOptions: Option<string>[] = [
    { value: "", label: t("ai.save.pickSetOption") },
    ...sets.map((set) => ({ value: String(set.id), label: set.title })),
  ];

  // "24 cards · 2 unverified · Vocabulary · English → Deutsch"
  const summary = [tn("ai.draft.cards", rows.length)];
  if (unverified > 0) summary.push(tn("ai.draft.unverifiedCount", unverified));
  if (draft.madeKind) summary.push(t(`ai.kind.${draft.madeKind}`));
  if (edits.termLang && edits.defLang) {
    summary.push(t("ai.draft.languages", { term: t(LANG_KEY[edits.termLang]), def: t(LANG_KEY[edits.defLang]) }));
  }
  // A "More cards" run added to cards that were there: say what it brought.
  const moreResult = draft.status === "ready" && (draft.skipped > 0 || (draft.added > 0 && draft.added < rows.length));

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <PageTitle subtitle={draft.sourceName}>{draft.title || t("ai.draft.title")}</PageTitle>

      {running && (
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <Spinner size={28} />
          <Text>{t("ai.draft.making")}</Text>
          <Text variant="small">{t("ai.draft.makingHint")}</Text>
        </Card>
      )}
      {draft.status === "failed" && (
        <Card className="flex flex-col items-start gap-3">
          <FormError>{aiErrorMessage(t, draft.error)}</FormError>
          {/* Only a run that left no cards is tried again: a retry makes the cards anew,
              and a failed "More cards" keeps the cards the draft already had. */}
          {rows.length === 0 && (
            <Button
              variant="secondary"
              icon="retry"
              loading={busy === "retry"}
              onClick={() => void regenerate(draft.kind, "retry")}
            >
              {t("common.retry")}
            </Button>
          )}
        </Card>
      )}

      {/* While a run goes, the cards there are shown but not edited: the run writes them when it ends. */}
      {running && rows.length > 0 && <TermList terms={rows.map((row) => row.card)} />}

      {!running && (rows.length > 0 || draft.status === "ready") && (
        <div className="flex flex-col gap-1">
          <Text>{summary.join(" · ")}</Text>
          <CostLine nanos={draft.cost.nanos} tokens={draft.cost.tokens} durationMs={draft.cost.durationMs} />
          {moreResult && (
            <Text variant="small">{t("ai.draft.added", { added: draft.added, skipped: draft.skipped })}</Text>
          )}
          {draft.notes && <Text variant="small">{draft.notes}</Text>}
          {rows.length === 0 && <Text>{t("ai.draft.empty")}</Text>}
        </div>
      )}

      {/* A failed first run has its own retry above; More cards and Discard still help. */}
      {!running && (
        <>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon="plus"
              loading={busy === "more"}
              disabled={rows.length >= MAX_DRAFT_CARDS}
              onClick={() => void more()}
            >
              {t("ai.draft.more")}
            </Button>
            {(rows.length > 0 || draft.status === "ready") && (
              <Button
                variant="ghost"
                size="sm"
                icon="retry"
                onClick={() => {
                  setKind(draft.kind);
                  setAsking("regenerate");
                }}
              >
                {t("ai.draft.regenerate")}
              </Button>
            )}
            <Button variant="ghost" size="sm" icon="trash" onClick={() => setAsking("discard")}>
              {t("ai.draft.discard")}
            </Button>
          </div>
          {rows.length >= MAX_DRAFT_CARDS && <Text variant="small">{t("ai.draft.full")}</Text>}
        </>
      )}

      {!running && rows.length > 0 && (
        <>
          <div className="flex flex-col gap-3">
            {rows.map((row, i) => (
              <DraftCard
                key={row.uid}
                index={i}
                term={row.card.term}
                definition={row.card.definition}
                source={row.card.source}
                page={row.card.page}
                verified={row.card.verified}
                checked={row.card.checked}
                onChange={(term, definition) =>
                  edit((now) => ({
                    ...now,
                    rows: now.rows.map((r) =>
                      r.uid === row.uid ? { ...r, card: { ...r.card, term, definition } } : r,
                    ),
                  }))
                }
                onCheck={(checked) =>
                  edit(
                    (now) => ({
                      ...now,
                      rows: now.rows.map((r) => (r.uid === row.uid ? { ...r, card: { ...r.card, checked } } : r)),
                    }),
                    true,
                  )
                }
                onDelete={() => edit((now) => ({ ...now, rows: now.rows.filter((r) => r.uid !== row.uid) }), true)}
              />
            ))}
          </div>

          <Card className="flex flex-col gap-4">
            <Heading level={3}>{t("ai.save.heading")}</Heading>
            <SegmentedControl
              label={t("ai.save.heading")}
              value={targetNow}
              onChange={(next) => {
                setTarget(next);
                // A new set: no set to skip the terms of when making more.
                if (next === "new") edit((now) => ({ ...now, setId: null }), true);
              }}
              options={targets}
            />
            {targetNow === "new" ? (
              <>
                <TextField
                  label={t("sets.fieldTitle")}
                  value={edits.title}
                  onChange={(title) => edit((now) => ({ ...now, title }))}
                  maxLength={200}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Select
                    label={t("sets.langTerms")}
                    value={edits.termLang}
                    onChange={(termLang) => edit((now) => ({ ...now, termLang }), true)}
                    options={languages}
                  />
                  <Select
                    label={t("sets.langDefs")}
                    value={edits.defLang}
                    onChange={(defLang) => edit((now) => ({ ...now, defLang }), true)}
                    options={languages}
                  />
                </div>
              </>
            ) : (
              <Select
                label={t("ai.save.set")}
                hint={t("ai.save.setHint")}
                value={edits.setId === null ? "" : String(edits.setId)}
                onChange={(id) => {
                  // Picked here: stays on "Existing set" even when "Choose a set" clears the pick.
                  setTarget("existing");
                  edit((now) => ({ ...now, setId: id ? Number(id) : null }), true);
                }}
                options={setOptions}
              />
            )}
          </Card>
        </>
      )}

      {/* Also while a run goes: an edit it refused says why it was lost. */}
      {(shownError || (!running && rows.length > 0)) && (
        <div className="flex flex-col items-start gap-2">
          {shownError && <FormError>{shownError}</FormError>}
          {!running && rows.length > 0 && (
            <Button icon="check" loading={busy === "save"} disabled={busy !== null} onClick={() => void save(edits)}>
              {tn("ai.save.button", kept)}
            </Button>
          )}
        </div>
      )}

      <Modal
        open={asking === "regenerate"}
        onClose={() => setAsking(null)}
        title={rows.length > 0 ? tn("ai.draft.regenerateTitle", rows.length) : t("ai.draft.regenerateEmptyTitle")}
        actions={
          <>
            <Button variant="secondary" onClick={() => setAsking(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="danger"
              icon="retry"
              loading={busy === "regenerate"}
              onClick={() => void regenerate(kind, "regenerate")}
            >
              {t("ai.draft.regenerate")}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p>{t(rows.length > 0 ? "ai.draft.regenerateText" : "ai.draft.regenerateEmptyText")}</p>
          <Select label={t("ai.source.kind")} value={kind} onChange={setKind} options={kindOptions(t)} />
        </div>
      </Modal>
      <Modal
        open={asking === "discard"}
        onClose={() => setAsking(null)}
        title={t("ai.draft.discardTitle")}
        actions={
          <>
            <Button variant="secondary" onClick={() => setAsking(null)}>
              {t("common.cancel")}
            </Button>
            <Button variant="danger" icon="trash" loading={busy === "discard"} onClick={() => void discard()}>
              {t("ai.draft.discard")}
            </Button>
          </>
        }
      >
        {t("ai.draft.discardText")}
      </Modal>
    </div>
  );
}
