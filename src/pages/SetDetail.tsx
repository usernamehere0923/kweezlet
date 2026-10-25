import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { termProgress } from "../../worker/progress";
import { useT } from "../i18n";
import { api } from "../lib/api";
import { MIN_MATCH_TERMS } from "../lib/quiz";
import { useStudySet } from "../lib/studySet";
import { formatTime } from "../lib/formatTime";
import {
  Button,
  ButtonLink,
  EmptyState,
  Heading,
  Modal,
  PageTitle,
  PageLoadFailed,
  PageLoading,
  ProgressBar,
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
  const [missing, setMissing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // Marks and answers on another device move the progress bar and the dots.
  // A set that is gone says so here instead of leaving.
  const { set, images, failed, retry } = useStudySet(id, ["sets", "match", "study"], {
    onLoad: () => setMissing(false),
    onMissing: () => setMissing(true),
  });

  async function remove() {
    setConfirming(false);
    // Not deleted (api.ts shows why): the set stays.
    const res = await api.sets[":id"].$delete({ param: { id } });
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
            {t("common.backHome")}
          </ButtonLink>
        }
      />
    );
  }
  if (failed) {
    return <PageLoadFailed title={t("sets.loadFailed")} onRetry={retry} />;
  }
  if (!set) {
    return <PageLoading />;
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

      {set.termCount > 0 && (
        <section className="mb-8">
          <ProgressBar value={set.knownCount} learning={set.learningCount} max={set.termCount} />
        </section>
      )}

      <section className="mb-8">
        <Heading className="mb-3">{t("sets.study")}</Heading>
        <div className="grid gap-3 sm:grid-cols-2">
          <StudyModeTile mode="flashcards" onClick={() => navigate(`/sets/${id}/flashcards`)} />
          <StudyModeTile mode="learn" onClick={() => navigate(`/sets/${id}/learn`)} />
          <StudyModeTile mode="test" onClick={() => navigate(`/sets/${id}/test`)} />
          <StudyModeTile
            mode="match"
            onClick={() => navigate(`/sets/${id}/match`)}
            disabled={set.termCount < MIN_MATCH_TERMS}
            hint={
              set.termCount < MIN_MATCH_TERMS
                ? t("match.tooFewTitle")
                : set.bestSeconds !== null
                  ? t("match.bestTime", { time: formatTime(set.bestSeconds) })
                  : undefined
            }
          />
        </div>
      </section>

      <section>
        <Heading className="mb-1">{t("sets.termsHeading")}</Heading>
        <Text variant="small" className="mb-3">
          {tn("study.terms", set.termCount)}
        </Text>
        <TermList
          terms={set.terms.map((term) => ({ ...term, progress: termProgress(term), image: images[term.id] }))}
          speak={{ termLang: set.termLang, defLang: set.defLang }}
        />
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
