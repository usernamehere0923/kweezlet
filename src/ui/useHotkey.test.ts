import { fireEvent, renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { HotkeyInput, useHotkey } from "./useHotkey";

/** A focused button on the page, as a tap or Tab would leave it. */
function focusedButton() {
  const button = document.createElement("button");
  document.body.append(button);
  button.focus();
  return button;
}

const wrapper = HotkeyInput;

describe("useHotkey", () => {
  test("Space on a focused button: the button's until a pointer is used, then ours", () => {
    const handler = vi.fn();
    renderHook(() => useHotkey(" ", handler), { wrapper });
    const button = focusedButton();

    expect(fireEvent.keyDown(button, { key: " " })).toBe(true);
    expect(handler).not.toHaveBeenCalled();

    fireEvent.pointerDown(button);
    expect(fireEvent.keyDown(button, { key: " " })).toBe(false);
    expect(handler).toHaveBeenCalledOnce();

    // Tab, even backwards: keyboard again, the button keeps Space.
    fireEvent.keyDown(button, { key: "Tab", shiftKey: true });
    fireEvent.keyDown(button, { key: " " });
    expect(handler).toHaveBeenCalledOnce();
    button.remove();
  });

  test("a hotkey that mounts after the click still knows it was a click", () => {
    const handler = vi.fn();
    const { rerender } = renderHook(({ on }) => useHotkey(" ", handler, on), {
      wrapper,
      initialProps: { on: false },
    });
    const button = focusedButton();
    fireEvent.pointerDown(button);
    rerender({ on: true });
    fireEvent.keyDown(button, { key: " " });
    expect(handler).toHaveBeenCalledOnce();
    button.remove();
  });

  test("without HotkeyInput a focused button always keeps Space", () => {
    const handler = vi.fn();
    renderHook(() => useHotkey(" ", handler));
    const button = focusedButton();
    fireEvent.pointerDown(button);
    fireEvent.keyDown(button, { key: " " });
    expect(handler).not.toHaveBeenCalled();
    button.remove();
  });

  test("the key up of a Space we took is ours too, others are left alone", () => {
    renderHook(() => useHotkey(" ", () => {}), { wrapper });
    const button = focusedButton();
    fireEvent.pointerDown(button);
    fireEvent.keyDown(button, { key: " " });
    expect(fireEvent.keyUp(button, { key: " " })).toBe(false);
    // Nothing taken since: the next key up goes to the button.
    expect(fireEvent.keyUp(button, { key: " " })).toBe(true);

    fireEvent.keyDown(button, { key: "Tab" });
    fireEvent.keyDown(button, { key: " " });
    expect(fireEvent.keyUp(button, { key: " " })).toBe(true);
    button.remove();
  });

  test("unmounted: every listener is gone", () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const handler = vi.fn();
    const { unmount } = renderHook(() => useHotkey(" ", handler), { wrapper });
    const added = [...add.mock.calls];
    expect(added.map(([type]) => type).sort()).toEqual(["keydown", "keydown", "keyup", "pointerdown"]);
    unmount();
    expect(remove.mock.calls).toEqual(expect.arrayContaining(added));
    fireEvent.keyDown(document.body, { key: " " });
    expect(handler).not.toHaveBeenCalled();
  });
});
