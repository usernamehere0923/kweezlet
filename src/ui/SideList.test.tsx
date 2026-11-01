import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { renderUi } from "../test/render";
import { SideList } from ".";

const items = (onEdit: () => void) => [
  { id: "all", label: "All sets" },
  { id: "3", label: "Spanish", editLabel: "Edit folder", onEdit },
  { id: "none", label: "No folder" },
];

describe("SideList", () => {
  test("marks the picked row and picks another one", async () => {
    const onChange = vi.fn();
    renderUi(<SideList label="Folder" value="3" onChange={onChange} items={items(vi.fn())} />);
    expect(screen.getByRole("button", { name: "Spanish" }).getAttribute("aria-current")).toBe("true");
    expect(screen.getByRole("button", { name: "All sets" }).getAttribute("aria-current")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "No folder" }));
    expect(onChange).toHaveBeenCalledWith("none");
  });

  test("only the picked row shows its edit pencil", async () => {
    const onEdit = vi.fn();
    renderUi(<SideList label="Folder" value="3" onChange={vi.fn()} items={items(onEdit)} />);
    expect(screen.getAllByRole("button", { name: "Edit folder" })).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Edit folder" }));
    expect(onEdit).toHaveBeenCalled();
  });
});
