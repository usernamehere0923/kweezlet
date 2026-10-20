import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef, useState } from "react";
import { describe, expect, test, vi } from "vitest";
import { renderUi } from "../../test/render";
import { mockSpeech } from "../../test/speech";
import { TermEditorRow, TermList, type TermEditorHandle } from "..";

test("TermEditorRow: typing, Enter moves on, delete, focus handle", async () => {
  const onNext = vi.fn();
  const onDelete = vi.fn();
  const ref = createRef<TermEditorHandle>();
  function Row() {
    const [pair, setPair] = useState(["", ""]);
    return (
      <TermEditorRow
        ref={ref}
        index={0}
        term={pair[0]}
        definition={pair[1]}
        onChange={(a, b) => setPair([a, b])}
        onNext={onNext}
        onDelete={onDelete}
      />
    );
  }
  renderUi(<Row />);
  const [term, def] = screen.getAllByRole("textbox") as HTMLInputElement[];
  ref.current!.focus();
  expect(document.activeElement).toBe(term);
  await userEvent.keyboard("el gato{Enter}");
  expect(document.activeElement).toBe(def);
  await userEvent.keyboard("the cat{Enter}");
  expect([term.value, def.value]).toEqual(["el gato", "the cat"]);
  expect(onNext).toHaveBeenCalledOnce();
  await userEvent.click(screen.getByRole("button", { name: "Delete term" }));
  expect(onDelete).toHaveBeenCalledOnce();
});

describe("TermList", () => {
  test("lists every pair", () => {
    renderUi(<TermList terms={[{ term: "el gato", definition: "the cat" }]} />);
    expect(screen.getByText("el gato")).toBeTruthy();
    expect(screen.getByText("the cat")).toBeTruthy();
  });

  test("speaks terms and definitions in the set's languages", async () => {
    const { spoken } = mockSpeech();
    renderUi(
      <TermList terms={[{ term: "el gato", definition: "the cat" }]} speak={{ termLang: "es", defLang: "en" }} />,
    );
    const speakers = screen.getAllByRole("button", { name: "Speak" });
    expect(speakers).toHaveLength(2);
    await userEvent.click(speakers[0]);
    await userEvent.click(speakers[1]);
    expect(spoken.map((utterance) => [utterance.text, utterance.lang])).toEqual([
      ["el gato", "es"],
      ["the cat", "en"],
    ]);
  });
});
