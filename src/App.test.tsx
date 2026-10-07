import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { SERVER_ERROR_EVENT } from "./lib/api";
import { clientId } from "./lib/live";
import { ME, renderApp } from "./test/render";
import { FakeSocket, mockApi } from "./test/server";

describe("login", () => {
  test("anonymous user sees the login page and can sign in", async () => {
    const { calls } = mockApi({
      "GET /api/me": () => ({ status: 401 }),
      "POST /api/login": () => ({ json: ME }),
    });
    renderApp();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Username"), "demo");
    await user.type(screen.getByLabelText("Password"), "demo");
    await user.click(screen.getByRole("button", { name: "Log in" }));
    expect((await screen.findAllByRole("navigation", { name: "Main navigation" })).length).toBeGreaterThan(0);
    expect(calls.find((c) => c.path === "/api/login")?.body).toEqual({ username: "demo", password: "demo" });
  });

  test.each([
    [401, "Wrong username or password."],
    [429, "Too many attempts. Try again in 15 minutes."],
  ])("login answering %i shows an error", async (status, message) => {
    mockApi({ "GET /api/me": () => ({ status: 401 }), "POST /api/login": () => ({ status }) });
    renderApp();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Username"), "demo");
    await user.type(screen.getByLabelText("Password"), "nope");
    await user.click(screen.getByRole("button", { name: "Log in" }));
    expect((await screen.findByRole("alert")).textContent).toContain(message);
  });

  test("switching the language on the login page", async () => {
    mockApi({ "GET /api/me": () => ({ status: 401 }) });
    renderApp();
    await userEvent.setup().click(await screen.findByRole("radio", { name: "Deutsch" }));
    expect(await screen.findByLabelText("Benutzername")).toBeTruthy();
    expect(localStorage.getItem("kz_locale")).toBe("de-CH");
  });

  test("offline at start falls back to the login page", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    renderApp();
    expect(await screen.findByLabelText("Username")).toBeTruthy();
  });
});

describe("logged in", () => {
  test("unknown route shows not found", async () => {
    mockApi({ "GET /api/me": () => ({ json: ME }) });
    renderApp("/nope");
    expect(await screen.findByText("Page not found")).toBeTruthy();
  });

  test("a 401 from any call sends the user back to the login page", async () => {
    // Session expired: saving a setting answers 401. Not logout, which leaves anyway.
    mockApi({ "GET /api/me": () => ({ json: ME }), "PATCH /api/me/settings": () => ({ status: 401 }) });
    renderApp("/settings");
    await userEvent.setup().click(await screen.findByRole("radio", { name: "Deutsch" }));
    expect(await screen.findByLabelText("Benutzername")).toBeTruthy();
  });

  test("server errors show a toast", async () => {
    mockApi({ "GET /api/me": () => ({ json: ME }) });
    renderApp();
    await screen.findAllByRole("navigation", { name: "Main navigation" });
    act(() => {
      window.dispatchEvent(new CustomEvent(SERVER_ERROR_EVENT, { detail: "server" }));
      window.dispatchEvent(new CustomEvent(SERVER_ERROR_EVENT, { detail: "offline" }));
    });
    expect((await screen.findAllByRole("status")).length).toBeGreaterThan(0);
  });
});

describe("live sync", () => {
  test("connects, reacts to settings and ping, reconnects after a drop", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { calls } = mockApi({ "GET /api/me": () => ({ json: ME }) });
    renderApp();
    await screen.findAllByRole("navigation", { name: "Main navigation" });
    await act(() => vi.advanceTimersByTimeAsync(1));
    const ws = FakeSocket.last;
    expect(ws.url).toMatch(/^ws:\/\/.*\/api\/live$/);
    act(() => ws.open());
    await act(() => vi.advanceTimersByTimeAsync(25_000));
    expect(ws.sent).toContain("ping");

    const before = calls.filter((c) => c.path === "/api/me").length;
    act(() => {
      ws.receive("pong");
      ws.receive("not json");
      ws.receive(JSON.stringify({ topic: "settings" }));
      ws.receive(JSON.stringify({ topic: "ping", data: { from: "other-device" } }));
      ws.receive(JSON.stringify({ topic: "ping", data: { from: clientId } }));
    });
    await waitFor(() => expect(calls.filter((c) => c.path === "/api/me").length).toBe(before + 1));
    expect(await screen.findByText(/other device/i)).toBeTruthy();

    act(() => ws.drop());
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(FakeSocket.instances.length).toBe(2);
    act(() => FakeSocket.last.open());
    await waitFor(() => expect(calls.filter((c) => c.path === "/api/me").length).toBe(before + 2));

    act(() => FakeSocket.last.drop());
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(FakeSocket.instances.length).toBe(3);
  });
});
