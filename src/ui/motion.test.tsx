import { act, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";
import { renderUi } from "../test/render";
import {
  AnswerInput,
  AnswerOption,
  Confetti,
  FlipCard,
  MatchResult,
  ResultSummary,
  SegmentedControl,
  SlideSwap,
  StudySetCard,
} from ".";

/** A device that allows motion (jsdom has no matchMedia, which counts as reduced). */
function allowMotion() {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query }));
}

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

describe("ResultSummary motion", () => {
  test("counts up to the score, then pops and throws confetti", () => {
    allowMotion();
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
    renderUi(<ResultSummary correct={5} total={6} onStudyAgain={() => {}} />);
    expect(screen.getByText("0%")).toBeTruthy();
    expect(confetti()).toBeNull();
    act(() => vi.advanceTimersByTime(1200));
    expect(screen.getByText("83%").className).toContain("animate-pop");
    expect(confetti()).toBeTruthy();
  });

  test("a weak score lands without confetti", () => {
    renderUi(<ResultSummary correct={1} total={6} onStudyAgain={() => {}} />);
    expect(screen.getByText("17%")).toBeTruthy();
    expect(confetti()).toBeNull();
  });

  test("MatchResult: confetti only for a new best time", () => {
    allowMotion();
    const { rerender } = renderUi(
      <MatchResult time="0:23" isNewBest bestTime="0:23" onPlayAgain={() => {}} onDone={() => {}} />,
    );
    expect(confetti()).toBeTruthy();
    rerender(<MatchResult time="0:30" isNewBest={false} bestTime="0:23" onPlayAgain={() => {}} onDone={() => {}} />);
    expect(confetti()).toBeNull();
  });
});

describe("correct answers pop", () => {
  test("AnswerOption and AnswerInput", () => {
    renderUi(
      <>
        <AnswerOption label="the cat" state="correct" onSelect={() => {}} />
        <AnswerInput value="el gato" onChange={() => {}} onSubmit={() => {}} state="correct" />
      </>,
    );
    expect(screen.getByRole("button", { name: /the cat/ }).className).toContain("animate-pop-sm");
    expect(screen.getByRole("textbox").className).toContain("animate-pop-sm");
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
    expect(screen.getByText("the dog").closest("[aria-hidden]")!.getAttribute("aria-hidden")).toBe("true");
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

  test("reduced motion: swaps at once, the next card front side up", async () => {
    renderUi(<Deck />);
    await userEvent.click(screen.getByRole("button", { name: /flip/ }));
    await userEvent.click(screen.getByRole("button", { name: "go" }));
    expect(screen.queryByText("el gato")).toBeNull();
    expect(slot("el perro").className).toBe("");
    expect(screen.getByText("the dog").closest("[aria-hidden]")!.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("SegmentedControl pill", () => {
  test("sits under the active option and follows the choice", async () => {
    const observed: Element[] = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = (el: Element) => observed.push(el);
        disconnect = () => {};
      },
    );
    function Choice() {
      const [v, setV] = useState("a");
      return (
        <SegmentedControl
          label="Pick"
          value={v}
          onChange={setV}
          options={[
            { value: "a", label: "Apple" },
            { value: "b", label: "Banana" },
          ]}
        />
      );
    }
    renderUi(<Choice />);
    const pill = screen.getByTestId("segment-pill");
    expect(pill.hasAttribute("data-placed")).toBe(true);
    expect(observed).toHaveLength(1);
    const banana = screen.getByRole("radio", { name: "Banana" });
    Object.defineProperty(banana, "offsetLeft", { value: 70 });
    Object.defineProperty(banana, "offsetWidth", { value: 80 });
    await userEvent.click(banana);
    expect(pill.style.translate).toBe("70px 0");
    expect(pill.style.width).toBe("80px");
  });
});

test("StudySetCard: cards in a list rise one after another, capped", () => {
  renderUi(
    <>
      <StudySetCard title="First" termCount={3} index={1} />
      <StudySetCard title="Far down" termCount={3} index={30} />
      <StudySetCard title="Alone" termCount={3} />
    </>,
  );
  const card = (name: string) => screen.getByRole("button", { name: new RegExp(name) });
  expect(card("First").className).toContain("animate-rise");
  expect(card("First").style.animationDelay).toBe("70ms");
  expect(card("Far down").style.animationDelay).toBe("560ms");
  expect(card("Alone").className).not.toContain("animate-rise");
});
