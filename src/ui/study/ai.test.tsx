import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { renderUi } from "../../test/render";
import { CostLine, DraftCard, PageTile } from "..";

describe("CostLine", () => {
  test("after a run: cost, tokens, seconds; before it: an estimate", () => {
    const { rerender } = renderUi(<CostLine nanos={14_310_000} tokens={14_210} durationMs={38_400} />);
    expect(screen.getByText("$0.02 · 14,210 tokens · 39 s")).toBeTruthy();
    rerender(<CostLine nanos={0} tokens={2} durationMs={300} />);
    expect(screen.getByText("$0.00 · 2 tokens · 1 s")).toBeTruthy(); // a started second counts
    rerender(<CostLine estimate nanos={3_100_000} tokens={1} durationMs={5000} />);
    expect(screen.getByText("about 1 token · about $0.01")).toBeTruthy();
  });
});

describe("PageTile", () => {
  test("a toggle named after its page, with what the tile shows", async () => {
    const onToggle = vi.fn();
    const { rerender } = renderUi(<PageTile n={2} label="Kantone" scan used selected={false} onToggle={onToggle} />);
    const tile = screen.getByRole("button", { name: "Page 2: Kantone, scan, used" });
    expect(tile.getAttribute("aria-pressed")).toBe("false");
    await userEvent.click(tile);
    expect(onToggle).toHaveBeenCalledWith(true);

    rerender(<PageTile n={3} thumbnail="page3.png" selected onToggle={onToggle} />);
    const picked = screen.getByRole("button", { name: "Page 3" });
    expect(picked.getAttribute("aria-pressed")).toBe("true");
    expect(picked.querySelector("img")?.getAttribute("src")).toBe("page3.png");
    await userEvent.click(picked);
    expect(onToggle).toHaveBeenLastCalledWith(false);

    rerender(<PageTile n={4} selected={false} disabled onToggle={onToggle} />);
    expect((screen.getByRole("button", { name: "Page 4" }) as HTMLButtonElement).disabled).toBe(true);
  });

  test("at the limit a picked tile can still be unpicked, to swap a page", async () => {
    const onToggle = vi.fn();
    renderUi(<PageTile n={4} selected disabled onToggle={onToggle} />);
    await userEvent.click(screen.getByRole("button", { name: "Page 4" }));
    expect(onToggle).toHaveBeenCalledWith(false);
  });
});

describe("DraftCard", () => {
  const card = {
    index: 0,
    term: "el gato",
    definition: "the cat",
    source: "el gato, la gata",
    page: 5,
    verified: true,
    checked: true,
  };

  test("keep, edit, delete; the quote on demand", async () => {
    const onChange = vi.fn();
    const onCheck = vi.fn();
    const onDelete = vi.fn();
    const onSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    renderUi(
      <form onSubmit={onSubmit}>
        <DraftCard {...card} onChange={onChange} onCheck={onCheck} onDelete={onDelete} />
      </form>,
    );
    expect(screen.getByRole("group", { name: "Card 1" })).toBeTruthy();
    expect(screen.getByText("p. 5")).toBeTruthy();
    expect(screen.queryByText("Unverified")).toBeNull();

    await userEvent.click(screen.getByRole("checkbox", { name: "Keep card 1" }));
    expect(onCheck).toHaveBeenCalledWith(false);
    fireEvent.change(screen.getByLabelText("Definition"), { target: { value: "the kitten" } });
    expect(onChange).toHaveBeenCalledWith("el gato", "the kitten");
    fireEvent.change(screen.getByLabelText("Term"), { target: { value: "el gatito" } });
    expect(onChange).toHaveBeenLastCalledWith("el gatito", "the cat");
    // Enter in a cell does not submit the review form around the cards.
    await userEvent.type(screen.getByLabelText("Term"), "{Enter}");
    await userEvent.type(screen.getByLabelText("Definition"), "{Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Delete term" }));
    expect(onDelete).toHaveBeenCalled();

    expect(screen.queryByText("el gato, la gata")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Show source" }));
    expect(screen.getByText("el gato, la gata")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Hide source" }));
    expect(screen.queryByText("el gato, la gata")).toBeNull();
  });

  test("an unverified card says so; without a quote or a page it says that instead", () => {
    renderUi(
      <DraftCard
        {...card}
        source=""
        page={null}
        verified={false}
        checked={false}
        onChange={() => {}}
        onCheck={() => {}}
      />,
    );
    expect(screen.getByText("Unverified")).toBeTruthy();
    expect(screen.getByText("Quote not found in the material: check before keeping.")).toBeTruthy();
    expect(screen.getByText("No quote from the material.")).toBeTruthy();
    expect(screen.queryByText(/^p\. /)).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete term" })).toBeNull();
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
  });
});
