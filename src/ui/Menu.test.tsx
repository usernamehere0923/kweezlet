import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { renderUi } from "../test/render";
import { Menu, type MenuItem } from ".";

const picks = (onClick: () => void): MenuItem[] => [
  { label: "Create a set", icon: "plus", to: "/sets/new" },
  { label: "From material", icon: "bulb", onClick },
];

describe("Menu", () => {
  test("the button opens the list; its links point at their pages", async () => {
    renderUi(<Menu label="Create a set" icon="plus" items={picks(vi.fn())} />);
    expect(screen.queryByRole("menu")).toBeNull();
    const trigger = screen.getByRole("button", { name: "Create a set" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    await userEvent.click(trigger);
    expect(screen.getByRole("menu")).toBeTruthy();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("menuitem", { name: "Create a set" }).getAttribute("href")).toBe("/sets/new");
  });

  test("picking one runs it and closes the list", async () => {
    const onClick = vi.fn();
    renderUi(<Menu label="Create a set" items={picks(onClick)} />);
    await userEvent.click(screen.getByRole("button", { name: "Create a set" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "From material" }));
    expect(onClick).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });

  test("Escape closes it and gives the button its focus back", async () => {
    renderUi(<Menu label="Create a set" items={picks(vi.fn())} />);
    const trigger = screen.getByRole("button", { name: "Create a set" });
    await userEvent.click(trigger);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  test("a click outside closes it", async () => {
    renderUi(
      <div>
        <Menu label="Create a set" items={picks(vi.fn())} />
        <button type="button">Elsewhere</button>
      </div>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Create a set" }));
    await userEvent.click(screen.getByRole("button", { name: "Elsewhere" }));
    expect(screen.queryByRole("menu")).toBeNull();
  });

  test("the arrows walk the picks", async () => {
    renderUi(<Menu label="Create a set" items={picks(vi.fn())} />);
    await userEvent.click(screen.getByRole("button", { name: "Create a set" }));
    const first = screen.getByRole("menuitem", { name: "Create a set" });
    const second = screen.getByRole("menuitem", { name: "From material" });
    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(first);
    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(second);
    await userEvent.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(first);
  });
});
