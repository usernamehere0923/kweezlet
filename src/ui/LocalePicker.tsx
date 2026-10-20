import { useMemo } from "react";
import { LOCALES, useT, type Locale } from "../i18n";
import { SegmentedControl } from "./SegmentedControl";

/** Picks the app language; each one is named in its own language. */
export function LocalePicker({
  label,
  value,
  onChange,
  size,
}: {
  /** For screen readers. */
  label: string;
  value: Locale;
  onChange: (locale: Locale) => void;
  size?: "sm" | "md";
}) {
  const { t } = useT();
  // Stable between renders: SegmentedControl re-measures when its options change.
  const options = useMemo(() => LOCALES.map((locale) => ({ value: locale, label: t(`locale.${locale}`) })), [t]);
  return <SegmentedControl<Locale> label={label} value={value} onChange={onChange} size={size} options={options} />;
}
