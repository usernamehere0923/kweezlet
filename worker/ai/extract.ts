import { z } from "zod";
import { LANGUAGES } from "../languages";

/**
 * The card the AI returns. `verified` and `page` are filled in after the run by
 * the quote check (worker/ai/verify.ts) and kept in the draft's cards_json;
 * editing a card's text later does not change them.
 */
export const cardSchema = z.object({
  term: z.string().trim().min(1).max(1000),
  definition: z.string().trim().min(1).max(1000),
  /** A quote from the material, max 200 chars, "" when the model could not quote. */
  source: z.string().trim().max(200).default(""),
  /** The page the quote is on, null when unknown. */
  page: z.number().int().positive().nullable().default(null),
});

export const langSchema = z.enum(LANGUAGES);

/** The whole answer of one run, exactly the output format of the system prompt. */
export const resultSchema = z.object({
  kind: z.enum(["vocabulary", "questions", "terms"]),
  // Lenient on purpose: a missing title is not worth a repair retry, the user
  // titles the set themselves. Cards are the part that must be right.
  title: z.string().trim().max(60).default(""),
  term_lang: langSchema.nullable().default(null),
  def_lang: langSchema.nullable().default(null),
  cards: z.array(cardSchema).max(60),
  /** Why there are fewer cards than asked, or none. */
  notes: z.string().max(2000).default(""),
});

export type AiCard = z.infer<typeof cardSchema>;
export type AiCardResult = z.infer<typeof resultSchema>;

/** Why an answer was unreadable. Its message goes into the repair retry. */
export class ExtractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractError";
  }
}

/**
 * Pulls the JSON object out of an answer that wraps it: code fences, a line of
 * prose before or after. The model is asked for "JSON only" but not trusted.
 */
export function extractJsonObject(text: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = fenced?.[1] ?? text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  return start >= 0 && end > start ? body.slice(start, end + 1) : body.trim();
}

/** Parses and validates one answer. Throws ExtractError with what was wrong. */
export function parseResult(text: string): AiCardResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonObject(text));
  } catch (err) {
    throw new ExtractError(`not JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  const result = resultSchema.safeParse(parsed);
  if (!result.success) {
    const problem = result.error.issues.map((issue) => `${issue.path.join(".") || "answer"}: ${issue.code}`).join(", ");
    throw new ExtractError(problem);
  }
  return result.data;
}
