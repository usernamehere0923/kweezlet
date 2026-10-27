import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import { ME, renderApp } from "../test/render";
import { clientId } from "../lib/live";
import { mockApi } from "../test/server";

describe("settings", () => {
  test("changing the language saves it on the server", async () => {
    const { calls } = mockApi({ "GET /api/me": () => ({ json: ME }), "PATCH /api/me/settings": () => ({ json: {} }) });
    renderApp("/settings");
    await userEvent.click(await screen.findByRole("radio", { name: "Deutsch" }));
    expect(await screen.findByLabelText("Aktuelles Passwort")).toBeTruthy();
    await waitFor(() =>
      expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ locale: "de-CH", from: clientId }),
    );
    expect(await screen.findAllByRole("status")).toHaveLength(1);
  });

  test("the account's theme is applied, and picking another switches at once and saves it", async () => {
    const { calls } = mockApi({
      "GET /api/me": () => ({ json: { ...ME, theme: "unicorn-sneeze" } }),
      "PATCH /api/me/settings": () => ({ json: {} }),
    });
    renderApp("/settings");
    const current = await screen.findByRole("radio", { name: "Unicorn Sneeze" });
    expect(current.getAttribute("aria-checked")).toBe("true");
    expect(document.documentElement.dataset.theme).toBe("unicorn-sneeze");

    await userEvent.click(screen.getByRole("radio", { name: "Midnight Cram" }));
    expect(document.documentElement.dataset.theme).toBe("midnight-cram");
    await waitFor(() =>
      expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ theme: "midnight-cram", from: clientId }),
    );
    expect(await screen.findAllByRole("status")).toHaveLength(1);
  });

  test("a theme the server didn't save switches back", async () => {
    mockApi({ "GET /api/me": () => ({ json: ME }), "PATCH /api/me/settings": () => ({ status: 500, json: {} }) });
    renderApp("/settings");
    await userEvent.click(await screen.findByRole("radio", { name: "Ballpoint Blues" }));
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("cardigan"));
    expect(screen.getByRole("radio", { name: "Grandma's Cardigan" }).getAttribute("aria-checked")).toBe("true");
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
    renderApp("/settings");
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
    renderApp("/settings");
    await fillPassword("old-password", "new-password", "new-password");
    expect(await screen.findByText("That is not your current password")).toBeTruthy();
    expect(screen.getByText("Invalid value")).toBeTruthy();
  });

  test("password: success clears the form", async () => {
    mockApi({ "GET /api/me": () => ({ json: ME }), "POST /api/me/password": () => ({ json: { ok: true } }) });
    renderApp("/settings");
    await fillPassword("old-password", "new-password", "new-password");
    expect(await screen.findByText(/Password changed/)).toBeTruthy();
    expect((screen.getByLabelText("Current password") as HTMLInputElement).value).toBe("");
  });

  test("logout goes back to the login page", async () => {
    const { calls } = mockApi({ "GET /api/me": () => ({ json: ME }), "POST /api/logout": () => ({ json: {} }) });
    renderApp("/settings");
    expect(await screen.findByText("Logged in as demo")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect(await screen.findByLabelText("Username")).toBeTruthy();
    expect(calls.some((c) => c.path === "/api/logout")).toBe(true);
  });

  test("AI usage: this month against the budget, all time, the last runs", async () => {
    mockApi({
      "GET /api/me": () => ({ json: ME }),
      "GET /api/ai/usage": () => ({
        json: {
          monthNanos: 14_310_000,
          totalNanos: 52_000_000,
          capNanos: 2_000_000_000,
          recent: [
            {
              createdAt: 1_761_550_000,
              action: "more",
              inputTokens: 12_000,
              cachedTokens: 0,
              outputTokens: 2_210,
              costNanos: 14_310_000,
            },
          ],
        },
      }),
    });
    renderApp("/settings");
    expect(await screen.findByText("This month: $0.02 of $2.00")).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "Monthly AI budget used" }).getAttribute("aria-valuenow")).toBe(
      "14310000",
    );
    expect(screen.getByText("All time: $0.06")).toBeTruthy();
    expect(screen.getByText("More cards")).toBeTruthy();
    expect(screen.getByText("14,210 tokens")).toBeTruthy();
  });

  test("AI usage without a budget (admins), and before the first run", async () => {
    mockApi({
      "GET /api/me": () => ({ json: ME }),
      "GET /api/ai/usage": () => ({ json: { monthNanos: 0, totalNanos: 0, capNanos: null, recent: [] } }),
    });
    renderApp("/settings");
    expect(await screen.findByText("This month: $0.00, no limit")).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getByText("No AI runs yet.")).toBeTruthy();
  });

  test("AI usage past the budget says it is used up", async () => {
    mockApi({
      "GET /api/me": () => ({ json: ME }),
      "GET /api/ai/usage": () => ({
        json: { monthNanos: 2_030_000_000, totalNanos: 2_030_000_000, capNanos: 2_000_000_000, recent: [] },
      }),
    });
    renderApp("/settings");
    expect(await screen.findByText("This month: $2.03 of $2.00")).toBeTruthy();
    expect(screen.getByText(/^The budget is used up. It starts again on the 1st, at midnight UTC/)).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("2000000000");
  });
});
