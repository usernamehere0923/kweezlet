import { useT } from "../../i18n";
import { PageTitle } from "../../ui";
import { Controls } from "./controls";
import { Foundations } from "./foundations";
import { LiveDemo } from "./live";
import { StudyKit } from "./studyKit";

/** /design: every piece of src/ui, live, with the code to copy. Reachable by URL only. */
export function DesignSystemPage() {
  const { t } = useT();
  return (
    <div className="flex flex-col gap-14">
      <PageTitle subtitle={t("design.intro")}>{t("design.title")}</PageTitle>
      <Foundations />
      <Controls />
      <StudyKit />
      <LiveDemo />
    </div>
  );
}
