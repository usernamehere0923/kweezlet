import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import type { SetSummary } from "../../worker/sets";
import { useT } from "../i18n";
import { api } from "../lib/api";
import { useLive } from "../lib/live";
import { useUser } from "../lib/session";
import { ButtonLink, EmptyState, PageTitle, SearchField, Spinner, StudySetCard } from "../ui";

export function HomePage() {
  const { t } = useT();
  const user = useUser();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [sets, setSets] = useState<SetSummary[] | null>(null);
  const request = useRef(0);

  const reload = useCallback(() => {
    const mine = ++request.current;
    return api.sets.$get({ query: q ? { q } : {} }).then(async (res) => {
      // An older answer must not overwrite a newer one (fast typing).
      if (res.ok && mine === request.current) setSets(await res.json());
    });
  }, [q]);

  useEffect(() => void reload(), [reload]);
  useLive("sets", () => void reload());

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle subtitle={t("app.tagline")}>{t("home.greeting", { name: user.username })}</PageTitle>

      {sets === null ? (
        <div className="flex justify-center py-16 text-muted">
          <Spinner size={28} label={t("common.loading")} />
        </div>
      ) : sets.length === 0 && q ? (
        <>
          <SearchField
            value={q}
            onChange={setQ}
            label={t("sets.searchLabel")}
            placeholder={t("search.placeholder")}
            clearLabel={t("common.clear")}
            className="mb-6"
          />
          <EmptyState
            icon="search"
            title={t("sets.noResults")}
            text={t("sets.noResultsText")}
            action={
              <ButtonLink to="/sets/new" icon="plus">
                {t("sets.new")}
              </ButtonLink>
            }
          />
        </>
      ) : sets.length === 0 ? (
        <EmptyState
          icon="folderPlus"
          title={t("sets.emptyTitle")}
          text={t("sets.emptyText")}
          action={
            <ButtonLink to="/sets/new" icon="plus">
              {t("sets.emptyAction")}
            </ButtonLink>
          }
        />
      ) : (
        <>
          <div className="mb-6 flex items-center gap-2">
            <SearchField
              value={q}
              onChange={setQ}
              label={t("sets.searchLabel")}
              placeholder={t("search.placeholder")}
              clearLabel={t("common.clear")}
              className="flex-1"
            />
            <ButtonLink to="/sets/new" icon="plus">
              {t("sets.new")}
            </ButtonLink>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {sets.map((set) => (
              <StudySetCard
                key={set.id}
                title={set.title}
                termCount={set.termCount}
                onClick={() => navigate(`/sets/${set.id}`)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
