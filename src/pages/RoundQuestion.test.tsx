import { screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import type { QuestionRound } from "../lib/questionRound";
import { renderUi } from "../test/render";
import { RoundQuestion } from "./RoundQuestion";

const DOG = "data:image/png;base64,DOG";

/** The bits of a round these tests need: one written question, nothing answered. */
function roundWith(promptSide: "term" | "definition"): QuestionRound {
  return {
    question: {
      kind: "written",
      termId: 70,
      prompt: promptSide === "term" ? "el perro" : "the dog",
      promptSide,
      showImage: promptSide === "term",
      label: promptSide === "term" ? "learn.askDefinition" : "learn.askTerm",
      answer: promptSide === "term" ? "the dog" : "el perro",
      options: [],
    },
    typed: "",
    setTyped: () => {},
    picked: null,
    feedback: null,
    pick: () => null,
    submitTyped: () => null,
  } as unknown as QuestionRound;
}

describe("RoundQuestion", () => {
  test("shows the asked term's picture when the prompt is the term", () => {
    renderUi(
      <RoundQuestion
        round={roundWith("term")}
        langs={undefined}
        images={{ 70: DOG }}
        onAnswer={() => {}}
        onContinue={() => {}}
      />,
    );
    expect(screen.getByRole("presentation").getAttribute("src")).toBe(DOG);
  });

  test("never shows a picture when the prompt is the definition: it would give the answer away", () => {
    renderUi(
      <RoundQuestion
        round={roundWith("definition")}
        langs={undefined}
        images={{ 70: DOG }}
        onAnswer={() => {}}
        onContinue={() => {}}
      />,
    );
    expect(screen.queryByRole("presentation")).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
  });
});
