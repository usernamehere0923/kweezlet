import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, useState } from "react";
import { describe, expect, test, vi } from "vitest";
import { faceHidden } from "../../test/queries";
import { renderUi } from "../../test/render";
import { mockSpeech } from "../../test/speech";
import { CardNav, FlipCard, KnowItButtons } from "..";

const flipCard = () => screen.getByRole("button", { name: "Tap or press Space to flip" });

describe("FlipCard", () => {
  test("uncontrolled: click and Space flip it", async () => {
    const onFlip = vi.fn();
    renderUi(<FlipCard front="el gato" back="the cat" onFlip={onFlip} />);
    expect(faceHidden("the cat")).toBe(true);
    await userEvent.click(flipCard());
    expect(faceHidden("the cat")).toBe(false);
    fireEvent.keyDown(document.body, { key: " " });
    expect(faceHidden("the cat")).toBe(true);
    expect(onFlip.mock.calls).toEqual([[true], [false]]);
  });

  test("Space is ignored while typing, with modifiers, and on a focused button before any tap or click", () => {
    const onFlip = vi.fn();
    renderUi(
      <>
        <FlipCard front="el gato" back="the cat" onFlip={onFlip} />
        <input aria-label="field" />
      </>,
    );
    fireEvent.keyDown(screen.getByLabelText("field"), { key: " " });
    fireEvent.keyDown(document.body, { key: " ", ctrlKey: true });
    fireEvent.keyDown(document.body, { key: "x" });
    flipCard().focus();
    fireEvent.keyDown(flipCard(), { key: " " });
    expect(onFlip).not.toHaveBeenCalled();
  });

  test("Space after a mouse click on the speaker flips the card, the speaker isn't pressed again", async () => {
    const { spoken } = mockSpeech();
    const onFlip = vi.fn();
    renderUi(<FlipCard front="el gato" back="the cat" onFlip={onFlip} speak={{ text: "el gato", lang: "es" }} />);
    const speaker = screen.getByRole("button", { name: "Speak" });
    await userEvent.click(speaker);
    await userEvent.keyboard(" ");
    expect(onFlip.mock.calls).toEqual([[true]]);
    expect(faceHidden("the cat")).toBe(false);
    // Still the first tap's voice: Space didn't press the speaker.
    expect(spoken).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Stop" })).toBeTruthy();
  });

  test("Space after clicking a button that brought a new card flips that card, the button isn't pressed again", async () => {
    const onFlip = vi.fn();
    const onNext = vi.fn();
    const deck = (id: number) => (
      <>
        <FlipCard key={id} front="el gato" back="the cat" onFlip={onFlip} />
        <button onClick={onNext}>Next</button>
      </>
    );
    const { rerender } = renderUi(deck(1));
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    // The next card mounts a new hotkey after the click.
    rerender(deck(2));
    await userEvent.keyboard(" ");
    expect(onFlip.mock.calls).toEqual([[true]]);
    expect(onNext).toHaveBeenCalledOnce();
  });

  test("Space on a keyboard-focused speaker presses it and doesn't flip", async () => {
    const { spoken } = mockSpeech();
    const onFlip = vi.fn();
    renderUi(<FlipCard front="el gato" back="the cat" onFlip={onFlip} speak={{ text: "el gato", lang: "es" }} />);
    const speaker = screen.getByRole("button", { name: "Speak" });
    // A tap somewhere first: the Tab afterwards still counts as keyboard.
    fireEvent.pointerDown(document.body);
    await userEvent.tab();
    await userEvent.tab();
    expect(document.activeElement).toBe(speaker);
    await userEvent.keyboard(" ");
    expect(spoken).toHaveLength(1);
    expect(onFlip).not.toHaveBeenCalled();
    expect(faceHidden("the cat")).toBe(true);
  });

  test("hotkey off: Space does nothing", () => {
    const onFlip = vi.fn();
    renderUi(<FlipCard front="el gato" back="the cat" onFlip={onFlip} hotkey={false} />);
    fireEvent.keyDown(document.body, { key: " " });
    expect(onFlip).not.toHaveBeenCalled();
    expect(faceHidden("the cat")).toBe(true);
  });

  test("controlled: follows the flipped prop", () => {
    renderUi(<FlipCard front="el gato" back="the cat" flipped />);
    expect(faceHidden("the cat")).toBe(false);
  });

  test("frontLabel and backLabel replace the corner labels", () => {
    renderUi(<FlipCard front="the cat" back="el gato" frontLabel="Definition" backLabel="Term" />);
    expect(faceHidden("Definition")).toBe(false);
    expect(faceHidden("Term")).toBe(true);
  });

  test("speaks the visible face without flipping, and can stop", async () => {
    const { spoken, synthesis } = mockSpeech();
    const onFlip = vi.fn();
    const { rerender } = renderUi(
      <FlipCard front="el gato" back="the cat" onFlip={onFlip} speak={{ text: "el gato", lang: "es" }} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Speak" }));
    expect(spoken[0]).toMatchObject({ text: "el gato", lang: "es" });
    expect(onFlip).not.toHaveBeenCalled();

    // Tap again and the button falls silent instead of repeating.
    await userEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(synthesis.cancel).toHaveBeenCalled();
    expect(onFlip).not.toHaveBeenCalled();

    // No speak prop: no button.
    rerender(<FlipCard front="el gato" back="the cat" onFlip={onFlip} />);
    expect(screen.queryByRole("button", { name: "Speak" })).toBeNull();
  });

  test("a flip while speaking falls silent, a re-render with the same words does not", async () => {
    const { synthesis } = mockSpeech();
    const card = (flipped: boolean) => (
      <FlipCard
        front="el gato"
        back="the cat"
        flipped={flipped}
        speak={flipped ? { text: "the cat", lang: "en" } : { text: "el gato", lang: "es" }}
      />
    );
    const { rerender } = renderUi(card(false));
    await userEvent.click(screen.getByRole("button", { name: "Speak" }));
    synthesis.cancel.mockClear();

    // Same words in a new object: still talking.
    rerender(card(false));
    expect(screen.getByRole("button", { name: "Stop" })).toBeTruthy();
    expect(synthesis.cancel).not.toHaveBeenCalled();

    // Flipped: the other face has other words, so the old ones stop.
    rerender(card(true));
    expect(synthesis.cancel).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Speak" })).toBeTruthy();
  });
  test("mounting does not stop the voice, leaving stops it once", async () => {
    const { synthesis } = mockSpeech();
    const { unmount } = renderUi(
      <StrictMode>
        <FlipCard front="el gato" back="the cat" speak={{ text: "el gato", lang: "es" }} />
      </StrictMode>,
    );
    expect(synthesis.cancel).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Speak" }));
    expect(screen.getByRole("button", { name: "Stop" })).toBeTruthy();
    synthesis.cancel.mockClear();
    unmount();
    expect(synthesis.cancel).toHaveBeenCalledOnce();
  });
});

describe("CardNav", () => {
  function Nav({ total, onShuffle }: { total: number; onShuffle?: () => void }) {
    const [i, setI] = useState(0);
    return (
      <CardNav index={i} total={total} onPrev={() => setI(i - 1)} onNext={() => setI(i + 1)} onShuffle={onShuffle} />
    );
  }

  test("buttons and arrow keys move, ends are disabled", async () => {
    const onShuffle = vi.fn();
    renderUi(<Nav total={3} onShuffle={onShuffle} />);
    const prev = screen.getByRole("button", { name: "Previous card" }) as HTMLButtonElement;
    expect(prev.disabled).toBe(true);
    expect(screen.getByText("1 / 3")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Next card" }));
    fireEvent.keyDown(document.body, { key: "ArrowRight" });
    expect(screen.getByText("3 / 3")).toBeTruthy();
    fireEvent.keyDown(document.body, { key: "ArrowRight" });
    expect(screen.getByText("3 / 3")).toBeTruthy();
    fireEvent.keyDown(document.body, { key: "ArrowLeft" });
    expect(screen.getByText("2 / 3")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Shuffle" }));
    expect(onShuffle).toHaveBeenCalledOnce();
  });

  test("no shuffle button without onShuffle", () => {
    renderUi(<Nav total={1} />);
    expect(screen.queryByRole("button", { name: "Shuffle" })).toBeNull();
  });
});

test("KnowItButtons", async () => {
  const still = vi.fn();
  const know = vi.fn();
  renderUi(<KnowItButtons onStillLearning={still} onKnowIt={know} />);
  await userEvent.click(screen.getByRole("button", { name: "Still learning" }));
  await userEvent.click(screen.getByRole("button", { name: "Know it" }));
  expect([still.mock.calls.length, know.mock.calls.length]).toEqual([1, 1]);
});
