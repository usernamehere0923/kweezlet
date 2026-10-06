import { useT } from "../i18n";
import { useUser } from "../lib/session";
import { ButtonLink, EmptyState, PageTitle } from "../ui";

export function HomePage() {
  const { t } = useT();
  const user = useUser();
  return (
    <>
      <PageTitle subtitle={t("app.tagline")}>{t("home.greeting", { name: user.username })}</PageTitle>
      <EmptyState
        icon="bulb"
        title={t("home.emptyTitle")}
        text={t("home.emptyText")}
        action={
          <ButtonLink to="/design" icon="feather">
            {t("home.emptyAction")}
          </ButtonLink>
        }
      />
    </>
  );
}
