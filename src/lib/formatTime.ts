/** A duration as m:ss, e.g. 23 seconds -> "0:23" (the Match and Test clocks). */
export function formatTime(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
