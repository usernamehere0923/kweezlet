import { act, fireEvent, screen, waitFor } from "@testing-library/react";
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

  test("opening puts the focus in the list, so the keys arrive even where buttons take none", async () => {
    renderUi(<Menu label="Create a set" items={picks(vi.fn())} />);
    await userEvent.click(screen.getByRole("button", { name: "Create a set" }));
    expect(document.activeElement).toBe(screen.getByRole("menu"));
  });

  test("a mousedown in the box keeps the focus where it is (Safari/Firefox mouse pick)", async () => {
    renderUi(<Menu label="Create a set" items={picks(vi.fn())} />);
    await userEvent.click(screen.getByRole("button", { name: "Create a set" }));
    // false: default prevented, so the browser moves no focus and the list stays.
    expect(fireEvent.mouseDown(screen.getByRole("menuitem", { name: "From material" }))).toBe(false);
    expect(screen.getByRole("menu")).toBeTruthy();
  });

  test.each([
    { left: 600, edge: "right-0" },
    { left: 16, edge: "left-0" },
  ])('align="auto": a button at x=$left opens the list with $edge', async ({ left, edge }) => {
    renderUi(<Menu label="Create a set" align="auto" items={picks(vi.fn())} />);
    const trigger = screen.getByRole("button", { name: "Create a set" });
    vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(700);
    vi.spyOn(trigger.parentElement!, "getBoundingClientRect").mockReturnValue({ left, width: 170 } as DOMRect);
    await userEvent.click(trigger);
    expect(screen.getByRole("menu").className.split(" ")).toContain(edge);
  });

  test("picking one runs it, closes the list and gives the button the focus", async () => {
    const onClick = vi.fn();
    renderUi(<Menu label="Create a set" items={picks(onClick)} />);
    const trigger = screen.getByRole("button", { name: "Create a set" });
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("menuitem", { name: "From material" }));
    expect(onClick).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  test("a keyboard pick hands the focus back to the button", async () => {
    renderUi(<Menu label="Create a set" items={picks(vi.fn())} />);
    const trigger = screen.getByRole("button", { name: "Create a set" });
    await userEvent.click(trigger);
    await userEvent.keyboard("{ArrowUp}{Enter}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  test("Escape closes it and gives the button its focus back", async () => {
    renderUi(<Menu label="Create a set" items={picks(vi.fn())} />);
    const trigger = screen.getByRole("button", { name: "Create a set" });
    await userEvent.click(trigger);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  test("the button again closes it, the focus on the button", async () => {
    renderUi(<Menu label="Create a set" items={picks(vi.fn())} />);
    const trigger = screen.getByRole("button", { name: "Create a set" });
    await userEvent.click(trigger);
    await userEvent.click(trigger);
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

  test("Tab walks through the picks and closes it on the way out", async () => {
    renderUi(
      <div>
        <Menu label="Create a set" items={picks(vi.fn())} />
        <button type="button">Elsewhere</button>
      </div>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Create a set" }));
    await userEvent.tab();
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "From material" }));
    expect(screen.getByRole("menu")).toBeTruthy();
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Elsewhere" }));
    expect(screen.queryByRole("menu")).toBeNull();
  });

  test("focus leaving to nowhere (another window, the browser's own bar) closes it", async () => {
    renderUi(<Menu label="Create a set" items={picks(vi.fn())} />);
    await userEvent.click(screen.getByRole("button", { name: "Create a set" }));
    act(() => screen.getByRole("menu").blur());
    expect(screen.queryByRole("menu")).toBeNull();
  });

  test("leaves shortcuts and keys someone else handled alone", async () => {
    renderUi(<Menu label="Create a set" items={picks(vi.fn())} />);
    await userEvent.click(screen.getByRole("button", { name: "Create a set" }));
    const menu = screen.getByRole("menu");
    await userEvent.keyboard("{Alt>}{ArrowDown}{/Alt}");
    expect(document.activeElement).toBe(menu);
    const handled = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    handled.preventDefault();
    act(() => void menu.dispatchEvent(handled));
    expect(screen.getByRole("menu")).toBeTruthy();
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
