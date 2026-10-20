import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { allowMotion } from "../../test/motion";
import { renderUi } from "../../test/render";
import { MatchResult, ResultSummary, StreakBadge } from "..";

const confetti = () => screen.queryByTestId("confetti");

describe("ResultSummary", () => {
  test("shows the score and both buttons", async () => {
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
});

describe("MatchResult", () => {
  test("shows the time and the new-best banner only when earned", async () => {
    const again = vi.fn();
    const done = vi.fn();
    const { rerender } = renderUi(
      <MatchResult time="0:23" isNewBest bestTime="0:23" onPlayAgain={again} onDone={done} />,
    );
    expect(screen.getByText("New best time!")).toBeTruthy();
    expect(screen.getByText("Your time")).toBeTruthy();
    expect(screen.getByText("0:23")).toBeTruthy();
    expect(screen.getByText("Best time 0:23")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Play again" }));
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect([again.mock.calls.length, done.mock.calls.length]).toEqual([1, 1]);
    rerender(<MatchResult time="0:31" isNewBest={false} bestTime="0:23" onPlayAgain={again} onDone={done} />);
    expect(screen.queryByText("New best time!")).toBeNull();
  });

  test("confetti only for a new best time", () => {
    allowMotion();
    const { rerender } = renderUi(
      <MatchResult time="0:23" isNewBest bestTime="0:23" onPlayAgain={() => {}} onDone={() => {}} />,
    );
    expect(confetti()).toBeTruthy();
    rerender(<MatchResult time="0:30" isNewBest={false} bestTime="0:23" onPlayAgain={() => {}} onDone={() => {}} />);
    expect(confetti()).toBeNull();
  });
});

test("StreakBadge", () => {
  renderUi(<StreakBadge days={1} />);
  expect(screen.getByText("1 day streak")).toBeTruthy();
});
