import { z } from "zod";
import { LANGUAGES } from "../languages";

/**
 * The card the AI returns. `verified` and `page` are filled in after the run by
 * the quote check (worker/ai/verify.ts) and kept in the draft's cards_json;
 * editing a card's text later does not change them.
 */
/** The most cards one run makes ("as many as the material supports"). */
export const MAX_CARDS = 60;

/** A string cut to `max` characters instead of failing over a few too many. */
const clipped = (max: number) => z.string().transform((s) => s.trim().slice(0, max));

export const cardSchema = z.object({
  term: z.string().trim().min(1).max(1000),
  definition: z.string().trim().min(1).max(1000),
  /**
   * A quote from the material, max 200 chars, "" when the model could not
   * quote. A longer one is cut: the start of a real quote still verifies.
   */
  source: clipped(200).catch("").default(""),
  /** The page the quote is on, null when unknown (or not a page number). */
  page: z.number().int().positive().nullable().catch(null).default(null),
});

/** A language outside the list (or "null" as a string) is no language. */
export const langSchema = z.enum(LANGUAGES).nullable().catch(null).default(null);

/**
 * Lenient on purpose: every repair retry sends the whole material again, so
 * small slips are fixed here instead. A title or notes that run long are cut,
 * a broken card is dropped (the others stay), cards beyond the cap are cut.
 * Only an answer that is no answer at all (no kind, no card list, cards none
 * of which can be read) is an error.
 */
export const resultSchema = z.object({
  kind: z.enum(["vocabulary", "questions", "terms"]),
  title: clipped(60).catch("").default(""),
  term_lang: langSchema,
  def_lang: langSchema,
  cards: z.array(z.unknown()).transform((items, ctx) => {
    const cards: AiCard[] = [];
    let firstProblem: z.core.$ZodIssue | undefined;
    for (const item of items) {
      const card = cardSchema.safeParse(item);
      if (card.success) cards.push(card.data);
      else firstProblem ??= card.error.issues[0];
    }
    // All of them broken is a misunderstood format: worth the repair retry.
    if (cards.length === 0 && firstProblem) {
      ctx.addIssue({ code: "custom", path: [0, ...firstProblem.path], message: firstProblem.code, input: items });
    }
    return cards.slice(0, MAX_CARDS);
  }),
  /** Why there are fewer cards than asked, or none. */
  notes: clipped(2000).catch("").default(""),
});

export type AiCard = z.infer<typeof cardSchema>;
export type AiCardResult = z.infer<typeof resultSchema>;

/**
 * A card as kept in a draft (cards_json): the AI's card plus the quote check
 * (`verified`, `page`) and the keep checkbox of the review screen.
 */
export type DraftCard = AiCard & { verified: boolean; checked: boolean };

/** Why an answer was unreadable. Its message goes into the repair retry. */
export class ExtractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractError";
  }
}

/**
 * Pulls the JSON object out of an answer that wraps it: code fences, a line of
 * prose before or after. The model is asked for "JSON only" but not trusted:
 * prose may hold a brace ("kind {vocabulary}") or a fence of its own, so every
 * fence and every "{" is tried until one parses. Nothing parses: the best guess.
 */
export function extractJsonObject(text: string): string {
  const bodies = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((m) => m[1]!);
  bodies.push(text);
  for (const body of bodies) {
    const end = body.lastIndexOf("}");
    for (let start = body.indexOf("{"); start >= 0 && start < end; start = body.indexOf("{", start + 1)) {
      const candidate = body.slice(start, end + 1);
      try {
        JSON.parse(candidate);
        return candidate;
      } catch {
        // Not here: the next brace.
      }
    }
  }
  const body = bodies[0]!;
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
    const problem = result.error.issues
      .map((issue) => `${issue.path.join(".") || "answer"}: ${issue.code === "custom" ? issue.message : issue.code}`)
      .join(", ");
    throw new ExtractError(problem);
  }
  return result.data;
}
