import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { renderUi } from "../../test/render";
import { MatchTile } from "..";

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
