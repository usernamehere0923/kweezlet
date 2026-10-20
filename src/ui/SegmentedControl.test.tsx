import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";
import { renderUi } from "../test/render";
import { SegmentedControl } from ".";

describe("SegmentedControl pill", () => {
  function Choice() {
    const [v, setV] = useState("a");
    return (
      <SegmentedControl
        label="Pick"
        value={v}
        onChange={setV}
        options={[
          { value: "a", label: "Apple" },
          { value: "b", label: "Banana" },
        ]}
      />
    );
  }

  test("sits under the active option and follows the choice", async () => {
    const observed: Element[] = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = (el: Element) => observed.push(el);
        disconnect = () => {};
      },
    );
    // jsdom lays nothing out: every option is 50px wide.
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(50);
    renderUi(<Choice />);
    const pill = screen.getByTestId("segment-pill");
    expect(pill.hasAttribute("data-placed")).toBe(true);
    expect(observed).toHaveLength(1);
    const banana = screen.getByRole("radio", { name: "Banana" });
    Object.defineProperty(banana, "offsetLeft", { value: 70 });
    Object.defineProperty(banana, "offsetWidth", { value: 80 });
    await userEvent.click(banana);
    expect(pill.style.translate).toBe("70px 0");
    expect(pill.style.width).toBe("80px");
  });

  test("hidden (no width): waits, so it doesn't fly in when shown", () => {
    renderUi(<Choice />);
    expect(screen.getByTestId("segment-pill").hasAttribute("data-placed")).toBe(false);
  });
});
