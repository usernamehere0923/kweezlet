import { costNanos, MODEL, NO_USAGE, type Usage } from "./prices";

/** The z.ai chat endpoint (Bearer auth, OpenAI-style body). */
export const ZAI_URL = "https://api.z.ai/api/paas/v4/chat/completions";

/** Thinking is always on for GLM-5.3-Flash: 20-60 s is normal, 120 s is the ceiling. */
export const ZAI_TIMEOUT_MS = 120_000;

/** One message content part: text, a page image, or a whole file (Office). */
export type ZaiPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "file"; file: { file_data: string; filename: string } };

export type ZaiMessage = { role: "system" | "user" | "assistant"; content: string | ZaiPart[] };

/**
 * Why a call failed, as a code the UI translates ("AI is busy, try again in a
 * minute" and friends). Also the `error` column of a failed draft.
 * - ai_busy: rate limit or overload, the same call works in a minute.
 * - ai_quota: the z.ai account is out of credit or over its plan's limit:
 *   retrying is useless until someone tops it up.
 * - ai_key: the key is missing, wrong or not allowed.
 * - ai_input: z.ai refused the material (too big, flagged, bad request).
 * - ai_cut_off: the answer hit the output limit: too much for one run, and a
 *   repair retry would be cut off the same way.
 * - ai_server: anything else on z.ai's side, or no answer at all.
 */
export type ZaiErrorKind = "ai_busy" | "ai_quota" | "ai_key" | "ai_input" | "ai_cut_off" | "ai_server";

/**
 * A failed call. Carries what it cost: z.ai may bill a call whose answer we
 * reject. The message is for the worker log only: it can quote z.ai's answer,
 * so only `kind` ever goes to the UI or the database.
 */
export class ZaiError extends Error {
  constructor(
    readonly kind: ZaiErrorKind,
    message: string,
    readonly usage: Usage = NO_USAGE,
    readonly costNanos: number = 0,
    readonly durationMs: number = 0,
  ) {
    super(message);
    this.name = "ZaiError";
  }
}

export type ZaiCall = {
  messages: ZaiMessage[];
  /** Output bound: one run's cost has a ceiling (60 cards plus thinking). */
  maxTokens: number;
};

export type ZaiResult = {
  /** The answer text, `message.content` only: never the thinking in `reasoning_content`. */
  content: string;
  usage: Usage;
  costNanos: number;
  durationMs: number;
};

/** One call to z.ai. Throws ZaiError on every failure, with the cost so far. */
export async function callZai(apiKey: string | undefined, call: ZaiCall): Promise<ZaiResult> {
  if (!apiKey) throw new ZaiError("ai_key", "ZAI_API_KEY is not set");
  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(ZAI_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, messages: call.messages, stream: false, max_tokens: call.maxTokens }),
      signal: AbortSignal.timeout(ZAI_TIMEOUT_MS),
    });
  } catch (err) {
    // Timeout or network: z.ai may still have billed the call, but we saw no usage.
    throw new ZaiError("ai_server", `z.ai request failed: ${String(err)}`, NO_USAGE, 0, Date.now() - started);
  }
  const durationMs = Date.now() - started;
  const body = (await res.json().catch(() => null)) as ZaiBody | null;
  const usage = parseUsage(body?.usage);
  const cost = costNanos(MODEL, usage);
  if (!res.ok) {
    throw new ZaiError(
      kindFor(res.status, body?.error?.code),
      zaiMessage(body) ?? `z.ai answered ${res.status}`,
      usage,
      cost,
      durationMs,
    );
  }
  const choice = body?.choices?.[0];
  const finished = finishKind(choice?.finish_reason);
  if (finished) {
    throw new ZaiError(finished, `z.ai stopped: ${String(choice?.finish_reason)}`, usage, cost, durationMs);
  }
  const content = choice?.message?.content;
  if (typeof content !== "string" || content.length === 0) {
    throw new ZaiError("ai_server", "z.ai answer had no content", usage, cost, durationMs);
  }
  return { content, usage, costNanos: cost, durationMs };
}

type ZaiBody = {
  choices?: { message?: { content?: unknown }; finish_reason?: unknown }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  };
  error?: { code?: number | string; message?: string };
};

function parseUsage(usage: ZaiBody["usage"]): Usage {
  return {
    promptTokens: usage?.prompt_tokens ?? 0,
    cachedTokens: usage?.prompt_tokens_details?.cached_tokens ?? 0,
    completionTokens: usage?.completion_tokens ?? 0,
  };
}

function zaiMessage(body: ZaiBody | null): string | undefined {
  return body?.error?.message;
}

/**
 * The HTTP status alone is not enough: z.ai answers 429 both for "busy"
 * (1302 rate limit, 1305 overloaded) and for "out of credit" (1113, and the
 * plan limits 1308-1321). Its business code (docs.z.ai/api-reference/api-code)
 * tells them apart; it comes as a string or a number.
 */
function kindFor(status: number, code: unknown): ZaiErrorKind {
  const n = Number(code);
  if (n === 1113 || (n >= 1308 && n <= 1321)) return "ai_quota";
  if (n === 1302 || n === 1305 || status === 429) return "ai_busy";
  if (status === 401 || status === 403) return "ai_key";
  if (status === 400 || status === 413 || status === 422) return "ai_input";
  return "ai_server";
}

/** A finished answer that is not a whole one: cut off, or withheld by z.ai's filter. */
function finishKind(reason: unknown): ZaiErrorKind | null {
  if (reason === "length") return "ai_cut_off";
  if (reason === "sensitive") return "ai_input";
  if (reason === "network_error") return "ai_server";
  return null;
}
