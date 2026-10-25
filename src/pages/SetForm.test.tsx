import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import { SPANISH_DETAIL } from "../test/fixtures";
import { ME, renderApp } from "../test/render";
import { mockApi } from "../test/server";

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

  test("the rows show their images, and removing one is saved after the set", async () => {
    const { calls } = mockApi({
      "GET /api/me": () => ({ json: ME }),
      "GET /api/sets/7": () => ({ json: SPANISH_DETAIL }),
      "GET /api/sets/7/images": () => ({ json: { images: { 70: "data:image/png;base64,CAT" } } }),
      "PATCH /api/sets/7": () => ({ json: SPANISH_DETAIL }),
      "PUT /api/terms/70/image": () => ({ json: { ok: true } }),
    });
    renderApp("/sets/7/edit");
    const thumb = await screen.findByRole("img", { name: "Image" });
    expect(thumb.getAttribute("src")).toBe("data:image/png;base64,CAT");

    await userEvent.click(screen.getByRole("button", { name: "Remove image" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    expect(calls.find((c) => c.method === "PUT")).toMatchObject({
      path: "/api/terms/70/image",
      body: { image: null },
    });
  });

  test("a picked image follows the new set to its term", async () => {
    const { calls } = mockApi({
      "GET /api/me": () => ({ json: ME }),
      "POST /api/sets": () => ({ status: 201, json: { ...SPANISH_DETAIL, id: 9 } }),
      "GET /api/sets/9": () => ({ json: { ...SPANISH_DETAIL, id: 9 } }),
      "PUT /api/terms/70/image": () => ({ json: { ok: true } }),
    });
    const { container } = renderApp("/sets/new");
    await userEvent.type(await screen.findByLabelText("Title"), "Spanish animals");
    await userEvent.type(screen.getByLabelText("Term"), "el perro");
    await userEvent.type(screen.getByLabelText("Definition"), "the dog");
    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, {
      target: { files: [new File(["hello"], "cat.png", { type: "image/png" })] },
    });
    await waitFor(() => expect(screen.getByRole("img", { name: "Image" })).toBeTruthy());

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    const put = calls.find((c) => c.method === "PUT");
    expect(put?.path).toBe("/api/terms/70/image");
    expect(put?.body).toMatchObject({ image: expect.stringMatching(/^data:image\/png;base64,/) });
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

  test("editing a set that is gone goes home", async () => {
    mockApi({
      "GET /api/me": () => ({ json: ME }),
      "GET /api/sets": () => ({ json: [] }),
      "GET /api/sets/7": () => ({ status: 404 }),
    });
    renderApp("/sets/7/edit");
    expect(await screen.findByText("No sets yet")).toBeTruthy();
    expect(screen.queryByText("Couldn't load this set.")).toBeNull();
  });

  test("editing offline offers to try again instead of leaving", async () => {
    let offline = true;
    mockApi({
      "GET /api/me": () => ({ json: ME }),
      "GET /api/sets": () => ({ json: [] }),
      "GET /api/sets/7": () => {
        if (offline) throw new TypeError("Failed to fetch");
        return { json: SPANISH_DETAIL };
      },
    });
    renderApp("/sets/7/edit");
    expect(await screen.findByText("Couldn't load this set.")).toBeTruthy();
    expect(screen.getByText("No connection to the server.")).toBeTruthy();
    expect(screen.queryByText("No sets yet")).toBeNull();

    offline = false;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByDisplayValue("Spanish animals")).toBeTruthy();
  });
});
