import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";
import { renderUi } from "../../test/render";
import { AnswerInput, AnswerOption, FeedbackBanner } from "..";

describe("AnswerOption", () => {
  test("click and number key select it, not when disabled", async () => {
    const onSelect = vi.fn();
    const { rerender } = renderUi(<AnswerOption label="the cat" shortcut={2} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button", { name: /the cat/ }));
    fireEvent.keyDown(document.body, { key: "2" });
    expect(onSelect).toHaveBeenCalledTimes(2);
    rerender(<AnswerOption label="the cat" shortcut={2} onSelect={onSelect} state="wrong" disabled />);
    fireEvent.keyDown(document.body, { key: "2" });
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  test("a correct pick pops", () => {
    renderUi(<AnswerOption label="the cat" state="correct" onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: /the cat/ }).className).toContain("animate-pop-sm");
  });

  test("the right answer shown after a wrong pick doesn't pop", () => {
    renderUi(<AnswerOption label="the cat" state="correct" chosen={false} onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: /the cat/ }).className).not.toContain("animate-pop");
  });
});

describe("AnswerInput", () => {
  test("Check is disabled while empty and submits", async () => {
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

  test("read-only and no button after checking", () => {
    renderUi(<AnswerInput value="x" onChange={() => {}} onSubmit={() => {}} state="wrong" />);
    expect((screen.getByLabelText("Your answer") as HTMLInputElement).readOnly).toBe(true);
    expect(screen.queryByRole("button", { name: "Check" })).toBeNull();
  });

  test("a correct answer pops", () => {
    renderUi(<AnswerInput value="el gato" onChange={() => {}} onSubmit={() => {}} state="correct" />);
    expect(screen.getByRole("textbox").className).toContain("animate-pop-sm");
  });
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
