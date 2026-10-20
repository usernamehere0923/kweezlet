import { Component, type ReactNode } from "react";
import { useT } from "../i18n";
import { Button } from "./Button";
import { EmptyState } from "./surfaces";

function CrashScreen() {
  const { t } = useT();
  return (
    <div className="mx-auto max-w-md px-4 py-20">
      <EmptyState
        icon="warning"
        title={t("errors.crashTitle")}
        text={t("errors.crashText")}
        action={
          <Button icon="retry" onClick={() => location.reload()}>
            {t("errors.reload")}
          </Button>
        }
      />
    </div>
  );
}

/** Catches a crash in a page and shows a friendly screen instead of a blank one. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { crashed: boolean }> {
  state = { crashed: false };
  static getDerivedStateFromError() {
    return { crashed: true };
  }
  componentDidCatch(error: unknown) {
    console.error(error);
  }
  render() {
    return this.state.crashed ? <CrashScreen /> : this.props.children;
  }
}
