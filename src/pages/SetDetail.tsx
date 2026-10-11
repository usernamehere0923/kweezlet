import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import type { SetDetail as SetDetailData } from "../../worker/sets";
import { useT } from "../i18n";
import { api } from "../lib/api";
import { useLive } from "../lib/live";
import {
  Button,
  ButtonLink,
  EmptyState,
  Heading,
  Modal,
  PageTitle,
  Spinner,
  StudyModeTile,
  TermList,
  Text,
  useToast,
} from "../ui";

export function SetDetailPage() {
  const { t, tn } = useT();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [set, setSet] = useState<SetDetailData | null>(null);
  const [missing, setMissing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const reload = useCallback(
    () =>
      api.sets[":id"].$get({ param: { id } }).then(async (res) => {
        if (res.ok) {
          setSet(await res.json());
          setMissing(false);
        } else if (res.status === 404) {
          setMissing(true);
        }
      }),
    [id],
  );

  useEffect(() => void reload(), [reload]);
  useLive("sets", () => void reload());

  async function remove() {
    const res = await api.sets[":id"].$delete({ param: { id } });
    setConfirming(false);
    if (res.ok) {
      toast(t("sets.deleted"), "success");
      navigate("/");
    }
  }

  if (missing) {
    return (
      <EmptyState
        icon="warning"
        title={t("notFound.title")}
        text={t("notFound.text")}
        action={
          <ButtonLink to="/" icon="chevronLeft">
            {t("notFound.action")}
          </ButtonLink>
        }
      />
    );
  }
  if (!set) {
    return (
      <div className="flex justify-center py-16 text-muted">
        <Spinner size={28} label={t("common.loading")} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <ButtonLink to="/" variant="ghost" icon="chevronLeft" className="-ml-3 mb-4">
        {t("sets.back")}
      </ButtonLink>
      <PageTitle subtitle={set.description || undefined}>{set.title}</PageTitle>

      <div className="mb-8 flex flex-wrap items-center gap-2">
        <ButtonLink to={`/sets/${id}/edit`} variant="secondary" icon="edit">
          {t("sets.edit")}
        </ButtonLink>
        <Button variant="ghost" icon="trash" onClick={() => setConfirming(true)}>
          {t("sets.delete")}
        </Button>
      </div>

      <section className="mb-8">
        <Heading className="mb-3">{t("sets.study")}</Heading>
        <div className="grid gap-3 sm:grid-cols-2">
          <StudyModeTile mode="flashcards" onClick={() => navigate(`/sets/${id}/flashcards`)} />
        </div>
      </section>

      <section>
        <Heading className="mb-1">{t("sets.termsHeading")}</Heading>
        <Text variant="small" className="mb-3">
          {tn("study.terms", set.termCount)}
        </Text>
        <TermList terms={set.terms} />
      </section>

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title={t("sets.deleteTitle")}
        actions={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="danger" icon="trash" onClick={() => void remove()}>
              {t("common.delete")}
            </Button>
          </>
        }
      >
        {t("sets.deleteText")}
      </Modal>
    </div>
  );
}
