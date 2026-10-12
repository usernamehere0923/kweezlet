import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { ME, renderApp } from "../test/render";
import { FakeSocket, mockApi } from "../test/server";

describe("settings", () => {
  test("changing the language saves it on the server", async () => {
    const { calls } = mockApi({ "GET /api/me": () => ({ json: ME }), "PATCH /api/me/settings": () => ({ json: {} }) });
    renderApp("/settings");
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
});

describe("design page", () => {
  test("is reachable by URL only, not from the menu", async () => {
    mockApi({ "GET /api/me": () => ({ json: ME }) });
    renderApp("/design");
    expect(await screen.findByRole("main")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Design" })).toBeNull();
    expect(screen.getAllByRole("link", { name: "Settings" }).length).toBeGreaterThan(0);
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

const SPANISH = {
  id: 7,
  title: "Spanish animals",
  description: "chapter 1",
  termLang: "es",
  defLang: "en",
  termCount: 2,
  knownCount: 1,
  learningCount: 0,
  createdAt: 1,
  updatedAt: 1,
};
const SWISS = {
  id: 8,
  title: "Swiss history",
  description: "",
  termLang: null,
  defLang: null,
  termCount: 1,
  knownCount: 0,
  learningCount: 0,
  createdAt: 1,
  updatedAt: 1,
};
const SPANISH_DETAIL = {
  ...SPANISH,
  terms: [
    { id: 70, term: "el perro", definition: "the dog", position: 0, status: "unseen", starred: false, streak: 0 },
    { id: 71, term: "el gato", definition: "the cat", position: 1, status: "know_it", starred: true, streak: 2 },
  ],
};

describe("study sets", () => {
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
    mockApi({
      "GET /api/me": () => ({ json: ME }),
      "GET /api/sets/7": () => ({ json: { ...LEARN_DETAIL, bestSeconds: 23 } }),
      "POST /api/study/day": () => ({ json: { streak: 3 } }),
    });
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
});

describe("set form", () => {
  test("creating a set sends the form and opens the set", async () => {
    const { calls } = mockApi({
      "GET /api/me": () => ({ json: ME }),
      "POST /api/sets": () => ({ status: 201, json: { ...SPANISH_DETAIL, id: 9 } }),
      "GET /api/sets/9": () => ({ json: { ...SPANISH_DETAIL, id: 9 } }),
    });
    renderApp("/sets/new");
    await userEvent.type(await screen.findByLabelText("Title"), "Spanish animals");
    await userEvent.type(screen.getByLabelText("Term"), "el perro");
    await userEvent.type(screen.getByLabelText("Definition"), "the dog");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(calls.find((c) => c.method === "POST")?.body).toEqual({
        title: "Spanish animals",
        description: "",
        termLang: null,
        defLang: null,
        terms: [{ term: "el perro", definition: "the dog" }],
      }),
    );
    expect(await screen.findByRole("heading", { level: 1, name: "Spanish animals" })).toBeTruthy();
    expect(await screen.findByText("Saved")).toBeTruthy();
  });

  test("a half-filled row is caught before sending", async () => {
    const { calls } = mockApi({
      "GET /api/me": () => ({ json: ME }),
      "POST /api/sets": () => ({ status: 201, json: {} }),
    });
    renderApp("/sets/new");
    await userEvent.type(await screen.findByLabelText("Title"), "Spanish animals");
    await userEvent.type(screen.getByLabelText("Term"), "el perro");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Fill in both fields of a term, or delete the row.")).toBeTruthy();
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  test("a set needs at least one term", async () => {
    const { calls } = mockApi({
      "GET /api/me": () => ({ json: ME }),
      "POST /api/sets": () => ({ status: 201, json: {} }),
    });
    renderApp("/sets/new");
    await userEvent.type(await screen.findByLabelText("Title"), "Spanish animals");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Add at least one term.")).toBeTruthy();
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  test("editing keeps the ids of the terms", async () => {
    const { calls } = mockApi({
      "GET /api/me": () => ({ json: ME }),
      "GET /api/sets/7": () => ({ json: SPANISH_DETAIL }),
      "PATCH /api/sets/7": () => ({ json: SPANISH_DETAIL }),
    });
    renderApp("/sets/7/edit");
    expect((await screen.findByDisplayValue("Spanish animals")) as HTMLInputElement).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true));
    const body = calls.find((c) => c.method === "PATCH")?.body as { terms: { id: number }[] };
    expect(body.terms.map((term) => term.id)).toEqual([70, 71]);
  });

  test("server field errors show under the field", async () => {
    mockApi({
      "GET /api/me": () => ({ json: ME }),
      "POST /api/sets": () => ({ status: 400, json: { error: "validation", fields: { title: "too_big" } } }),
    });
    renderApp("/sets/new");
    await userEvent.type(await screen.findByLabelText("Title"), "A very long title");
    await userEvent.type(screen.getByLabelText("Term"), "a");
    await userEvent.type(screen.getByLabelText("Definition"), "b");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Too long")).toBeTruthy();
  });

  test("a fixed title error goes away on the next try", async () => {
    mockApi({ "GET /api/me": () => ({ json: ME }) });
    renderApp("/sets/new");
    await userEvent.type(await screen.findByLabelText("Title"), "   ");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Too short")).toBeTruthy();

    await userEvent.type(screen.getByLabelText("Title"), "Spanish animals");
    await userEvent.type(screen.getByLabelText("Term"), "el perro");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Fill in both fields of a term, or delete the row.")).toBeTruthy();
    expect(screen.queryByText("Too short")).toBeNull();
  });

  test.each([
    [{ "terms.0.definition": "too_big" }, "A term or definition is too long (at most 1000 characters)."],
    [{ terms: "too_big" }, "A set can have at most 500 terms."],
    [{ "terms.0.term": "too_small" }, "Fill in both fields of a term, or delete the row."],
  ])("server term errors %o say what is wrong", async (fields, message) => {
    mockApi({
      "GET /api/me": () => ({ json: ME }),
      "POST /api/sets": () => ({ status: 400, json: { error: "validation", fields } }),
    });
    renderApp("/sets/new");
    await userEvent.type(await screen.findByLabelText("Title"), "Spanish animals");
    await userEvent.type(screen.getByLabelText("Term"), "a");
    await userEvent.type(screen.getByLabelText("Definition"), "b");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText(message)).toBeTruthy();
  });

  test("a stale term id tells the user to reload", async () => {
    mockApi({
      "GET /api/me": () => ({ json: ME }),
      "GET /api/sets/7": () => ({ json: SPANISH_DETAIL }),
      "PATCH /api/sets/7": () => ({ status: 400, json: { error: "validation", fields: { terms: "invalid_value" } } }),
    });
    renderApp("/sets/7/edit");
    await screen.findByDisplayValue("Spanish animals");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("These terms were changed on another device. Reload the page and try again."),
    ).toBeTruthy();
  });
});

/** Marks and stars are merged server-side; this fake behaves the same way. */
function flashcardsApi(detail = SPANISH_DETAIL) {
  const marked: Record<number, { status: string; starred: boolean }> = Object.fromEntries(
    detail.terms.map((term) => [term.id, { status: term.status, starred: term.starred }]),
  );
  const state = (termId: number) => (body: unknown) => {
    const b = body as { status?: string; starred?: boolean };
    const current = marked[termId] ?? { status: "unseen", starred: false };
    marked[termId] = {
      status: b.status === undefined ? current.status : (b.status ?? "unseen"),
      starred: b.starred === undefined ? current.starred : !!b.starred,
    };
    return { json: { termId, ...marked[termId] } };
  };
  return {
    "GET /api/me": () => ({ json: ME }),
    "GET /api/sets/7": () => ({ json: detail }),
    "POST /api/study/day": () => ({ json: { streak: 3 } }),
    ...Object.fromEntries(detail.terms.map((term) => [`PATCH /api/terms/${term.id}/state`, state(term.id)])),
  };
}

/** Three cards still in progress: needed to see a card being skipped. */
const THREE_DETAIL = {
  ...SPANISH,
  termCount: 3,
  terms: [
    {
      id: 70,
      term: "el perro",
      definition: "the dog",
      position: 0,
      status: "still_learning",
      starred: false,
      streak: 0,
    },
    {
      id: 71,
      term: "el gato",
      definition: "the cat",
      position: 1,
      status: "still_learning",
      starred: false,
      streak: 0,
    },
    {
      id: 72,
      term: "el caballo",
      definition: "the horse",
      position: 2,
      status: "still_learning",
      starred: false,
      streak: 0,
    },
  ],
};

describe("flashcards", () => {
  test("shows the first card with progress and the streak", async () => {
    mockApi(flashcardsApi());
    renderApp("/sets/7/flashcards");
    expect(await screen.findByText("el perro")).toBeTruthy();
    expect(screen.getByText("1 / 2")).toBeTruthy();
    expect(screen.getByText("3 day streak")).toBeTruthy();
    expect(screen.getByText("Known 1")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to the set" })).toBeTruthy();
  });

  test("records the study day with the local date", async () => {
    const { calls } = mockApi(flashcardsApi());
    renderApp("/sets/7/flashcards");
    await screen.findByText("el perro");
    const body = calls.find((c) => c.path === "/api/study/day")?.body as { day: string };
    expect(body.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("marking a card records it and moves on", async () => {
    const { calls } = mockApi(flashcardsApi());
    renderApp("/sets/7/flashcards");
    await userEvent.click(await screen.findByRole("button", { name: "Know it" }));

    await waitFor(() =>
      expect(calls.find((c) => c.path === "/api/terms/70/state")?.body).toEqual({ status: "know_it" }),
    );
    expect(screen.getByText("2 / 2")).toBeTruthy();
    expect(screen.getByText("el gato")).toBeTruthy();
  });

  test("starring sends starred and lights the star up", async () => {
    const { calls } = mockApi(flashcardsApi());
    renderApp("/sets/7/flashcards");
    await userEvent.click(await screen.findByRole("button", { name: "Star this term" }));

    await waitFor(() => expect(calls.find((c) => c.path === "/api/terms/70/state")?.body).toEqual({ starred: true }));
    expect(await screen.findByRole("button", { name: "Remove the star" })).toBeTruthy();
  });

  test("definition first puts the definition on the front", async () => {
    mockApi(flashcardsApi());
    renderApp("/sets/7/flashcards");
    await screen.findByText("el perro");
    const onFront = (text: string) => screen.getByText(text).closest('[aria-hidden="false"]') !== null;
    expect(onFront("el perro")).toBe(true);
    expect(onFront("the dog")).toBe(false);

    await userEvent.click(await screen.findByRole("radio", { name: "Definition first" }));
    expect(onFront("the dog")).toBe(true);
    expect(onFront("el perro")).toBe(false);
  });

  test("shuffling keeps all the cards", async () => {
    mockApi(flashcardsApi());
    renderApp("/sets/7/flashcards");
    await userEvent.click(await screen.findByRole("button", { name: "Shuffle" }));
    expect(screen.getByText("1 / 2")).toBeTruthy();
  });

  test("the filter cuts the deck down to matching cards", async () => {
    mockApi(flashcardsApi());
    renderApp("/sets/7/flashcards");
    await screen.findByText("el perro");

    await userEvent.click(screen.getByRole("radio", { name: "Know it" }));
    expect(screen.getByText("1 / 1")).toBeTruthy();
    expect(screen.getByText("el gato")).toBeTruthy();
    expect(screen.queryByText("el perro")).toBeNull();

    await userEvent.click(screen.getByRole("radio", { name: "Starred" }));
    expect(screen.getByText("1 / 1")).toBeTruthy();

    await userEvent.click(screen.getByRole("radio", { name: "Still learning" }));
    expect(await screen.findByText("No cards here")).toBeTruthy();
  });

  test("marking a card can empty the filtered deck", async () => {
    mockApi(flashcardsApi());
    renderApp("/sets/7/flashcards");
    await userEvent.click(await screen.findByRole("radio", { name: "Know it" }));
    expect(screen.getByText("el gato")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Still learning" }));
    expect(await screen.findByText("No cards here")).toBeTruthy();
  });

  test("marking a card does not skip the next one", async () => {
    mockApi(flashcardsApi(THREE_DETAIL));
    renderApp("/sets/7/flashcards");
    await screen.findByText("el perro");
    await userEvent.click(screen.getByRole("radio", { name: "Still learning" }));
    expect(screen.getByText("1 / 3")).toBeTruthy();

    // el perro is marked and leaves the deck, el gato must be next in line.
    await userEvent.click(screen.getByRole("button", { name: "Know it" }));
    expect(screen.getByText("el gato")).toBeTruthy();
    expect(screen.getByText("1 / 2")).toBeTruthy();
  });

  test("a live update keeps the shuffle order", async () => {
    mockApi(flashcardsApi());
    renderApp("/sets/7/flashcards");
    await screen.findByText("el perro");

    // random() = 0 makes the shuffle deterministic: the last card comes first.
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    await userEvent.click(screen.getByRole("button", { name: "Shuffle" }));
    random.mockRestore();
    expect(screen.getByText("el gato")).toBeTruthy();

    // A write on any of the user's devices arrives over the live channel.
    await waitFor(() => expect(FakeSocket.instances.length).toBeGreaterThan(0));
    await act(async () => {
      FakeSocket.last.receive(JSON.stringify({ topic: "study", data: null }));
    });
    expect(screen.getByText("el gato")).toBeTruthy();
    expect(screen.queryByText("el perro")).toBeNull();
  });
});

/** Answers are counted and merged server-side; this fake behaves the same way. */
function learnApi(detail: { terms: { id: number; term: string; streak: number; status: string }[] }) {
  const stats = new Map(
    detail.terms.map((term) => [term.id, { correct: 0, wrong: 0, streak: term.streak, status: term.status }]),
  );
  const answer = (termId: number) => (body: unknown) => {
    const b = body as { correct: boolean };
    const s = stats.get(termId) ?? { correct: 0, wrong: 0, streak: 0, status: "unseen" };
    s.correct += b.correct ? 1 : 0;
    s.wrong += b.correct ? 0 : 1;
    s.streak = b.correct ? s.streak + 1 : 0;
    s.status = !b.correct ? "still_learning" : s.streak >= 2 ? "know_it" : s.status;
    return { json: { termId, correct: s.correct, wrong: s.wrong, streak: s.streak, status: s.status } };
  };
  return {
    "GET /api/me": () => ({ json: ME }),
    "GET /api/sets/7": () => ({ json: detail }),
    "POST /api/study/day": () => ({ json: { streak: 3 } }),
    ...Object.fromEntries(detail.terms.map((term) => [`POST /api/terms/${term.id}/answer`, answer(term.id)])),
  };
}

const LEARN_DETAIL = {
  ...SPANISH,
  termCount: 3,
  terms: [
    { id: 70, term: "el perro", definition: "the dog", position: 0, status: "unseen", starred: false, streak: 0 },
    { id: 71, term: "el gato", definition: "the cat", position: 1, status: "unseen", starred: false, streak: 0 },
    { id: 72, term: "el caballo", definition: "the horse", position: 2, status: "know_it", starred: false, streak: 2 },
  ],
};

describe("learn", () => {
  test("multiple choice first, written once the term improves", async () => {
    // random() = 0 pins the question order and directions.
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { calls } = mockApi(learnApi(LEARN_DETAIL));
    renderApp("/sets/7/learn");

    // The round covers the two terms that are not learned yet.
    expect(await screen.findByText("New 2")).toBeTruthy();
    expect(screen.getByText("Known 1")).toBeTruthy();

    // Question 1: the definition is shown, pick the term.
    expect(screen.getByText("the cat")).toBeTruthy();
    await userEvent.click(screen.getByText("el gato"));
    expect(await screen.findByText("Correct!")).toBeTruthy();
    expect(await screen.findByText("Learning 1")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));

    // Question 2: the other term.
    expect(await screen.findByText("the dog")).toBeTruthy();
    await userEvent.click(screen.getByText("el perro"));
    await userEvent.click(await screen.findByRole("button", { name: "Continue" }));

    // Question 3: the first term comes back, now typed instead of chosen.
    expect(await screen.findByText("the cat")).toBeTruthy();
    await userEvent.type(screen.getByLabelText("Your answer"), "el gato");
    await userEvent.click(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByText("Correct!")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));

    // Question 4: typed as well, then the round is complete.
    await userEvent.type(await screen.findByLabelText("Your answer"), "el perro");
    await userEvent.click(screen.getByRole("button", { name: "Check" }));
    await userEvent.click(await screen.findByRole("button", { name: "Continue" }));

    expect(await screen.findByText("Nice work!")).toBeTruthy();
    expect(screen.getByText("4 of 4 correct")).toBeTruthy();
    expect(calls.filter((c) => c.path.endsWith("/answer"))).toHaveLength(4);
  });

  test("Enter after the feedback does not count the answer again", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const typed = {
      ...LEARN_DETAIL,
      terms: LEARN_DETAIL.terms.map((term) => (term.id === 71 ? { ...term, streak: 1 } : term)),
    };
    const { calls } = mockApi(learnApi(typed));
    renderApp("/sets/7/learn");

    await userEvent.type(await screen.findByLabelText("Your answer"), "el gato{Enter}");
    expect(await screen.findByText("Correct!")).toBeTruthy();
    await userEvent.type(screen.getByLabelText("Your answer"), "{Enter}");
    expect(calls.filter((c) => c.path.endsWith("/answer"))).toHaveLength(1);
  });

  test("a wrong answer shows the right one and comes back", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { calls } = mockApi(learnApi(LEARN_DETAIL));
    renderApp("/sets/7/learn");

    await screen.findByText("the cat");
    await userEvent.click(screen.getByText("el perro"));
    expect(await screen.findByText("Not quite")).toBeTruthy();
    expect(screen.getByText("Correct answer: el gato")).toBeTruthy();
    expect(calls.find((c) => c.path.endsWith("/answer"))?.body).toEqual({ correct: false });

    // The other term is asked first, then the missed one returns.
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText("the dog");
    await userEvent.click(screen.getByText("el perro"));
    await userEvent.click(await screen.findByRole("button", { name: "Continue" }));
    expect(await screen.findByText("the cat")).toBeTruthy();
  });

  test("when everything is learned it offers another round", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const allLearned = {
      ...LEARN_DETAIL,
      terms: LEARN_DETAIL.terms.map((term) => ({ ...term, streak: 2, status: "know_it" })),
    };
    mockApi(learnApi(allLearned));
    renderApp("/sets/7/learn");

    expect(await screen.findByText("Everything learned!")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Study anyway" }));
    expect(await screen.findByText("the cat")).toBeTruthy();
    expect(screen.getByText("Which term fits?")).toBeTruthy();
  });

  test("smart grading accepts a small typo", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const improving = {
      ...LEARN_DETAIL,
      terms: LEARN_DETAIL.terms.map((term) => (term.streak === 0 ? { ...term, streak: 1 } : term)),
    };
    mockApi(learnApi(improving));
    renderApp("/sets/7/learn");

    // Written questions from the start: both terms have one correct answer.
    expect(await screen.findByText("Learning 2")).toBeTruthy();
    await userEvent.type(screen.getByLabelText("Your answer"), "el gat");
    await userEvent.click(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByText("Correct!")).toBeTruthy();
  });
});

function testApi(detail = LEARN_DETAIL) {
  return {
    "GET /api/me": () => ({ json: ME }),
    "GET /api/sets/7": () => ({ json: detail }),
    "POST /api/study/day": () => ({ json: { streak: 3 } }),
  };
}

describe("test mode", () => {
  const TERMS: Record<string, string> = { "the dog": "el perro", "the cat": "el gato", "the horse": "el caballo" };

  test("a written paper can be answered perfectly", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    mockApi(testApi());
    renderApp("/sets/7/test");

    // The setup screen
    expect(await screen.findByText("Number of questions")).toBeTruthy();
    expect(screen.getByText("Question types")).toBeTruthy();
    await userEvent.click(screen.getByLabelText("Multiple choice"));
    await userEvent.click(screen.getByLabelText("True or false"));
    await userEvent.click(screen.getByLabelText("Matching"));
    await userEvent.click(screen.getByRole("radio", { name: "All" }));
    await userEvent.click(screen.getByRole("button", { name: "Start test" }));

    // The paper: every question has its prompt heading and its answer field.
    const prompts = await screen.findAllByRole("heading", { level: 2 });
    const fields = screen.getAllByLabelText("Your answer");
    expect(prompts).toHaveLength(3);
    for (const [i, prompt] of prompts.entries()) {
      await userEvent.type(fields[i], TERMS[prompt.textContent ?? ""]);
    }
    await userEvent.click(screen.getByRole("button", { name: "Finish" }));

    expect(await screen.findByText("Nice work!")).toBeTruthy();
    expect(screen.getByText("3 of 3 correct")).toBeTruthy();
  });

  test("a wrong answer costs a point", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    mockApi(testApi());
    renderApp("/sets/7/test");
    await screen.findByText("Number of questions");
    await userEvent.click(screen.getByLabelText("Multiple choice"));
    await userEvent.click(screen.getByLabelText("True or false"));
    await userEvent.click(screen.getByLabelText("Matching"));
    await userEvent.click(screen.getByRole("radio", { name: "All" }));
    await userEvent.click(screen.getByRole("button", { name: "Start test" }));

    const prompts = await screen.findAllByRole("heading", { level: 2 });
    const fields = screen.getAllByLabelText("Your answer");
    await userEvent.type(fields[0], TERMS[prompts[0].textContent ?? ""]);
    await userEvent.type(fields[1], "nada");
    await userEvent.type(fields[2], TERMS[prompts[2].textContent ?? ""]);
    await userEvent.click(screen.getByRole("button", { name: "Finish" }));

    expect(await screen.findByText("2 of 3 correct")).toBeTruthy();
  });

  test("the matching round matches pairs", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    mockApi(testApi());
    renderApp("/sets/7/test");
    await screen.findByText("Number of questions");
    await userEvent.click(screen.getByLabelText("Multiple choice"));
    await userEvent.click(screen.getByLabelText("True or false"));
    await userEvent.click(screen.getByLabelText("Written"));
    await userEvent.click(screen.getByRole("button", { name: "Start test" }));

    expect(await screen.findByText("Tap a term and then its definition.")).toBeTruthy();
    for (const [term, definition] of [
      ["el gato", "the cat"],
      ["el perro", "the dog"],
      ["el caballo", "the horse"],
    ]) {
      await userEvent.click(screen.getByText(term));
      await userEvent.click(screen.getByText(definition));
    }
    // Every pair is matched once it fades out and stops reacting.
    for (const label of ["el gato", "el perro", "el caballo"]) {
      expect(screen.getByText(label).closest("button")).toHaveProperty("disabled", true);
    }
    await userEvent.click(screen.getByRole("button", { name: "Finish" }));

    expect(await screen.findByText("3 of 3 correct")).toBeTruthy();
  });

  test("when the time runs out the test is over", async () => {
    let nowMs = 10_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => nowMs);
    mockApi(testApi());
    renderApp("/sets/7/test");
    await screen.findByText("Number of questions");
    await userEvent.click(screen.getByLabelText("Matching"));
    await userEvent.click(screen.getByRole("radio", { name: "5 minutes" }));
    await userEvent.click(screen.getByRole("button", { name: "Start test" }));

    expect(await screen.findByText(/Time left 5:00/)).toBeTruthy();
    const stopped = vi.spyOn(window, "clearInterval");
    nowMs += 6 * 60_000;
    expect(await screen.findByText("Nice work!", undefined, { timeout: 3000 })).toBeTruthy();
    expect(screen.getByText(/0 of \d+ correct/)).toBeTruthy();
    // The clock stops once the paper is handed in.
    expect(stopped).toHaveBeenCalled();
  });

  test("a set without terms has nothing to test", async () => {
    mockApi(testApi({ ...LEARN_DETAIL, termCount: 0, terms: [] }));
    renderApp("/sets/7/test");
    expect(await screen.findByText("No terms to test")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Start test" })).toBeNull();
  });

  test("a test needs at least one question type", async () => {
    mockApi(testApi());
    renderApp("/sets/7/test");
    await screen.findByText("Number of questions");
    await userEvent.click(screen.getByLabelText("Multiple choice"));
    await userEvent.click(screen.getByLabelText("True or false"));
    await userEvent.click(screen.getByLabelText("Written"));
    await userEvent.click(screen.getByLabelText("Matching"));

    expect(screen.getByRole("button", { name: "Start test" })).toHaveProperty("disabled", true);
  });
});

function matchApi(detail: Record<string, unknown>, result: { best: number; isNewBest: boolean } | null = null) {
  return {
    "GET /api/me": () => ({ json: ME }),
    "GET /api/sets/7": () => ({ json: detail }),
    "POST /api/study/day": () => ({ json: { streak: 3 } }),
    "POST /api/sets/7/match": () => (result ? { json: result } : { status: 404 }),
  };
}

const MATCH_DETAIL = { ...LEARN_DETAIL, bestSeconds: null };

describe("match", () => {
  const PAIRS: [string, string][] = [
    ["el perro", "the dog"],
    ["el gato", "the cat"],
    ["el caballo", "the horse"],
  ];

  test("a finished round is timed and recorded", async () => {
    let nowMs = 10_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => nowMs);
    const { calls } = mockApi(matchApi(MATCH_DETAIL, { best: 6, isNewBest: true }));
    renderApp("/sets/7/match");

    expect(await screen.findByText("Time 0:00")).toBeTruthy();
    expect(screen.getByText("Tap a term and then its definition.")).toBeTruthy();

    // Three pairs, two seconds of thinking after each of the first two.
    for (const [term, definition] of PAIRS) {
      await userEvent.click(screen.getByText(term));
      await userEvent.click(screen.getByText(definition));
      nowMs += 3_000;
    }

    expect(await screen.findByText("New best time!")).toBeTruthy();
    expect(screen.getByText("Your time")).toBeTruthy();
    expect(screen.getByText("0:06")).toBeTruthy();
    // The result card and the header both show the new best time.
    expect(await screen.findAllByText("Best time 0:06")).toHaveLength(2);
    expect(calls.find((c) => c.path === "/api/sets/7/match")?.body).toEqual({ seconds: 6 });

    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Spanish animals" })).toBeTruthy();
  });

  test("a wrong pair shakes and the tiles can be tried again", async () => {
    vi.spyOn(Date, "now").mockImplementation(() => 10_000_000);
    mockApi(matchApi(MATCH_DETAIL, { best: 5, isNewBest: false }));
    renderApp("/sets/7/match");
    await screen.findByText("Time 0:00");

    await userEvent.click(screen.getByText("el perro"));
    await userEvent.click(screen.getByText("the cat"));
    expect(screen.getByText("el perro").closest("button")!.className).toContain("animate-shake");
    expect(screen.getByText("the cat").closest("button")!.className).toContain("animate-shake");

    // Once the shake is over the pair is open again.
    await waitFor(() =>
      expect(screen.getByText("el perro").closest("button")!.className).not.toContain("animate-shake"),
    );
    await userEvent.click(screen.getByText("el perro"));
    await userEvent.click(screen.getByText("the dog"));
    expect((screen.getByText("el perro").closest("button") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByText("the dog").closest("button") as HTMLButtonElement).disabled).toBe(true);
  });

  test("an unbeaten record says so, and play again starts fresh", async () => {
    let nowMs = 10_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => nowMs);
    mockApi(matchApi({ ...MATCH_DETAIL, bestSeconds: 42 }, { best: 42, isNewBest: false }));
    renderApp("/sets/7/match");
    await screen.findByText("Time 0:00");
    expect(screen.getByText("Best time 0:42")).toBeTruthy();

    for (const [term, definition] of PAIRS) {
      await userEvent.click(screen.getByText(term));
      await userEvent.click(screen.getByText(definition));
      nowMs += 3_000;
    }

    expect(await screen.findByText("Your time")).toBeTruthy();
    expect(screen.queryByText("New best time!")).toBeNull();
    // The old record, in the header and under the time.
    expect(screen.getAllByText("Best time 0:42")).toHaveLength(2);

    await userEvent.click(screen.getByRole("button", { name: "Play again" }));
    expect(await screen.findByText("Time 0:00")).toBeTruthy();
    expect((screen.getByText("el perro").closest("button") as HTMLButtonElement).disabled).toBe(false);
  });

  test("a set with two terms cannot play and says why", async () => {
    const twoTerms = { ...LEARN_DETAIL, termCount: 2, terms: LEARN_DETAIL.terms.slice(0, 2), bestSeconds: null };
    mockApi(matchApi(twoTerms));
    renderApp("/sets/7/match");
    expect(await screen.findByText("Match needs at least 3 terms")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Edit set" })).toBeTruthy();
  });
});

const REVIEW_CARDS = [
  { id: 70, term: "el perro", definition: "the dog", streak: 0, setId: 7, setTitle: "Spanish animals" },
  { id: 71, term: "el gato", definition: "the cat", streak: 0, setId: 7, setTitle: "Spanish animals" },
];

function reviewApi(overview: { cards: unknown[]; dueCount: number }, sets: unknown[] = [SPANISH]) {
  return {
    "GET /api/me": () => ({ json: ME }),
    "GET /api/sets": () => ({ json: sets }),
    "GET /api/review": () => ({ json: overview }),
    "POST /api/study/day": () => ({ json: { streak: 3 } }),
    "POST /api/terms/70/answer": () => ({
      json: { termId: 70, correct: 1, wrong: 0, streak: 1, status: "still_learning" },
    }),
    "POST /api/terms/71/answer": () => ({
      json: { termId: 71, correct: 1, wrong: 0, streak: 1, status: "still_learning" },
    }),
  };
}

describe("review", () => {
  test("home shows the due card and the session runs to the end", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { calls } = mockApi(reviewApi({ cards: REVIEW_CARDS, dueCount: 2 }));
    renderApp("/");

    expect(await screen.findByRole("heading", { name: "2 cards due" })).toBeTruthy();
    await userEvent.click(screen.getByRole("link", { name: "Review now" }));

    // The cards come, one question each: a definition is shown, name the term.
    expect(await screen.findByRole("heading", { name: "the cat" })).toBeTruthy();
    await userEvent.click(screen.getByText("el gato"));
    expect(await screen.findByText("Correct!")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("heading", { name: "the dog" })).toBeTruthy();
    await userEvent.click(screen.getByText("el perro"));
    await userEvent.click(await screen.findByRole("button", { name: "Continue" }));

    expect(await screen.findByText("Nice work!")).toBeTruthy();
    expect(screen.getByText("2 of 2 correct")).toBeTruthy();
    const answered = calls.filter((c) => c.path.endsWith("/answer"));
    expect(answered.map((c) => c.body)).toEqual([{ correct: true }, { correct: true }]);

    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(await screen.findByRole("searchbox", { name: "Search your sets" })).toBeTruthy();
  });

  test("a mistake brings the card back later in the round", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    mockApi(reviewApi({ cards: REVIEW_CARDS.slice(0, 1), dueCount: 1 }));
    renderApp("/review");

    // One card alone is answered by typing it (the term for "the dog").
    expect(await screen.findByRole("heading", { name: "the dog" })).toBeTruthy();
    await userEvent.type(screen.getByLabelText("Your answer"), "nada{Enter}");
    expect(await screen.findByText("Not quite")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));

    // The same card comes back and can still be answered correctly.
    expect(await screen.findByRole("heading", { name: "the dog" })).toBeTruthy();
    await userEvent.type(screen.getByLabelText("Your answer"), "el perro{Enter}");
    expect(await screen.findByText("Correct!")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("1 of 2 correct")).toBeTruthy();
  });

  test("nothing due means all caught up", async () => {
    mockApi(reviewApi({ cards: [], dueCount: 0 }));
    renderApp("/review");
    expect(await screen.findByText("All caught up!")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back home" })).toBeTruthy();
  });

  test("home keeps quiet when nothing is due, and only asks for the count", async () => {
    const { calls } = mockApi(reviewApi({ cards: [], dueCount: 0 }));
    renderApp("/");
    await screen.findByText("Spanish animals");
    expect(screen.queryByRole("heading", { name: /cards? due/ })).toBeNull();
    expect(calls.find((c) => c.path === "/api/review")?.query).toEqual({ limit: "1" });
  });

  test("nothing due does not count as a study day", async () => {
    const { calls } = mockApi(reviewApi({ cards: [], dueCount: 0 }));
    renderApp("/review");
    await screen.findByText("All caught up!");
    expect(calls.some((c) => c.path === "/api/study/day")).toBe(false);
  });

  test("study again brings the next cards due, not the same ones", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const next = {
      id: 72,
      term: "el caballo",
      definition: "the horse",
      streak: 1,
      setId: 7,
      setTitle: "Spanish animals",
    };
    const overviews = [
      { cards: [REVIEW_CARDS[0]], dueCount: 2 },
      { cards: [next], dueCount: 1 },
    ];
    mockApi({ ...reviewApi(overviews[0]), "GET /api/review": () => ({ json: overviews.shift() }) });
    renderApp("/review");

    await userEvent.type(await screen.findByLabelText("Your answer"), "el perro{Enter}");
    await userEvent.click(await screen.findByRole("button", { name: "Continue" }));
    await userEvent.click(await screen.findByRole("button", { name: "Study again" }));
    expect(await screen.findByRole("heading", { name: "the horse" })).toBeTruthy();
  });

  test("a card answered on another device is skipped", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    let due = REVIEW_CARDS;
    mockApi({
      ...reviewApi({ cards: REVIEW_CARDS, dueCount: 2 }),
      "GET /api/review": () => ({ json: { cards: due, dueCount: due.length } }),
    });
    renderApp("/review");

    expect(await screen.findByRole("heading", { name: "the cat" })).toBeTruthy();
    // The other device answers el perro.
    due = [REVIEW_CARDS[1]];
    await waitFor(() => expect(FakeSocket.instances.length).toBeGreaterThan(0));
    await act(async () => {
      FakeSocket.last.receive(JSON.stringify({ topic: "study", data: null }));
    });
    await userEvent.click(screen.getByText("el gato"));
    await userEvent.click(await screen.findByRole("button", { name: "Continue" }));
    expect(await screen.findByText("1 of 1 correct")).toBeTruthy();
  });

  test("an answer that was not saved asks the card again", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    mockApi({
      ...reviewApi({ cards: [REVIEW_CARDS[0]], dueCount: 1 }),
      "POST /api/terms/70/answer": () => ({ status: 500 }),
    });
    renderApp("/review");

    await userEvent.type(await screen.findByLabelText("Your answer"), "el perro{Enter}");
    await userEvent.click(await screen.findByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("heading", { name: "the dog" })).toBeTruthy();
  });

  test("wrong options come from the card's own set", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const history = { id: 72, term: "1291", definition: "Bundesbrief", streak: 0, setId: 8, setTitle: "Swiss history" };
    mockApi(reviewApi({ cards: [...REVIEW_CARDS, history], dueCount: 3 }));
    renderApp("/review");

    expect(await screen.findByRole("heading", { name: "the cat" })).toBeTruthy();
    expect(screen.getByText("el perro")).toBeTruthy();
    expect(screen.queryByText("1291")).toBeNull();
  });
});
