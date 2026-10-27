import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import { SPANISH, SWISS } from "../test/fixtures";
import { ME, renderApp } from "../test/render";
import { FakeSocket, mockApi } from "../test/server";

describe("home", () => {
  test("home lists my sets and finds them by search", async () => {
    const { calls } = mockApi({
      "GET /api/me": () => ({ json: ME }),
      "GET /api/sets": (_body, query) => ({
        json: [SPANISH, SWISS].filter((s) => !query.q || s.title.toLowerCase().includes(query.q.toLowerCase())),
      }),
    });
    renderApp("/");
    expect(await screen.findByText("Spanish animals")).toBeTruthy();
    expect(screen.getByText("Swiss history")).toBeTruthy();
    // Each card shows how far along it is: one of the two Spanish terms is known.
    const bars = screen.getAllByRole("progressbar");
    expect(bars.map((bar) => [bar.getAttribute("aria-valuenow"), bar.getAttribute("aria-valuemax")])).toEqual([
      ["1", "2"],
      ["0", "1"],
    ]);

    await userEvent.type(screen.getByRole("searchbox", { name: "Search your sets" }), "swiss");
    await waitFor(() => expect(calls.filter((c) => c.path === "/api/sets").at(-1)?.query.q).toBe("swiss"));
    expect(screen.getByText("Swiss history")).toBeTruthy();
    expect(screen.queryByText("Spanish animals")).toBeNull();
  });

  test("home shows the streak, with a nudge until today is studied", async () => {
    const studied = { streak: 4, studiedToday: false };
    const { calls } = mockApi({
      "GET /api/me": () => ({ json: ME }),
      "GET /api/sets": () => ({ json: [SPANISH] }),
      "GET /api/study/streak": () => ({ json: studied }),
    });
    renderApp("/");
    expect(await screen.findByText("4 day streak")).toBeTruthy();
    expect(screen.getByText("Study today to keep it")).toBeTruthy();
    expect(calls.find((c) => c.path === "/api/study/streak")?.query.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("home hides the nudge once today is studied", async () => {
    mockApi({
      "GET /api/me": () => ({ json: ME }),
      "GET /api/sets": () => ({ json: [SPANISH] }),
      "GET /api/study/streak": () => ({ json: { streak: 5, studiedToday: true } }),
    });
    renderApp("/");
    expect(await screen.findByText("5 day streak")).toBeTruthy();
    expect(screen.queryByText("Study today to keep it")).toBeNull();
  });

  test("home offers to create the first set when there are none", async () => {
    mockApi({ "GET /api/me": () => ({ json: ME }), "GET /api/sets": () => ({ json: [] }) });
    renderApp("/");
    expect(await screen.findByText("No sets yet")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Create your first set" })).toBeTruthy();
  });

  test("a search without hits can be cleared", async () => {
    mockApi({
      "GET /api/me": () => ({ json: ME }),
      "GET /api/sets": (_body, query) => ({
        json: [SPANISH, SWISS].filter((s) => !query.q || s.title.toLowerCase().includes(query.q.toLowerCase())),
      }),
    });
    renderApp("/");
    await userEvent.type(await screen.findByRole("searchbox", { name: "Search your sets" }), "zzz");
    expect(await screen.findByText("Nothing matches your search")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(await screen.findByText("Spanish animals")).toBeTruthy();
  });

  test("a typed word is one search, not one per letter", async () => {
    const { calls } = mockApi({
      "GET /api/me": () => ({ json: ME }),
      "GET /api/sets": () => ({ json: [SPANISH, SWISS] }),
    });
    renderApp("/");
    await userEvent.type(await screen.findByRole("searchbox", { name: "Search your sets" }), "swiss");
    await waitFor(() => expect(calls.filter((c) => c.path === "/api/sets").at(-1)?.query.q).toBe("swiss"));
    expect(calls.filter((c) => c.path === "/api/sets" && c.query.q)).toHaveLength(1);
  });

  test("the search box keeps focus when the hits run out", async () => {
    mockApi({
      "GET /api/me": () => ({ json: ME }),
      "GET /api/sets": (_body, query) => ({
        json: [SPANISH, SWISS].filter((s) => !query.q || s.title.toLowerCase().includes(query.q.toLowerCase())),
      }),
    });
    renderApp("/");
    const box = await screen.findByRole("searchbox", { name: "Search your sets" });
    await userEvent.type(box, "sx");
    expect(await screen.findByText("Nothing matches your search")).toBeTruthy();
    expect(document.activeElement).toBe(box);
    expect((box as HTMLInputElement).value).toBe("sx");
  });

  test("unfinished AI drafts are found again here, and follow their runs", async () => {
    const draft = { id: 9, status: "running", title: "", sourceName: "kurs.pdf", cardCount: 0, updatedAt: 0 };
    let drafts = [draft];
    mockApi({
      "GET /api/me": () => ({ json: ME }),
      "GET /api/sets": () => ({ json: [SPANISH] }),
      "GET /api/ai/drafts": () => ({ json: { drafts } }),
    });
    renderApp("/");
    const card = (await screen.findByRole("heading", { name: "1 unfinished AI draft" })).parentElement!;
    expect(within(card).getByText("kurs.pdf")).toBeTruthy();
    expect(within(card).getByText("Making cards…")).toBeTruthy();
    expect(within(card).getByRole("link", { name: "Open" }).getAttribute("href")).toBe("/create/ai/9");
    expect(screen.getByRole("link", { name: "From material" }).getAttribute("href")).toBe("/create/ai");

    drafts = [
      { ...draft, status: "ready", title: "Kantone", cardCount: 12 },
      { ...draft, id: 8, status: "failed", cardCount: 0 },
    ];
    await waitFor(() => expect(FakeSocket.instances.length).toBeGreaterThan(0));
    await act(async () => FakeSocket.last.receive(JSON.stringify({ topic: "ai", data: {} })));
    expect(await screen.findByRole("heading", { name: "2 unfinished AI drafts" })).toBeTruthy();
    expect(screen.getByText("12 cards")).toBeTruthy();
    expect(screen.getByText("Failed")).toBeTruthy();

    drafts = [];
    await act(async () => FakeSocket.last.receive(JSON.stringify({ topic: "ai", data: {} })));
    await waitFor(() => expect(screen.queryByRole("heading", { name: /unfinished AI draft/ })).toBeNull());
  });

  test("with no sets yet, a set can also come from material", async () => {
    mockApi({ "GET /api/me": () => ({ json: ME }), "GET /api/sets": () => ({ json: [] }) });
    renderApp("/");
    expect((await screen.findByRole("link", { name: "From material" })).getAttribute("href")).toBe("/create/ai");
  });
});
