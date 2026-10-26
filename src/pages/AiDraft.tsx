import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router";
import type { DraftDetail } from "../../worker/ai";
import { useT } from "../i18n";
import { api, offline } from "../lib/api";
import { aiErrorMessage } from "../lib/cost";
import { useLive } from "../lib/live";
import {
  Button,
  ButtonLink,
  Card,
  CostLine,
  EmptyState,
  FormError,
  PageLoading,
  PageTitle,
  Spinner,
  Text,
  TermList,
} from "../ui";

/**
 * /create/ai/:draftId: a draft while its cards are made, and once they are
 * there. It follows the run over the live topic "ai", so closing the app
 * meanwhile is fine. (Editing and saving the cards: the review screen, next.)
 */
export function AiDraftPage() {
  const { t, tn } = useT();
  const { draftId = "" } = useParams();
  const [draft, setDraft] = useState<DraftDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      api.ai.drafts[":id"].$get({ param: { id: draftId } }).then(async (res) => {
        if (res.ok) setDraft(await res.json());
        else if (res.status === 404) setMissing(true);
      }),
    [draftId],
  );

  useEffect(() => {
    void load();
  }, [load]);
  useLive("ai", () => void load());

  /** A failed first run, again. Refused (budget, a run going): say why. */
  async function retry() {
    if (!draft) return;
    setRetrying(true);
    setRetryError(null);
    const res = await api.ai.drafts[":id"].regenerate.$post({ param: { id: draftId }, json: { kind: draft.kind } });
    if (!res.ok && !offline(res) && res.status < 500) {
      const body = (await res.json().catch(() => ({}))) as { error?: string; capNanos?: number };
      setRetryError(aiErrorMessage(t, body.error ?? null, body.capNanos));
    }
    setRetrying(false);
    await load();
  }

  if (missing) {
    return (
      <EmptyState
        title={t("ai.draft.missing")}
        action={<ButtonLink to="/create/ai">{t("ai.source.title")}</ButtonLink>}
      />
    );
  }
  if (!draft) return <PageLoading />;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <PageTitle subtitle={draft.sourceName}>{draft.title || t("ai.draft.title")}</PageTitle>
      {draft.status === "running" && (
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
          {draft.cards.length === 0 && (
            <Button variant="secondary" icon="retry" loading={retrying} onClick={() => void retry()}>
              {t("common.retry")}
            </Button>
          )}
          {retryError && <FormError>{retryError}</FormError>}
        </Card>
      )}
      {draft.status === "failed" && draft.cards.length > 0 && <TermList terms={draft.cards} />}
      {draft.status === "ready" && (
        <>
          <div className="flex flex-col gap-1">
            <Text>{tn("ai.draft.ready", draft.cards.length)}</Text>
            <CostLine nanos={draft.cost.nanos} tokens={draft.cost.tokens} durationMs={draft.cost.durationMs} />
            {draft.notes && <Text variant="small">{draft.notes}</Text>}
          </div>
          <TermList terms={draft.cards} />
        </>
      )}
    </div>
  );
}
