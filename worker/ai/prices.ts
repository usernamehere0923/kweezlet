// No imports outside worker/ai: this file is pure numbers.
/**
 * What the AI costs, in nanodollars (1e-9 USD) per token: exact integers, no
 * floating point. z.ai GLM-5.3-Flash is $0.15 per 1M input tokens, $0.03 per 1M
 * cached input tokens and $0.50 per 1M output tokens (docs.z.ai pricing).
 */
export const MODEL = "glm-5.3-flash";

export type Prices = {
  /** Nanodollars per input token that is not served from cache. */
  input: number;
  /** Nanodollars per cached input token (part of promptTokens, billed cheaper). */
  cached: number;
  /** Nanodollars per output token. Thinking tokens are billed as output. */
  output: number;
};

export const PRICES: Record<string, Prices> = {
  "glm-5.3-flash": { input: 150, cached: 30, output: 500 },
};

/** Token counts of one z.ai call, from the `usage` block of its answer. */
export type Usage = {
  promptTokens: number;
  cachedTokens: number;
  completionTokens: number;
};

export const NO_USAGE: Usage = { promptTokens: 0, cachedTokens: 0, completionTokens: 0 };

/** Adds two usage counts (a run is several calls: create plus a repair retry). */
export function addUsage(a: Usage, b: Usage): Usage {
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    cachedTokens: a.cachedTokens + b.cachedTokens,
    completionTokens: a.completionTokens + b.completionTokens,
  };
}

/** What one call costs in nanodollars, counted exactly. */
export function costNanos(model: string, usage: Usage): number {
  const prices = PRICES[model] ?? PRICES[MODEL]!;
  const fresh = Math.max(0, usage.promptTokens - usage.cachedTokens);
  return fresh * prices.input + usage.cachedTokens * prices.cached + usage.completionTokens * prices.output;
}
