import type { ZaiErrorKind } from "../../worker/ai/zai";
import type { TKey } from "../i18n";

/**
 * What the AI cost, in dollars, rounded UP to the cent: $0.004 shows "$0.01",
 * exactly 0 shows "$0.00". The API counts in nanodollars (1e-9 USD).
 */
export function formatCost(nanos: number): string {
  return `$${(Math.ceil(nanos / 1e7) / 100).toFixed(2)}`;
}

/** Every error an AI route can answer, besides validation and not_found. */
export type AiErrorCode = ZaiErrorKind | "ai_cap" | "ai_running";

const AI_ERRORS: Record<AiErrorCode, TKey> = {
  ai_busy: "ai.error.busy",
  ai_quota: "ai.error.quota",
  ai_key: "ai.error.key",
  ai_input: "ai.error.input",
  ai_cut_off: "ai.error.cutOff",
  ai_server: "ai.error.server",
  ai_cap: "ai.error.cap",
  ai_running: "ai.error.running",
};

/**
 * The message for an AI error code: a failed draft's `error`, or an API
 * answer. The 402 answer carries the cap; pass it and the message names the
 * amount (a failed draft never has ai_cap: the cap is checked before a run).
 *
 *   aiErrorMessage(t, draft.error)
 *   aiErrorMessage(t, body.error, body.capNanos)
 */
export function aiErrorMessage(
  t: (key: TKey, vars?: Record<string, string>) => string,
  code: string | null,
  capNanos?: number,
) {
  if (code === "ai_cap") {
    return capNanos === undefined ? t("ai.error.capReached") : t("ai.error.cap", { cap: formatCost(capNanos) });
  }
  return t(AI_ERRORS[code as AiErrorCode] ?? "ai.error.server");
}
