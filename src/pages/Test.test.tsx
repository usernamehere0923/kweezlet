import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { LEARN_DETAIL, studyRoutes } from "../test/fixtures";
import { renderApp } from "../test/render";
import { mockApi } from "../test/server";

describe("test mode", () => {
  const TERMS: Record<string, string> = { "the dog": "el perro", "the cat": "el gato", "the horse": "el caballo" };

  test("a written paper can be answered perfectly", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    mockApi(studyRoutes(LEARN_DETAIL));
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
    mockApi(studyRoutes(LEARN_DETAIL));
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
    mockApi(studyRoutes(LEARN_DETAIL));
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
    const { calls } = mockApi(studyRoutes(LEARN_DETAIL));
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
    // An empty paper that ran out of time is not a study day.
    expect(calls.some((c) => c.path === "/api/study/day")).toBe(false);
  });

  test("a set without terms has nothing to test", async () => {
    mockApi(studyRoutes({ ...LEARN_DETAIL, termCount: 0, terms: [] }));
    renderApp("/sets/7/test");
    expect(await screen.findByText("No terms to test")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Start test" })).toBeNull();
  });

  test("a test needs at least one question type", async () => {
    mockApi(studyRoutes(LEARN_DETAIL));
    renderApp("/sets/7/test");
    await screen.findByText("Number of questions");
    await userEvent.click(screen.getByLabelText("Multiple choice"));
    await userEvent.click(screen.getByLabelText("True or false"));
    await userEvent.click(screen.getByLabelText("Written"));
    await userEvent.click(screen.getByLabelText("Matching"));

    expect(screen.getByRole("button", { name: "Start test" })).toHaveProperty("disabled", true);
  });
});
