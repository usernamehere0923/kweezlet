import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
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
const DOG = {
  term: "el perro",
  definition: "the dog",
  source: "el perro — the dog",
  page: 1,
  verified: true,
  checked: true,
};
const CAT = { term: "el gato", definition: "the cat", source: "", page: 2, verified: false, checked: false };
const READY = {
  ...DRAFT,
  status: "ready",
  madeKind: "vocabulary",
  title: "Animals",
  termLang: "es",
  defLang: "en",
  notes: "Page 3 had nothing to learn.",
  added: 2,
  cards: [DOG, CAT],
  cost: { nanos: 14_310_000, tokens: 14_210, durationMs: 38_000 },
};
const SETS = [{ id: 4, title: "Spanish" }];

/** The draft routes, answering with `draft()`; PATCH stores what it gets, like the server. */
function draftApi(start: unknown, extra: Parameters<typeof mockApi>[0] = {}) {
  const state = { draft: start as Record<string, unknown> };
  const api = mockApi({
    "GET /api/me": () => ({ json: ME }),
    "GET /api/sets": () => ({ json: SETS }),
    "GET /api/ai/drafts/9": () => ({ json: state.draft }),
    "PATCH /api/ai/drafts/9": (body) => {
      state.draft = { ...state.draft, ...(body as object) };
      return { json: { ok: true } };
    },
    ...extra,
  });
  return { ...api, state };
}

const card = (n: number) => screen.getByRole("group", { name: `Card ${n}` });
const live = () => act(async () => FakeSocket.last.receive(JSON.stringify({ topic: "ai", data: {} })));

describe("a draft", () => {
  test("shows the run while it goes, then the cards: unverified ones unchecked", async () => {
    const { state } = draftApi(DRAFT);
    renderApp("/create/ai/9");
    expect(await screen.findByText("Making cards…")).toBeTruthy();

    state.draft = READY;
    await waitFor(() => expect(FakeSocket.instances.length).toBeGreaterThan(0));
    await live();
    expect(await screen.findByRole("heading", { level: 1, name: "Animals" })).toBeTruthy();
    expect(screen.getByText("2 cards · 1 unverified · Vocabulary · Español → English")).toBeTruthy();
    expect(screen.getByText("$0.02 · 14,210 tokens · 38 s")).toBeTruthy();
    expect(screen.getByText("Page 3 had nothing to learn.")).toBeTruthy();
    expect(within(card(1)).getByRole<HTMLInputElement>("checkbox").checked).toBe(true);
    expect(within(card(2)).getByRole<HTMLInputElement>("checkbox").checked).toBe(false);
    expect(within(card(2)).getByText("Unverified")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save 1 card" })).toBeTruthy();
    // Only a More cards run says what it added.
    expect(screen.queryByText(/^Last run/)).toBeNull();
  });

  test("edits save as the user goes: typing after a pause, a tap at once", async () => {
    const { calls } = draftApi(READY);
    renderApp("/create/ai/9");
    const term = within(await screen.findByRole("group", { name: "Card 1" })).getByRole("textbox", { name: "Term" });
    await userEvent.clear(term);
    await userEvent.type(term, "el perrito");
    await waitFor(() => expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(1));
    expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({
      cards: [{ ...DOG, term: "el perrito" }, CAT],
      title: "Animals",
      termLang: "es",
      defLang: "en",
      setId: null,
    });

    await userEvent.click(within(card(2)).getByRole("checkbox"));
    await waitFor(() => expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(2));
    expect(screen.getByRole("button", { name: "Save 2 cards" })).toBeTruthy();

    await userEvent.click(within(card(1)).getByRole("button", { name: "Delete term" }));
    await waitFor(() => expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(3));
    expect((calls.at(-1)?.body as { cards: unknown[] }).cards).toEqual([{ ...CAT, checked: true }]);
  });

  test("a live reload never resets a card being typed in", async () => {
    const { state } = draftApi(READY);
    renderApp("/create/ai/9");
    const term = within(await screen.findByRole("group", { name: "Card 1" })).getByRole("textbox", { name: "Term" });
    await waitFor(() => expect(FakeSocket.instances.length).toBeGreaterThan(0));
    // Typed, not sent yet: a reload with the old cards keeps what was typed.
    fireEvent.change(term, { target: { value: "el perro " } });
    await live();
    expect((term as HTMLTextAreaElement).value).toBe("el perro ");
    // Sent and stored trimmed: the echo of that keeps the space being typed.
    await waitFor(() => expect((state.draft.cards as { term: string }[])[0]!.term).toBe("el perro "));
    state.draft = { ...state.draft, cards: [DOG, CAT] };
    await live();
    expect((term as HTMLTextAreaElement).value).toBe("el perro ");
    // Another device's edit comes in once nothing of ours waits.
    state.draft = { ...state.draft, cards: [{ ...DOG, term: "the other device" }, CAT] };
    await live();
    await waitFor(() => expect((term as HTMLTextAreaElement).value).toBe("the other device"));
  });

  test("saving to a new set sends the waiting edits first, then goes to the set", async () => {
    const { calls } = draftApi(READY, {
      "POST /api/ai/drafts/9/save": () => ({ json: { setId: 5 } }),
    });
    renderApp("/create/ai/9");
    const title = await screen.findByLabelText("Title");
    await userEvent.clear(title);
    await userEvent.click(screen.getByRole("button", { name: "Save 1 card" }));
    expect(screen.getByText("Give the new set a title.")).toBeTruthy();

    await userEvent.type(title, "Tiere");
    await userEvent.click(screen.getByRole("button", { name: "Save 1 card" }));
    expect(await screen.findByText("1 card saved")).toBeTruthy();
    const order = calls.filter((c) => c.method !== "GET").map((c) => `${c.method} ${c.path}`);
    expect(order).toEqual(["PATCH /api/ai/drafts/9", "POST /api/ai/drafts/9/save"]);
    expect(calls.find((c) => c.method === "PATCH")?.body).toMatchObject({ title: "Tiere" });
    expect(calls.find((c) => c.path.endsWith("/save"))?.body).toEqual({
      setId: null,
      title: "Tiere",
      termLang: "es",
      defLang: "en",
    });
    await waitFor(() => expect(calls.some((c) => c.path === "/api/sets/5")).toBe(true));
  });

  test("into an existing set: picked early, so More cards skips its terms too", async () => {
    const { calls } = draftApi(READY, {
      "POST /api/ai/drafts/9/save": () => ({
        status: 400,
        json: { error: "validation", fields: { cards: "too_big" } },
      }),
    });
    renderApp("/create/ai/9");
    await userEvent.click(await screen.findByRole("radio", { name: "Existing set" }));
    await userEvent.click(screen.getByRole("button", { name: "Save 1 card" }));
    expect(screen.getByText("Choose a set.")).toBeTruthy();

    await userEvent.selectOptions(screen.getByLabelText("Set"), "4");
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH")?.body).toMatchObject({ setId: 4 }));
    await userEvent.click(screen.getByRole("button", { name: "Save 1 card" }));
    expect(await screen.findByText("A set holds at most 500 cards.")).toBeTruthy();
    expect(calls.find((c) => c.path.endsWith("/save"))?.body).toMatchObject({ setId: 4 });
  });

  test("a kept card needs both sides, and at least one card is kept", async () => {
    const { calls } = draftApi(READY);
    renderApp("/create/ai/9");
    const definition = within(await screen.findByRole("group", { name: "Card 1" })).getByRole("textbox", {
      name: "Definition",
    });
    await userEvent.clear(definition);
    await userEvent.click(screen.getByRole("button", { name: "Save 1 card" }));
    expect(screen.getByText("Every kept card needs a term and a definition.")).toBeTruthy();

    await userEvent.click(within(card(1)).getByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: "Save 0 cards" }));
    expect(screen.getByText("Keep at least one card.")).toBeTruthy();
    expect(calls.some((c) => c.path.endsWith("/save"))).toBe(false);
  });

  test("make anew asks first, with the kind to make", async () => {
    const { calls } = draftApi(READY, {
      "POST /api/ai/drafts/9/regenerate": () => ({ status: 202, json: { ok: true } }),
    });
    renderApp("/create/ai/9");
    await userEvent.click(await screen.findByRole("button", { name: "Make anew" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Replace 2 cards?")).toBeTruthy();
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(calls.some((c) => c.path.endsWith("/regenerate"))).toBe(false);

    await userEvent.click(screen.getByRole("button", { name: "Make anew" }));
    await userEvent.selectOptions(within(screen.getByRole("dialog")).getByLabelText("What to make"), "questions");
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Make anew" }));
    await waitFor(() => expect(calls.find((c) => c.path.endsWith("/regenerate"))?.body).toEqual({ kind: "questions" }));
  });

  test("discard asks first and deletes the draft", async () => {
    const { calls } = draftApi(READY, {
      "DELETE /api/ai/drafts/9": () => ({ json: { ok: true } }),
    });
    renderApp("/create/ai/9");
    await userEvent.click(await screen.findByRole("button", { name: "Discard" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Discard" }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE")).toBe(true));
    await waitFor(() => expect(screen.queryByRole("heading", { level: 1, name: "Animals" })).toBeNull());
  });

  test("a run with no cards says so and can still be made anew or discarded", async () => {
    draftApi({ ...READY, cards: [], added: 0, notes: "" });
    renderApp("/create/ai/9");
    expect(await screen.findByText(/^No cards came out of this material/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Make anew" }));
    expect(within(screen.getByRole("dialog")).getByText("Make the cards anew?")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Discard" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Save/ })).toBeNull();
  });

  test("a More cards run says what it added; a full draft takes no more", async () => {
    const many = Array.from({ length: 500 }, (_, i) => ({ ...DOG, term: `t${i}` }));
    const { state } = draftApi({ ...READY, cards: [DOG, CAT, DOG], added: 1, skipped: 2 });
    const { unmount } = renderApp("/create/ai/9");
    expect(await screen.findByText("Last run: 1 new · 2 skipped as repeats")).toBeTruthy();
    expect(screen.getByRole("button", { name: "More cards" }).hasAttribute("disabled")).toBe(false);
    unmount();

    state.draft = { ...READY, cards: many };
    renderApp("/create/ai/9");
    expect(await screen.findByText(/^This draft holds 500 cards/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "More cards" }).hasAttribute("disabled")).toBe(true);
  });

  test("an edit refused because a run started elsewhere says so and shows the run", async () => {
    const { state } = draftApi(READY);
    mockApi({
      "GET /api/me": () => ({ json: ME }),
      "GET /api/sets": () => ({ json: SETS }),
      "GET /api/ai/drafts/9": () => ({ json: state.draft }),
      "PATCH /api/ai/drafts/9": () => {
        state.draft = { ...READY, status: "running" };
        return { status: 409, json: { error: "ai_running" } };
      },
    });
    renderApp("/create/ai/9");
    await userEvent.click(within(await screen.findByRole("group", { name: "Card 2" })).getByRole("checkbox"));
    expect(await screen.findByText("Making cards…")).toBeTruthy();
    expect(screen.getByText("Cards are already being made. Wait until they are done.")).toBeTruthy();
    expect(screen.getByText("el perro")).toBeTruthy(); // read-only while it runs

    state.draft = READY;
    await live();
    await waitFor(() => expect(screen.queryByText("Making cards…")).toBeNull());
    expect(screen.queryByText("Cards are already being made. Wait until they are done.")).toBeNull();
  });

  test("a failed run says why and can be tried again; a refused retry says why", async () => {
    let answer = { status: 402, json: { error: "ai_cap", capNanos: 2_000_000_000 } as unknown };
    const { calls } = draftApi(
      { ...DRAFT, status: "failed", error: "ai_busy" },
      { "POST /api/ai/drafts/9/regenerate": () => answer },
    );
    renderApp("/create/ai/9");
    expect(await screen.findByText("The AI is busy. Try again in a minute.")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByText("The monthly AI budget of $2.00 is used up. It starts again on the 1st."),
    ).toBeTruthy();

    answer = { status: 202, json: { ok: true } };
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(calls.filter((c) => c.path.endsWith("/regenerate"))).toHaveLength(2));
    expect(calls.find((c) => c.path.endsWith("/regenerate"))?.body).toEqual({ kind: "auto" });
  });

  test("a failed More cards keeps its cards editable and offers no retry", async () => {
    draftApi({ ...READY, status: "failed", error: "ai_busy" });
    renderApp("/create/ai/9");
    expect(await screen.findByText("The AI is busy. Try again in a minute.")).toBeTruthy();
    expect(within(card(1)).getByRole<HTMLTextAreaElement>("textbox", { name: "Term" }).value).toBe("el perro");
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  test("a draft that is gone says so", async () => {
    mockApi({ "GET /api/me": () => ({ json: ME }), "GET /api/ai/drafts/9": () => ({ status: 404, json: {} }) });
    renderApp("/create/ai/9");
    expect(await screen.findByText("This draft is gone")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Cards from material" })).toBeTruthy();
  });
});
