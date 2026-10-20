import { screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { renderUi } from "../../test/render";
import { StudyHeader } from "..";

test("StudyHeader: a back link, the streak only once there is one", () => {
  const { rerender } = renderUi(<StudyHeader backTo="/sets/1" backLabel="Back to set" streak={3} />);
  expect(screen.getByRole("link", { name: "Back to set" }).getAttribute("href")).toBe("/sets/1");
  expect(screen.getByText("3 day streak")).toBeTruthy();
  rerender(<StudyHeader backTo="/sets/1" backLabel="Back to set" streak={0} />);
  expect(screen.queryByText(/streak/)).toBeNull();
});
