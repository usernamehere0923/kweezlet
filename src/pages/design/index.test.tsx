import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import { ME, renderApp } from "../../test/render";
import { mockApi } from "../../test/server";

describe("design page", () => {
  test("is reachable by URL only, not from the menu", async () => {
    mockApi({ "GET /api/me": () => ({ json: ME }) });
    renderApp("/design");
    expect(await screen.findByRole("main")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Design" })).toBeNull();
    expect(screen.getAllByRole("link", { name: "Settings" }).length).toBeGreaterThan(0);
  });

  test("?theme= previews the page in a theme without changing the account's", async () => {
    const { calls } = mockApi({ "GET /api/me": () => ({ json: ME }) });
    const { container } = renderApp("/design?theme=kung-fu");
    expect((await screen.findByRole("radio", { name: "I Know Kung Fu" })).getAttribute("aria-checked")).toBe("true");
    expect(container.querySelector('main [data-theme="kung-fu"] h2')).toBeTruthy();
    expect(document.documentElement.dataset.theme).toBe("cardigan");

    await userEvent.click(screen.getByRole("radio", { name: "Ballpoint Blues" }));
    expect(container.querySelector('main [data-theme="ballpoint"] h2')).toBeTruthy();
    expect(document.documentElement.dataset.theme).toBe("cardigan");
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);
  });

  test("every demo control can be used without crashing", async () => {
    const { calls } = mockApi({ "GET /api/me": () => ({ json: ME }), "POST /api/live/ping": () => ({ json: {} }) });
    renderApp("/design");
    const main = await screen.findByRole("main");
    const user = userEvent.setup();
    for (const box of within(main).getAllByRole("textbox")) {
      if (!(box as HTMLInputElement).disabled && !(box as HTMLInputElement).readOnly) await user.type(box, "x{Enter}");
    }
    for (const select of within(main).getAllByRole("combobox")) {
      const last = select.querySelectorAll("option");
      await user.selectOptions(select, last[last.length - 1]);
    }
    for (const button of within(main).getAllByRole("button")) {
      if (button.isConnected && !(button as HTMLButtonElement).disabled) await user.click(button);
    }
    await waitFor(() => expect(calls.some((c) => c.path === "/api/live/ping")).toBe(true));
    expect(screen.queryByText("Oops, this screen crashed")).toBeNull();
  });
});
