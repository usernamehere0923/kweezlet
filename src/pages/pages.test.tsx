import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";
import { App } from "../App";
import { mockApi } from "../test/server";

const ME = { username: "demo", locale: "en" };

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("settings", () => {
  test("changing the language saves it on the server", async () => {
    const { calls } = mockApi({ "GET /api/me": () => ({ json: ME }), "PATCH /api/me/settings": () => ({ json: {} }) });
    renderAt("/settings");
    await userEvent.click(await screen.findByRole("radio", { name: "Deutsch" }));
    expect(await screen.findByLabelText("Aktuelles Passwort")).toBeTruthy();
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ locale: "de-CH" }));
    expect(await screen.findAllByRole("status")).toHaveLength(1);
  });

  async function fillPassword(current: string, next: string, repeat: string) {
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Current password"), current);
    await user.type(screen.getByLabelText("New password"), next);
    await user.type(screen.getByLabelText("Repeat new password"), repeat);
    await user.click(screen.getByRole("button", { name: "Change password" }));
  }

  test("password: mismatch is caught before sending", async () => {
    const { calls } = mockApi({ "GET /api/me": () => ({ json: ME }) });
    renderAt("/settings");
    await fillPassword("old-password", "new-password", "other-password");
    expect(await screen.findByText("The two passwords do not match")).toBeTruthy();
    expect(calls.some((c) => c.path === "/api/me/password")).toBe(false);
  });

  test("password: server field errors show under the fields", async () => {
    mockApi({
      "GET /api/me": () => ({ json: ME }),
      "POST /api/me/password": () => ({
        status: 400,
        json: { error: "validation", fields: { current: "wrong_password", next: "made_up_code" } },
      }),
    });
    renderAt("/settings");
    await fillPassword("old-password", "new-password", "new-password");
    expect(await screen.findByText("That is not your current password")).toBeTruthy();
    expect(screen.getByText("Invalid value")).toBeTruthy();
  });

  test("password: success clears the form", async () => {
    mockApi({ "GET /api/me": () => ({ json: ME }), "POST /api/me/password": () => ({ json: { ok: true } }) });
    renderAt("/settings");
    await fillPassword("old-password", "new-password", "new-password");
    expect(await screen.findByText(/Password changed/)).toBeTruthy();
    expect((screen.getByLabelText("Current password") as HTMLInputElement).value).toBe("");
  });

  test("logout goes back to the login page", async () => {
    const { calls } = mockApi({ "GET /api/me": () => ({ json: ME }), "POST /api/logout": () => ({ json: {} }) });
    renderAt("/settings");
    expect(await screen.findByText("Logged in as demo")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect(await screen.findByLabelText("Username")).toBeTruthy();
    expect(calls.some((c) => c.path === "/api/logout")).toBe(true);
  });
});

describe("design page", () => {
  test("every demo control can be used without crashing", async () => {
    const { calls } = mockApi({ "GET /api/me": () => ({ json: ME }), "POST /api/live/ping": () => ({ json: {} }) });
    renderAt("/design");
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
