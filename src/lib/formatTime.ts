/** A duration as m:ss, e.g. 23 seconds -> "0:23" (the Match and Test clocks). */
export function formatTime(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** The locale-bound number formatter of useT(). */
export type FormatNumber = (n: number, options?: Intl.NumberFormatOptions) => string;

/**
 * Study time as the dashboard shows it: "45s", "12m", "2h 5m". Built from the
 * locale's own unit words ("2 Std. 5 Min." in Swiss German) via the number
 * formatter, so no text of its own has to live in the dictionaries.
 */
export function formatDuration(seconds: number, formatNumber: FormatNumber): string {
  const unit = (value: number, which: "second" | "minute" | "hour") =>
    formatNumber(value, { style: "unit", unit: which, unitDisplay: "narrow" });
  const minutes = Math.floor(seconds / 60);
  if (seconds < 60) return unit(seconds, "second");
  if (minutes < 60) return unit(minutes, "minute");
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${unit(hours, "hour")} ${unit(rest, "minute")}` : unit(hours, "hour");
}
