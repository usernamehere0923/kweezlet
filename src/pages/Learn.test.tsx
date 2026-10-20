import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { LEARN_DETAIL, studyRoutes } from "../test/fixtures";
import { renderApp } from "../test/render";
import { mockApi } from "../test/server";

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
    ...studyRoutes(detail),
    ...Object.fromEntries(detail.terms.map((term) => [`POST /api/terms/${term.id}/answer`, answer(term.id)])),
  };
}
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

  test("an answer sent while offline says so and the round goes on", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    mockApi({
      ...learnApi(LEARN_DETAIL),
      "POST /api/terms/71/answer": () => {
        throw new TypeError("Failed to fetch");
      },
    });
    renderApp("/sets/7/learn");

    await screen.findByText("the cat");
    await userEvent.click(screen.getByText("el gato"));
    expect(await screen.findByText("No connection to the server.")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("the dog")).toBeTruthy();
  });
});
