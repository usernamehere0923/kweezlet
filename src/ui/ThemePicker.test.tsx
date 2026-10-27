import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { THEMES } from "../../worker/themes";
import { renderUi } from "../test/render";
import { ThemePicker } from "./ThemePicker";

describe("ThemePicker", () => {
  test("one radio per theme, by name, the current one checked", () => {
    renderUi(<ThemePicker label="Theme" value="ballpoint" onChange={() => {}} />);
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(THEMES.length);
    expect(screen.getByRole("radio", { name: "Ballpoint Blues" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: "Grandma's Cardigan" }).getAttribute("aria-checked")).toBe("false");
  });

  test("each tile previews its own theme", () => {
    const { container } = renderUi(<ThemePicker label="Theme" value="cardigan" onChange={() => {}} />);
    const previews = [...container.querySelectorAll("[data-theme]")].map((el) => el.getAttribute("data-theme"));
    expect(previews).toEqual([...THEMES]);
  });

  test("picking a tile reports its theme", async () => {
    const onChange = vi.fn();
    renderUi(<ThemePicker label="Theme" value="cardigan" onChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: "I Know Kung Fu" }));
    expect(onChange).toHaveBeenCalledWith("kung-fu");
  });
});
