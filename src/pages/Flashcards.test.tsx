import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { SPANISH_DETAIL, studyRoutes, THREE_DETAIL } from "../test/fixtures";
import { renderApp } from "../test/render";
import { FakeSocket, mockApi } from "../test/server";
import { mockSpeech } from "../test/speech";

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
    ...studyRoutes(detail),
    ...Object.fromEntries(detail.terms.map((term) => [`PATCH /api/terms/${term.id}/state`, state(term.id)])),
  };
}
const FLIP = "Tap or press Space to flip";

describe("flashcards", () => {
  test("shows the first card with progress and the streak", async () => {
    mockApi(flashcardsApi());
    renderApp("/sets/7/flashcards");
    expect(await screen.findByText("el perro")).toBeTruthy();
    expect(screen.getByText("1 / 2")).toBeTruthy();
    expect(screen.getByText("Known 1")).toBeTruthy();
    // The streak shows once a card is flipped.
    await userEvent.click(screen.getByRole("button", { name: FLIP }));
    expect(await screen.findByText("3 day streak")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to the set" })).toBeTruthy();
  });

  test("records the study day with the local date, but only after a flip", async () => {
    const { calls } = mockApi(flashcardsApi());
    renderApp("/sets/7/flashcards");
    await screen.findByText("el perro");
    // Opening the deck alone does not count as studying.
    expect(calls.some((c) => c.path === "/api/study/day")).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: FLIP }));
    await waitFor(() => expect(calls.some((c) => c.path === "/api/study/day")).toBe(true));
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

  test("the card speaks the visible side in its language", async () => {
    const { spoken } = mockSpeech();
    mockApi(flashcardsApi());
    renderApp("/sets/7/flashcards");
    await screen.findByText("el perro");

    await userEvent.click(screen.getByRole("button", { name: "Speak" }));
    expect(spoken.at(-1)).toMatchObject({ text: "el perro", lang: "es" });

    // Flipped while the term still talks: the button stops it first…
    await userEvent.click(screen.getByRole("button", { name: FLIP }));
    await userEvent.click(screen.getByRole("button", { name: "Stop" }));
    // …and the next tap reads the definition, in the definitions' language.
    await userEvent.click(screen.getByRole("button", { name: "Speak" }));
    expect(spoken.at(-1)).toMatchObject({ text: "the dog", lang: "en" });
  });
});
