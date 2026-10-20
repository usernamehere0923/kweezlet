import type { ReactNode } from "react";
import { useT } from "../i18n";
import { Button } from "./Button";
import { EmptyState } from "./surfaces";

/**
 * A page's content when its first load failed (no connection, server error):
 * says so and offers to load again, instead of spinning forever.
 */
export function PageLoadFailed({ title, onRetry }: { title: ReactNode; onRetry: () => void }) {
  const { t } = useT();
  return (
    <EmptyState
      icon="warning"
      title={title}
      action={
        <Button icon="retry" onClick={onRetry}>
          {t("common.retry")}
        </Button>
      }
    />
  );
}
