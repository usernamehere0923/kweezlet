import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef, useState } from "react";
import { describe, expect, test, vi } from "vitest";
import { renderUi } from "../../test/render";
import {
  AnswerInput,
  AnswerOption,
  CardNav,
  FeedbackBanner,
  FlipCard,
  KnowItButtons,
  MatchTile,
  ProgressBar,
  ResultSummary,
  StreakBadge,
  StudyModeTile,
  StudySetCard,
  TermEditorRow,
  TermList,
  type TermEditorHandle,
} from "..";

const flipCard = () => screen.getByRole("button", { name: "Tap or press Space to flip" });
const backHidden = () => screen.getByText("the cat").closest("[aria-hidden]")!.getAttribute("aria-hidden");

describe("FlipCard", () => {
  test("uncontrolled: click and Space flip it", async () => {
    const onFlip = vi.fn();
    renderUi(<FlipCard front="el gato" back="the cat" onFlip={onFlip} />);
    expect(backHidden()).toBe("true");
    await userEvent.click(flipCard());
    expect(backHidden()).toBe("false");
    fireEvent.keyDown(document.body, { key: " " });
    expect(backHidden()).toBe("true");
    expect(onFlip.mock.calls).toEqual([[true], [false]]);
  });

  test("Space is ignored while typing, with modifiers, and with hotkey off", () => {
    const onFlip = vi.fn();
    renderUi(
      <>
        <FlipCard front="a" back="the cat" onFlip={onFlip} hotkey={false} />
        <FlipCard front="b" back="b" onFlip={onFlip} />
        <input aria-label="field" />
      </>,
    );
    fireEvent.keyDown(screen.getByLabelText("field"), { key: " " });
    fireEvent.keyDown(document.body, { key: " ", ctrlKey: true });
    fireEvent.keyDown(document.body, { key: "x" });
    fireEvent.keyDown(screen.getAllByRole("button")[0], { key: " " });
    expect(onFlip).not.toHaveBeenCalled();
  });

  test("controlled: follows the flipped prop", () => {
    renderUi(<FlipCard front="el gato" back="the cat" flipped />);
    expect(backHidden()).toBe("false");
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

describe("answers", () => {
  test("AnswerOption: click and number key select it, not when disabled", async () => {
    const onSelect = vi.fn();
    const { rerender } = renderUi(<AnswerOption label="the cat" shortcut={2} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button", { name: /the cat/ }));
    fireEvent.keyDown(document.body, { key: "2" });
    expect(onSelect).toHaveBeenCalledTimes(2);
    rerender(<AnswerOption label="the cat" shortcut={2} onSelect={onSelect} state="wrong" disabled />);
    fireEvent.keyDown(document.body, { key: "2" });
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  test("AnswerInput: Check is disabled while empty and submits", async () => {
    const onSubmit = vi.fn();
    function Input() {
      const [v, setV] = useState("");
      return <AnswerInput value={v} onChange={setV} onSubmit={onSubmit} />;
    }
    renderUi(<Input />);
    const check = screen.getByRole("button", { name: "Check" }) as HTMLButtonElement;
    expect(check.disabled).toBe(true);
    await userEvent.type(screen.getByLabelText("Your answer"), "the cat{Enter}");
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  test("AnswerInput: read-only and no button after checking", () => {
    renderUi(<AnswerInput value="x" onChange={() => {}} onSubmit={() => {}} state="wrong" />);
    expect((screen.getByLabelText("Your answer") as HTMLInputElement).readOnly).toBe(true);
    expect(screen.queryByRole("button", { name: "Check" })).toBeNull();
  });

  test("FeedbackBanner shows the right answer only when wrong", async () => {
    const onContinue = vi.fn();
    const { rerender } = renderUi(<FeedbackBanner state="wrong" correctAnswer="the cat" onContinue={onContinue} />);
    expect(screen.getByText("Not quite")).toBeTruthy();
    expect(screen.getByText(/the cat/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onContinue).toHaveBeenCalledOnce();
    rerender(<FeedbackBanner state="correct" correctAnswer="the cat" onContinue={onContinue} />);
    expect(screen.getByText("Correct!")).toBeTruthy();
    expect(screen.queryByText(/the cat/)).toBeNull();
  });

  test("MatchTile: matched tiles are disabled", async () => {
    const onClick = vi.fn();
    const { rerender } = renderUi(<MatchTile label="el gato" onClick={onClick} />);
    await userEvent.click(screen.getByRole("button", { name: "el gato" }));
    expect(onClick).toHaveBeenCalledOnce();
    for (const state of ["selected", "mismatch", "matched"] as const) {
      rerender(<MatchTile label="el gato" state={state} onClick={onClick} />);
    }
    expect((screen.getByRole("button", { name: "el gato" }) as HTMLButtonElement).disabled).toBe(true);
  });

  test("KnowItButtons", async () => {
    const still = vi.fn();
    const know = vi.fn();
    renderUi(<KnowItButtons onStillLearning={still} onKnowIt={know} />);
    await userEvent.click(screen.getByRole("button", { name: "Still learning" }));
    await userEvent.click(screen.getByRole("button", { name: "Know it" }));
    expect([still.mock.calls.length, know.mock.calls.length]).toEqual([1, 1]);
  });
});

describe("progress and results", () => {
  test("ProgressBar plain and segmented", () => {
    const { rerender } = renderUi(<ProgressBar value={2} max={4} label="Progress" />);
    rerender(<ProgressBar value={2} max={0} learning={1} />);
    expect(screen.getByText(/Known/)).toBeTruthy();
    expect(screen.getByText(/Learning/)).toBeTruthy();
  });

  test("ResultSummary shows the score and both buttons", async () => {
    const again = vi.fn();
    const done = vi.fn();
    const { rerender } = renderUi(<ResultSummary correct={3} total={4} onStudyAgain={again} onDone={done} />);
    expect(screen.getByText("75%")).toBeTruthy();
    expect(screen.getByText("3 of 4 correct")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Study again" }));
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect([again.mock.calls.length, done.mock.calls.length]).toEqual([1, 1]);
    rerender(<ResultSummary correct={0} total={0} onStudyAgain={again} />);
    expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
  });

  test("StreakBadge", () => {
    renderUi(<StreakBadge days={1} />);
    expect(screen.getByText("1 day streak")).toBeTruthy();
  });
});

describe("overview and editing", () => {
  test("StudySetCard and StudyModeTile are clickable", async () => {
    const open = vi.fn();
    renderUi(
      <>
        <StudySetCard title="Spanish animals" termCount={6} owner="demo" tag="Spanish" onClick={open} />
        <StudySetCard title="Empty" termCount={1} />
        <StudyModeTile mode="match" active onClick={open} />
      </>,
    );
    expect(screen.getByText("6 terms")).toBeTruthy();
    expect(screen.getByText("1 term")).toBeTruthy();
    await userEvent.click(screen.getByText("Spanish animals"));
    await userEvent.click(screen.getByText("Match"));
    expect(open).toHaveBeenCalledTimes(2);
  });

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

  test("TermList lists every pair", () => {
    renderUi(<TermList terms={[{ term: "el gato", definition: "the cat" }]} />);
    expect(screen.getByText("el gato")).toBeTruthy();
    expect(screen.getByText("the cat")).toBeTruthy();
  });
});
