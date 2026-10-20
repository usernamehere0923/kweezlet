import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { renderUi } from "../../test/render";
import { StudyModeTile, StudySetCard } from "..";

test("StudyModeTile: hint under the label and a disabled tile that does nothing", async () => {
  const open = vi.fn();
  renderUi(<StudyModeTile mode="match" hint="Best time 0:23" onClick={open} disabled />);
  expect(screen.getByText("Match")).toBeTruthy();
  expect(screen.getByText("Best time 0:23")).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: /Match/ }));
  expect(open).not.toHaveBeenCalled();
});

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
