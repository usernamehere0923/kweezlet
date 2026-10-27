import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { REVIEW_CARDS, SPANISH } from "../test/fixtures";
import { ME, renderApp } from "../test/render";
import { FakeSocket, mockApi } from "../test/server";

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
  test("the asked term's picture comes with its set, once", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.9); // questions show the term
    const { calls } = mockApi({
      ...reviewApi({ cards: REVIEW_CARDS, dueCount: 2 }),
      "GET /api/sets/7/images": () => ({
        json: { images: { 70: "data:image/png;base64,DOG", 71: "data:image/png;base64,CAT" } },
      }),
    });
    renderApp("/review");

    expect(await screen.findByRole("heading", { name: "el perro" })).toBeTruthy();
    await waitFor(() => expect(document.querySelector('img[src="data:image/png;base64,DOG"]')).not.toBeNull());

    await userEvent.click(screen.getByText("the dog"));
    await userEvent.click(await screen.findByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("heading", { name: "el gato" })).toBeTruthy();
    await waitFor(() => expect(document.querySelector('img[src="data:image/png;base64,CAT"]')).not.toBeNull());
    // Both cards are from set 7: its pictures are fetched only once.
    expect(calls.filter((c) => c.path.endsWith("/images"))).toHaveLength(1);
  });

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

  test("a card follows its set's side", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99); // would show the term
    mockApi(reviewApi({ cards: REVIEW_CARDS.map((card) => ({ ...card, answerWith: "term" })), dueCount: 2 }));
    renderApp("/review");

    expect(await screen.findByText("Which term fits?")).toBeTruthy();
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
