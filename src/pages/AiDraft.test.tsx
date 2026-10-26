import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import { ME, renderApp } from "../test/render";
import { FakeSocket, mockApi } from "../test/server";

const DRAFT = {
  id: 9,
  status: "running",
  error: null,
  sourceName: "kurs.pdf",
  kind: "auto",
  madeKind: null,
  maxCards: 0,
  title: "",
  termLang: null,
  defLang: null,
  instructions: "",
  setId: null,
  notes: "",
  added: 0,
  skipped: 0,
  cards: [] as unknown[],
  pages: [{ n: 1, image: false }],
  cost: { nanos: 0, tokens: 0, durationMs: 0 },
  updatedAt: 0,
};
const READY = {
  ...DRAFT,
  status: "ready",
  title: "Animals",
  notes: "Page 3 had nothing to learn.",
  cards: [{ term: "el perro", definition: "the dog", source: "el perro", page: 1, verified: true, checked: true }],
  cost: { nanos: 14_310_000, tokens: 14_210, durationMs: 38_000 },
};

describe("a draft", () => {
  test("shows the run while it goes, and the cards when the live update says it is done", async () => {
    let draft: unknown = DRAFT;
    mockApi({ "GET /api/me": () => ({ json: ME }), "GET /api/ai/drafts/9": () => ({ json: draft }) });
    renderApp("/create/ai/9");
    expect(await screen.findByText("Making cards…")).toBeTruthy();

    draft = READY;
    await waitFor(() => expect(FakeSocket.instances.length).toBeGreaterThan(0));
    await act(async () => {
      FakeSocket.last.receive(JSON.stringify({ topic: "ai", data: { draftId: 9 } }));
    });
    expect(await screen.findByRole("heading", { level: 1, name: "Animals" })).toBeTruthy();
    expect(screen.getByText("1 card is ready.")).toBeTruthy();
    expect(screen.getByText("$0.02 · 14,210 tokens · 38 s")).toBeTruthy();
    expect(screen.getByText("Page 3 had nothing to learn.")).toBeTruthy();
    expect(screen.getByText("el perro")).toBeTruthy();
  });

  test("a failed run says why and can be tried again", async () => {
    const { calls } = mockApi({
      "GET /api/me": () => ({ json: ME }),
      "GET /api/ai/drafts/9": () => ({ json: { ...DRAFT, status: "failed", error: "ai_busy" } }),
      "POST /api/ai/drafts/9/regenerate": () => ({ status: 202, json: { ok: true } }),
    });
    renderApp("/create/ai/9");
    expect(await screen.findByText("The AI is busy. Try again in a minute.")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() =>
      expect(calls.find((c) => c.path === "/api/ai/drafts/9/regenerate")?.body).toEqual({ kind: "auto" }),
    );
  });

  test("a refused retry says why; a failed More cards keeps its cards and offers no retry", async () => {
    let draft: unknown = { ...DRAFT, status: "failed", error: "ai_busy" };
    mockApi({
      "GET /api/me": () => ({ json: ME }),
      "GET /api/ai/drafts/9": () => ({ json: draft }),
      "POST /api/ai/drafts/9/regenerate": () => ({ status: 402, json: { error: "ai_cap", capNanos: 2_000_000_000 } }),
    });
    const { unmount } = renderApp("/create/ai/9");
    await userEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(
      await screen.findByText("The monthly AI budget of $2.00 is used up. It starts again on the 1st."),
    ).toBeTruthy();
    unmount();

    draft = { ...READY, status: "failed", error: "ai_busy" };
    renderApp("/create/ai/9");
    expect(await screen.findByText("The AI is busy. Try again in a minute.")).toBeTruthy();
    expect(screen.getByText("el perro")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  test("a draft that is gone says so", async () => {
    mockApi({ "GET /api/me": () => ({ json: ME }), "GET /api/ai/drafts/9": () => ({ status: 404, json: {} }) });
    renderApp("/create/ai/9");
    expect(await screen.findByText("This draft is gone")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Cards from material" })).toBeTruthy();
  });
});
