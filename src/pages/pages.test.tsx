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
  createdAt: 1,
  updatedAt: 1,
};
const SPANISH_DETAIL = {
  ...SPANISH,
  terms: [
    { id: 70, term: "el perro", definition: "the dog", position: 0, status: "unseen", starred: false },
    { id: 71, term: "el gato", definition: "the cat", position: 1, status: "know_it", starred: true },
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
    expect(screen.getByRole("button", { name: "Flashcards" })).toBeTruthy();
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
    { id: 70, term: "el perro", definition: "the dog", position: 0, status: "still_learning", starred: false },
    { id: 71, term: "el gato", definition: "the cat", position: 1, status: "still_learning", starred: false },
    { id: 72, term: "el caballo", definition: "the horse", position: 2, status: "still_learning", starred: false },
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
