import { clozeParts } from "../../../worker/cloze";
import { useT } from "../../i18n";

/**
 * A fill-in-the-blank sentence ("Bern is the {{capital}} of Switzerland").
 * Shows a gap, or with `reveal` the hidden part marked in teal.
 *
 *   <ClozeText text="Bern is the {{capital}}." />
 *   <ClozeText text="Bern is the {{capital}}." reveal />
 */
export function ClozeText({ text, reveal = false }: { text: string; reveal?: boolean }) {
  const { t } = useT();
  const parts = clozeParts(text);
  if (!parts) return <>{text}</>;
  return (
    <span>
      {parts.before}
      {reveal ? (
        <span className="rounded-sm bg-teal-wash px-1 font-semibold text-teal-strong">{parts.answer}</span>
      ) : (
        <span className="mx-0.5 inline-block w-[4.5em] border-b-2 border-accent align-baseline">
          <span className="sr-only">{t("study.gap")}</span>
        </span>
      )}
      {parts.after}
    </span>
  );
}
