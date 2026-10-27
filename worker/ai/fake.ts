// The stand-in AI for local dev (ZAI_FAKE=1 in .dev.vars): canned cards made
// from the material itself, so the whole flow can be clicked through without
// a z.ai key and without paying. worker/ai.ts refuses it outside local dev.
import { MAX_CARDS } from "./extract";
import { costNanos, MODEL, type Usage } from "./prices";
import type { ZaiCall, ZaiPart, ZaiResult } from "./zai";

/** A thinking call takes 20-60 s; the stand-in waits a little, so "Making cards…" shows. */
export const FAKE_DELAY_MS = 3000;

/** A line "el perro — the dog" (or "-", "–", ":", "=") is a vocabulary pair. */
const PAIR = /^(.{1,80}?)\s+[—–\-:=]\s+(.{1,200})$/;

type FakeCard = { term: string; definition: string; source: string; page: number | null };

/**
 * Answers like z.ai would, in the output format of the system prompt: pairs
 * become vocabulary cards, other sentences "terms" cards quoting themselves (so
 * they verify), image pages one unverified card each.
 */
export async function fakeZai(call: ZaiCall, delayMs = FAKE_DELAY_MS): Promise<ZaiResult> {
  if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
  const user = call.messages.find((m) => m.role === "user");
  const parts: ZaiPart[] = Array.isArray(user?.content) ? user.content : [];
  const texts = parts.flatMap((part) => (part.type === "text" ? [part.text] : []));
  const header = texts[0] ?? "";
  const wanted = /<kind>(\w+)<\/kind>/.exec(header)?.[1] ?? "auto";
  const max = Number(/<max_cards>(\d+)<\/max_cards>/.exec(header)?.[1] ?? MAX_CARDS);
  const cloze = header.includes("<form>cloze</form>");

  const pairs: FakeCard[] = [];
  const sentences: FakeCard[] = [];
  for (const text of texts.slice(1)) {
    const tag = /^<page n="(\d+)"( type="image")?>/.exec(text);
    if (!tag) continue;
    const page = Number(tag[1]);
    if (tag[2]) {
      pairs.push({ term: `Photo page ${page}`, definition: "The stand-in AI does not read images.", source: "", page });
      continue;
    }
    const body = text.replace(/^<page[^>]*>\n?/, "").replace(/\n?<\/page>$/, "");
    for (const line of body.split("\n").map((l) => l.trim())) {
      const pair = PAIR.exec(line);
      if (pair) {
        pairs.push({ term: pair[1]!, definition: pair[2]!, source: line.slice(0, 200), page });
        continue;
      }
      for (const sentence of line.match(/[^.!?]+[.!?]/g) ?? []) {
        const words = sentence.trim().split(/\s+/);
        if (words.length < 4) continue;
        const quote = sentence.trim().slice(0, 200);
        if (cloze) {
          // The longest word becomes the gap: letters and digits of any language, a whole word only.
          const gap = words
            .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ""))
            .reduce((long, word) => (word.length > long.length ? word : long), "");
          const whole = new RegExp(`(?<![\\p{L}\\p{N}])${gap}(?![\\p{L}\\p{N}])`, "u");
          const term = sentence.trim().replace(whole, `{{${gap}}}`);
          sentences.push({ term, definition: gap, source: quote, page });
        } else sentences.push({ term: `${words.slice(0, 3).join(" ")} …`, definition: quote, source: quote, page });
      }
    }
  }
  const kind = wanted !== "auto" ? wanted : pairs.length >= sentences.length ? "vocabulary" : "terms";
  // Gap sentences only come from sentences.
  const cards = (cloze ? sentences : [...pairs, ...sentences]).slice(0, max);
  const content = JSON.stringify({
    kind,
    title: "Stand-in cards",
    term_lang: null,
    def_lang: null,
    cards,
    notes: "Made by the stand-in AI (ZAI_FAKE): no real model was asked.",
  });
  // About 4 characters per token, plus some thinking, so the cost line shows something.
  const usage: Usage = {
    promptTokens: Math.ceil(texts.join("").length / 4),
    cachedTokens: 0,
    completionTokens: Math.ceil(content.length / 4) + 500,
  };
  return { content, usage, costNanos: costNanos(MODEL, usage), durationMs: delayMs };
}
