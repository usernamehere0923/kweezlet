import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef, useState } from "react";
import { describe, expect, test, vi } from "vitest";
import { renderUi } from "../../test/render";
import { mockSpeech } from "../../test/speech";
import { ClozeText, TermEditorRow, TermList, type TermEditorHandle } from "..";

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

test("ClozeText: a gap for screen readers too, or the answer marked", () => {
  renderUi(
    <>
      <ClozeText text="Bern is the {{capital}}." />
      <ClozeText text="Bern is the {{capital}}." reveal />
      <ClozeText text="No gap here." />
    </>,
  );
  expect(screen.getByText("gap")).toBeTruthy();
  expect(screen.getByText("capital")).toBeTruthy();
  expect(screen.getByText("No gap here.")).toBeTruthy();
});

test("TermEditorRow as a gap sentence: Make gap marks the selection, one gap at a time", async () => {
  const changes: [string, string][] = [];
  function Row() {
    const [kind, setKind] = useState<"pair" | "cloze">("pair");
    const [pair, setPair] = useState(["Bern is the federal city.", ""]);
    return (
      <TermEditorRow
        index={0}
        kind={kind}
        onKind={setKind}
        term={pair[0]}
        definition={pair[1]}
        onChange={(a, b) => {
          changes.push([a, b]);
          setPair([a, b]);
        }}
      />
    );
  }
  renderUi(<Row />);
  await userEvent.click(screen.getByRole("radio", { name: "Gap sentence" }));
  const sentence = screen.getByLabelText("Sentence") as HTMLTextAreaElement;
  expect(screen.getByText(/Select the words to hide/)).toBeTruthy();
  // Nothing selected: nothing to mark.
  await userEvent.click(screen.getByRole("button", { name: "Make gap" }));
  expect(changes).toEqual([]);

  sentence.setSelectionRange(12, 24); // "federal city"
  await userEvent.click(screen.getByRole("button", { name: "Make gap" }));
  expect(changes.at(-1)).toEqual(["Bern is the {{federal city}}.", "federal city"]);
  expect(screen.getByText("gap")).toBeTruthy();

  // A second gap replaces the first.
  sentence.setSelectionRange(0, 4); // "Bern"
  await userEvent.click(screen.getByRole("button", { name: "Make gap" }));
  expect(changes.at(-1)).toEqual(["{{Bern}} is the federal city.", "Bern"]);
});

test("TermList shows a gap sentence as one line with its answer", () => {
  renderUi(<TermList terms={[{ kind: "cloze", term: "Bern is the {{capital}}.", definition: "capital" }]} />);
  expect(screen.getByText("capital")).toBeTruthy();
  expect(screen.getAllByRole("listitem")).toHaveLength(1);
});
