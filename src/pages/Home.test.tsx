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

  test("folders filter the sets and name each set's folder", async () => {
    const { calls } = mockApi({
      "GET /api/me": () => ({ json: ME }),
      "GET /api/folders": () => ({ json: [{ id: 3, name: "Languages", setCount: 1 }] }),
      "GET /api/sets": (_body, query) => ({
        json: [
          { ...SPANISH, folderId: 3 },
          { ...SWISS, folderId: null },
        ].filter(
          (s) => !query.folder || (query.folder === "none" ? s.folderId === null : String(s.folderId) === query.folder),
        ),
      }),
    });
    renderApp("/");
    expect(await screen.findByText("Spanish animals")).toBeTruthy();
    // All sets: each card names its folder.
    expect(await screen.findByText("Languages", { selector: "span" })).toBeTruthy();

    await userEvent.selectOptions(screen.getByLabelText("Folder"), "3");
    await waitFor(() => expect(calls.filter((c) => c.path === "/api/sets").at(-1)?.query.folder).toBe("3"));
    expect(await screen.findByText("Spanish animals")).toBeTruthy();
    expect(screen.queryByText("Swiss history")).toBeNull();
    // A picked folder can be edited.
    expect(screen.getByRole("button", { name: "Edit folder" })).toBeTruthy();

    await userEvent.selectOptions(screen.getByLabelText("Folder"), "none");
    expect(await screen.findByText("Swiss history")).toBeTruthy();
    expect(screen.queryByText("Spanish animals")).toBeNull();
  });

  test("an empty folder says so; its editor renames and deletes it", async () => {
    let name = "Languages";
    const { calls } = mockApi({
      "GET /api/me": () => ({ json: ME }),
      "GET /api/folders": () => ({ json: name ? [{ id: 3, name, setCount: 0 }] : [] }),
      "GET /api/sets": (_body, query) => ({ json: query.folder ? [] : [SWISS] }),
      "PATCH /api/folders/3": (body) =>
        (body as { name: string }).name === "taken"
          ? { status: 400, json: { error: "validation", fields: { name: "taken" } } }
          : { json: { id: 3, name: (name = (body as { name: string }).name) } },
      "DELETE /api/folders/3": () => {
        name = "";
        return { json: { ok: true } };
      },
    });
    renderApp("/?folder=3");
    expect(await screen.findByText("No sets here")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Edit folder" }));
    const dialog = screen.getByRole("dialog");
    const field = within(dialog).getByLabelText("Name");
    expect((field as HTMLInputElement).value).toBe("Languages");
    await userEvent.clear(field);
    await userEvent.type(field, "taken");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByText("You already have a folder with this name")).toBeTruthy();
    await userEvent.clear(field);
    await userEvent.type(field, "Español");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Folder renamed")).toBeTruthy();
    expect(calls.find((c) => c.method === "PATCH" && (c.body as { name: string }).name === "Español")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Edit folder" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete folder" }));
    expect(await screen.findByText("Folder deleted")).toBeTruthy();
    expect(await screen.findByText("Swiss history")).toBeTruthy();
    expect((screen.queryByLabelText("Folder") as HTMLSelectElement | null)?.value ?? "all").toBe("all");
  });

  test("a folder that is gone falls back to all sets", async () => {
    mockApi({
      "GET /api/me": () => ({ json: ME }),
      "GET /api/sets": (_body, query) =>
        query.folder
          ? { status: 400, json: { error: "validation", fields: { folder: "invalid_type" } } }
          : { json: [SWISS] },
    });
    renderApp("/?folder=nope");
    expect(await screen.findByText("Swiss history")).toBeTruthy();
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
      { ...draft, id: 7, status: "ready", sourceName: "pasted", cardCount: 3 },
      { ...draft, id: 6, status: "ready", sourceName: "photo", cardCount: 1 },
    ];
    await waitFor(() => expect(FakeSocket.instances.length).toBeGreaterThan(0));
    await act(async () => FakeSocket.last.receive(JSON.stringify({ topic: "ai", data: {} })));
    expect(await screen.findByRole("heading", { name: "4 unfinished AI drafts" })).toBeTruthy();
    expect(screen.getByText("12 cards")).toBeTruthy();
    expect(screen.getByText("Failed")).toBeTruthy();
    // Every draft is listed (Home is the only way back to one); pasted text has a name.
    expect(screen.getAllByRole("link", { name: "Open" })).toHaveLength(4);
    expect(screen.getByText("Pasted text")).toBeTruthy();
    expect(screen.getByText("Photos")).toBeTruthy();

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
