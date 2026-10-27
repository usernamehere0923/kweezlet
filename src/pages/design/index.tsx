import { useSearchParams } from "react-router";
import { isTheme } from "../../../worker/themes";
import { useT } from "../../i18n";
import { useTheme } from "../../lib/theme";
import { PageTitle, ThemePicker } from "../../ui";
import { AiKit } from "./aiKit";
import { Controls } from "./controls";
import { Foundations } from "./foundations";
import { Section } from "./layout";
import { LiveDemo } from "./live";
import { StudyKit } from "./studyKit";

/**
 * /design: every piece of src/ui, live, with the code to copy. Reachable by URL only.
 * The picker shows it all in any theme without touching the account's own:
 * /design?theme=kung-fu opens straight in one (handy for a new theme's screenshots).
 */
export function DesignSystemPage() {
  const { t } = useT();
  const { theme } = useTheme();
  const [params, setParams] = useSearchParams();
  const asked = params.get("theme");
  const preview = isTheme(asked) ? asked : theme;
  return (
    <div className="flex flex-col gap-14">
      <PageTitle subtitle={t("design.intro")}>{t("design.title")}</PageTitle>
      <Section
        title="ThemePicker · preview this page in a theme"
        code={`<ThemePicker label={t("settings.theme")} value={theme} onChange={pick} />
<div data-theme="kung-fu">…</div>   // everything inside takes that theme's tokens`}
      >
        <ThemePicker
          label={t("settings.theme")}
          value={preview}
          onChange={(next) => setParams({ theme: next }, { replace: true })}
        />
      </Section>
      {/* key: the colour swatches read their values on mount. */}
      <div
        key={preview}
        data-theme={preview}
        className="-mx-4 flex flex-col gap-14 rounded-ui-xl bg-bg px-4 py-6 font-body text-ink md:-mx-6 md:px-6"
      >
        <Foundations />
        <Controls />
        <StudyKit />
        <AiKit />
        <LiveDemo />
      </div>
    </div>
  );
}
