import { describe, expect, test } from "vitest";
import { en } from "../i18n/en";
import { aiErrorMessage, formatCost } from "./cost";

/** t() as the app has it, for English: fills {vars}. */
const t = (key: keyof typeof en, vars?: Record<string, string>) =>
  en[key].replace(/\{(\w+)\}/g, (m, name: string) => vars?.[name] ?? m);

describe("formatCost", () => {
  test("rounds up to the cent: a started cent is a cent", () => {
    expect(formatCost(0)).toBe("$0.00");
    expect(formatCost(1)).toBe("$0.01");
    expect(formatCost(4_000_000)).toBe("$0.01"); // $0.004
    expect(formatCost(10_000_000)).toBe("$0.01");
    expect(formatCost(10_000_001)).toBe("$0.02");
    expect(formatCost(2_000_000_000)).toBe("$2.00");
  });
});

describe("aiErrorMessage", () => {
  test("every code has its own message; unknown codes read as a server problem", () => {
    const codes = ["ai_busy", "ai_quota", "ai_key", "ai_input", "ai_cut_off", "ai_server", "ai_cap", "ai_running"];
    const messages = codes.map((code) => aiErrorMessage(t, code, 2_000_000_000));
    expect(new Set(messages).size).toBe(codes.length);
    for (const message of messages) expect(message).not.toMatch(/\{\w+\}/);
    expect(aiErrorMessage(t, "something_new")).toBe(en["ai.error.server"]);
    expect(aiErrorMessage(t, null)).toBe(en["ai.error.server"]);
  });

  test("the cap names the budget when the answer carries it, and never shows a bare placeholder", () => {
    expect(aiErrorMessage(t, "ai_cap", 2_000_000_000)).toBe(
      "The monthly AI budget of $2.00 is used up. It starts again on the 1st.",
    );
    expect(aiErrorMessage(t, "ai_cap")).toBe(en["ai.error.capReached"]);
  });
});
