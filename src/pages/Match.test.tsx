import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { LEARN_DETAIL, MATCH_DETAIL, studyRoutes } from "../test/fixtures";
import { renderApp } from "../test/render";
import { mockApi } from "../test/server";

function matchApi(detail: Record<string, unknown>, result: { best: number; isNewBest: boolean } | null = null) {
  return {
    ...studyRoutes(detail),
    "POST /api/sets/7/match": () => (result ? { json: result } : { status: 404 }),
  };
}
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
