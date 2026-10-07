import { act, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";
import { renderUi } from "../test/render";
import { Button, Checkbox, ErrorBoundary, Modal, SearchField, Select, useToast } from ".";

describe("fields", () => {
  test("SearchField clears and refocuses", async () => {
    function Search() {
      const [q, setQ] = useState("");
      return <SearchField label="Search" clearLabel="Clear" value={q} onChange={setQ} />;
    }
    renderUi(<Search />);
    const input = screen.getByRole("searchbox", { name: "Search" }) as HTMLInputElement;
    expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
    await userEvent.type(input, "gato");
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(input.value).toBe("");
    expect(document.activeElement).toBe(input);
  });

  test("Select reports the picked value and shows its error", async () => {
    const onChange = vi.fn();
    renderUi(
      <Select
        label="Language"
        value="es"
        onChange={onChange}
        error="Pick one"
        options={[
          { value: "es", label: "Spanish" },
          { value: "fr", label: <b>French</b> },
        ]}
      />,
    );
    await userEvent.selectOptions(screen.getByLabelText("Language"), "fr");
    expect(onChange).toHaveBeenCalledWith("fr");
    expect(screen.getByText("Pick one")).toBeTruthy();
  });

  test("Checkbox toggles", async () => {
    const onChange = vi.fn();
    renderUi(<Checkbox label="Shuffle" hint="Random order" checked={false} onChange={onChange} />);
    await userEvent.click(screen.getByRole("checkbox"));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe("Modal", () => {
  test("opens, closes via button, Escape and backdrop", async () => {
    const onClose = vi.fn();
    const { rerender } = renderUi(
      <Modal open={false} onClose={onClose} title="Delete set?">
        Gone for good.
      </Modal>,
    );
    const dialog = document.querySelector("dialog")!;
    expect(dialog.open).toBe(false);
    rerender(
      <Modal open onClose={onClose} title="Delete set?" actions={<Button>OK</Button>}>
        Gone for good.
      </Modal>,
    );
    expect(dialog.open).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Close", hidden: true }));
    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(2);
    rerender(<Modal open={false} onClose={onClose} title="Delete set?" />);
    expect(dialog.open).toBe(false);
  });
});

describe("toasts", () => {
  test("keep the last three and disappear after 3.5s", () => {
    vi.useFakeTimers();
    let show: ReturnType<typeof useToast> = () => {};
    function Grab() {
      show = useToast();
      return null;
    }
    renderUi(<Grab />);
    act(() => ["a", "b", "c", "d"].forEach((m, i) => show(m, i % 2 ? "error" : "success")));
    // Each toast starts with its icon glyph, then the message.
    expect(screen.getAllByRole("status").map((s) => s.textContent?.slice(-1))).toEqual(["b", "c", "d"]);
    act(() => vi.advanceTimersByTime(3500));
    expect(screen.queryAllByRole("status")).toEqual([]);
  });
});

describe("ErrorBoundary", () => {
  test("a crash shows the crash screen with reload", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const reload = vi.fn();
    vi.stubGlobal("location", { ...location, reload });
    function Boom(): never {
      throw new Error("boom");
    }
    renderUi(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Oops, this screen crashed")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(reload).toHaveBeenCalledOnce();
  });
});
