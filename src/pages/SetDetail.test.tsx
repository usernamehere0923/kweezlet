import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import { LEARN_DETAIL, SPANISH_DETAIL, studyRoutes } from "../test/fixtures";
import { ME, renderApp } from "../test/render";
import { mockApi } from "../test/server";

describe("set detail", () => {
  test("set detail shows the terms and starts flashcards", async () => {
    mockApi({ "GET /api/me": () => ({ json: ME }), "GET /api/sets/7": () => ({ json: SPANISH_DETAIL }) });
    renderApp("/sets/7");
    expect(await screen.findByRole("heading", { level: 1, name: "Spanish animals" })).toBeTruthy();
    expect(screen.getByText("chapter 1")).toBeTruthy();
    expect(screen.getByText("el perro")).toBeTruthy();
    expect(screen.getByText("the dog")).toBeTruthy();
    expect(screen.getByText("Known 1")).toBeTruthy();
    expect(screen.getByText("Learning 0")).toBeTruthy();
    expect(screen.getByText("New 1")).toBeTruthy();
    // Each term says where it stands (a dot, named for screen readers).
    const [perro, gato] = screen.getAllByRole("listitem");
    expect(perro.textContent).toContain("Newel perro");
    expect(gato.textContent).toContain("Knownel gato");
    expect(screen.getByRole("button", { name: "Flashcards" })).toBeTruthy();
  });

  test("the Match tile shows the best time and opens the game", async () => {
    mockApi(studyRoutes({ ...LEARN_DETAIL, bestSeconds: 23 }));
    renderApp("/sets/7");
    expect(await screen.findByText("Best time 0:23")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /Match/ }));
    expect(await screen.findByText("Time 0:00")).toBeTruthy();
  });

  test("the Match tile is greyed out when the set has too few terms", async () => {
    mockApi({ "GET /api/me": () => ({ json: ME }), "GET /api/sets/7": () => ({ json: SPANISH_DETAIL }) });
    renderApp("/sets/7");
    expect(await screen.findByText("Match needs at least 3 terms")).toBeTruthy();
    expect((screen.getByRole("button", { name: /Match/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  test("a set that is gone shows the not-found screen", async () => {
    mockApi({ "GET /api/me": () => ({ json: ME }), "GET /api/sets/7": () => ({ status: 404 }) });
    renderApp("/sets/7");
    expect(await screen.findByText("Page not found")).toBeTruthy();
  });

  test("deleting a set asks first, then deletes", async () => {
    const { calls } = mockApi({
      "GET /api/me": () => ({ json: ME }),
      "GET /api/sets": () => ({ json: [] }),
      "GET /api/sets/7": () => ({ json: SPANISH_DETAIL }),
      "DELETE /api/sets/7": () => ({ json: { ok: true } }),
    });
    renderApp("/sets/7");
    await userEvent.click(await screen.findByRole("button", { name: "Delete set" }));
    expect(await screen.findByText("Delete this set?")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE" && c.path === "/api/sets/7")).toBe(true));
    expect(await screen.findByText("Set deleted")).toBeTruthy();
  });

  test("a delete that fails offline closes the dialog and keeps the set", async () => {
    mockApi({
      "GET /api/me": () => ({ json: ME }),
      "GET /api/sets/7": () => ({ json: SPANISH_DETAIL }),
      "DELETE /api/sets/7": () => {
        throw new TypeError("Failed to fetch");
      },
    });
    renderApp("/sets/7");
    await userEvent.click(await screen.findByRole("button", { name: "Delete set" }));
    await userEvent.click(await screen.findByRole("button", { name: "Delete" }));
    expect(await screen.findByText("No connection to the server.")).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByText("Set deleted")).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Spanish animals" })).toBeTruthy();
  });
});
