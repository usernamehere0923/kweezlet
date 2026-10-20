import { act, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";
import { allowMotion } from "../test/motion";
import { faceHidden } from "../test/queries";
import { renderUi } from "../test/render";
import { Confetti, FlipCard, SlideSwap } from ".";

const confetti = () => screen.queryByTestId("confetti");

describe("Confetti", () => {
  test("throws its pieces when motion is allowed", () => {
    allowMotion();
    renderUi(<Confetti count={12} />);
    expect(confetti()!.children).toHaveLength(12);
  });

  test("nothing under reduced motion", () => {
    renderUi(<Confetti />);
    expect(confetti()).toBeNull();
  });
});

function Deck({ start = 0 }: { start?: number }) {
  const cards = [
    ["el gato", "the cat"],
    ["el perro", "the dog"],
  ];
  const [i, setI] = useState(start);
  const [flipped, setFlipped] = useState(false);
  const [back, setBack] = useState(false);
  const go = (next: number) => {
    setBack(next < i);
    setI(next);
    setFlipped(false);
  };
  return (
    <>
      <SlideSwap id={i} back={back}>
        <FlipCard front={cards[i][0]} back={cards[i][1]} flipped={flipped} onFlip={setFlipped} />
      </SlideSwap>
      <button onClick={() => go(1 - i)}>go</button>
    </>
  );
}

/** jsdom has no AnimationEvent, so React listens for the prefixed name: send both. */
function animationEnd(el: Element) {
  fireEvent.animationEnd(el);
  fireEvent(el, new Event("webkitAnimationEnd", { bubbles: true }));
}

const slot = (text: string) => screen.getByText(text).closest(".overflow-x-clip > div")!;

describe("SlideSwap", () => {
  test("the old card slides out as it was, then the next slides in", async () => {
    allowMotion();
    renderUi(<Deck />);
    await userEvent.click(screen.getByRole("button", { name: /flip/ }));
    await userEvent.click(screen.getByRole("button", { name: "go" }));
    // Still the flipped cat, leaving: the dog's answer never shows on it.
    const leaving = slot("the cat");
    expect(leaving.className).toContain("animate-slide-out-left");
    expect(leaving.hasAttribute("inert")).toBe(true);
    expect(screen.queryByText("el perro")).toBeNull();
    // A child's own animation ending is not the slide ending.
    animationEnd(screen.getByText("the cat"));
    expect(screen.queryByText("el perro")).toBeNull();
    animationEnd(leaving);
    expect(slot("el perro").className).toContain("animate-slide-in-right");
    expect(faceHidden("the dog")).toBe(true);
  });

  test("going back slides the other way", async () => {
    allowMotion();
    renderUi(<Deck start={1} />);
    await userEvent.click(screen.getByRole("button", { name: "go" }));
    const leaving = slot("el perro");
    expect(leaving.className).toContain("animate-slide-out-right");
    animationEnd(leaving);
    expect(slot("el gato").className).toContain("animate-slide-in-left");
  });

  test("Space does nothing while the old card leaves: the next one arrives front side up", async () => {
    allowMotion();
    renderUi(<Deck />);
    await userEvent.click(screen.getByRole("button", { name: "go" }));
    fireEvent.keyDown(document.body, { key: " " });
    animationEnd(slot("el gato"));
    expect(faceHidden("the dog")).toBe(true);
  });

  test("no animationend (hidden, cancelled): swaps after the longest slide anyway", async () => {
    allowMotion();
    renderUi(<Deck />);
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "go" }));
    expect(screen.queryByText("el perro")).toBeNull();
    act(() => vi.advanceTimersByTime(400));
    expect(screen.getByText("el perro")).toBeTruthy();
  });

  test("the direction is fixed when the slide starts", () => {
    allowMotion();
    const { rerender } = renderUi(
      <SlideSwap id={1}>
        <p>one</p>
      </SlideSwap>,
    );
    rerender(
      <SlideSwap id={2}>
        <p>two</p>
      </SlideSwap>,
    );
    rerender(
      <SlideSwap id={2} back>
        <p>two</p>
      </SlideSwap>,
    );
    expect(slot("one").className).toContain("animate-slide-out-left");
  });

  test("reduced motion: swaps at once, the next card front side up", async () => {
    renderUi(<Deck />);
    await userEvent.click(screen.getByRole("button", { name: /flip/ }));
    await userEvent.click(screen.getByRole("button", { name: "go" }));
    expect(screen.queryByText("el gato")).toBeNull();
    expect(slot("el perro").className).toBe("");
    expect(faceHidden("the dog")).toBe(true);
  });
});
