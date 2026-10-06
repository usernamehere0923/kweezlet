import { useT } from "../i18n";
import { ButtonLink, EmptyState } from "../ui";

export function NotFoundPage() {
  const { t } = useT();
  return (
    <EmptyState
      icon="warning"
      title={t("notFound.title")}
      text={t("notFound.text")}
      action={
        <ButtonLink to="/" variant="secondary">
          {t("notFound.action")}
        </ButtonLink>
      }
    />
  );
}
