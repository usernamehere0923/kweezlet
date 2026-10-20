import { screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { renderUi } from "../../test/render";
import { ProgressBar } from "..";

test("ProgressBar plain and segmented", () => {
  const { rerender } = renderUi(<ProgressBar value={2} max={4} label="Progress" />);
  const widths = () =>
    [...screen.getByRole("progressbar").firstElementChild!.children].map((el) => (el as HTMLElement).style.width);
  expect(widths()).toEqual(["50%"]);
  rerender(<ProgressBar value={1} max={4} learning={2} />);
  expect(widths()).toEqual(["25%", "50%"]);
  rerender(<ProgressBar value={2} max={0} learning={1} />);
  expect(screen.getByText(/Known/)).toBeTruthy();
  expect(screen.getByText(/Learning/)).toBeTruthy();
});
