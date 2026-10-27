import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { fileToDataUrl } from "../lib/images";
import { SPANISH_DETAIL } from "../test/fixtures";
import { ME, renderApp } from "../test/render";
import { mockApi } from "../test/server";

// jsdom decodes no pictures: the shrinking itself is tested in src/lib/images.test.ts.
vi.mock("../lib/images", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/images")>()),
  fileToDataUrl: vi.fn(async () => "data:image/png;base64,CAT"),
}));

/** Picks a picture on the nth row's picker. */
function pickImage(container: HTMLElement, row = 0) {
  fireEvent.change(container.querySelectorAll('input[type="file"]')[row] as HTMLInputElement, {
    target: { files: [new File(["hello"], "cat.png", { type: "image/png" })] },
  });
}

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
        answerWith: "both",
        folderId: null,
        terms: [{ term: "el perro", definition: "the dog" }],
      }),
    );
    expect(await screen.findByRole("heading", { level: 1, name: "Spanish animals" })).toBeTruthy();
    expect(await screen.findByText("Saved")).toBeTruthy();
  });

  test("a pasted list is added after the filled rows, and saved with them", async () => {
    const { calls } = mockApi({
      "GET /api/me": () => ({ json: ME }),
      "POST /api/sets": () => ({ status: 201, json: { ...SPANISH_DETAIL, id: 9 } }),
      "GET /api/sets/9": () => ({ json: { ...SPANISH_DETAIL, id: 9 } }),
    });
    renderApp("/sets/new");
    await userEvent.type(await screen.findByLabelText("Title"), "Spanish animals");
    await userEvent.type(screen.getByLabelText("Term"), "el perro");
    await userEvent.type(screen.getByLabelText("Definition"), "the dog");
    await userEvent.click(screen.getByRole("button", { name: "Add a term" }));
    await userEvent.click(screen.getByRole("button", { name: "Import" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Paste a list to see its terms here.")).toBeTruthy();
    expect((within(dialog).getByRole("button", { name: "Add 0 terms" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText("Your list"), {
      target: { value: "Animals\nel gato\tthe cat\nla vaca\tthe cow" },
    });
    expect(within(dialog).getByText("2 terms found")).toBeTruthy();
    expect(within(dialog).getByText("el gato → the cat")).toBeTruthy();
    expect(within(dialog).getByText("1 line without a definition is left out.")).toBeTruthy();
    await userEvent.click(within(dialog).getByRole("button", { name: "Add 2 terms" }));

    // The empty row added before the import made room for the imported ones.
    expect(screen.getAllByLabelText("Term").map((input) => (input as HTMLInputElement).value)).toEqual([
      "el perro",
      "el gato",
      "la vaca",
    ]);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "POST")?.body).toMatchObject({
        terms: [
          { term: "el perro", definition: "the dog" },
          { term: "el gato", definition: "the cat" },
          { term: "la vaca", definition: "the cow" },
        ],
      }),
    );
  });

  test("the import separators can be picked, and cancel adds nothing", async () => {
    mockApi({ "GET /api/me": () => ({ json: ME }) });
    renderApp("/sets/new");
    await userEvent.click(await screen.findByRole("button", { name: "Import" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Your list"), { target: { value: "a,1;b,2" } });
    await userEvent.selectOptions(within(dialog).getByLabelText("Between term and definition"), "comma");
    await userEvent.selectOptions(within(dialog).getByLabelText("Between terms"), "semicolon");
    expect(within(dialog).getByText("2 terms found")).toBeTruthy();
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.getAllByLabelText("Term").map((input) => (input as HTMLInputElement).value)).toEqual([""]);
  });

  test("a set goes into a folder, or into a new one made on saving", async () => {
    const { calls } = mockApi({
      "GET /api/me": () => ({ json: ME }),
      "GET /api/folders": () => ({ json: [{ id: 3, name: "Languages", setCount: 1 }] }),
      "POST /api/folders": (body) =>
        (body as { name: string }).name === "Languages"
          ? { status: 400, json: { error: "validation", fields: { name: "taken" } } }
          : { status: 201, json: { id: 4, name: "Animals", setCount: 0 } },
      "POST /api/sets": () => ({ status: 201, json: { ...SPANISH_DETAIL, id: 9 } }),
      "GET /api/sets/9": () => ({ json: { ...SPANISH_DETAIL, id: 9 } }),
    });
    renderApp("/sets/new");
    await userEvent.type(await screen.findByLabelText("Title"), "Spanish animals");
    await userEvent.type(screen.getByLabelText("Term"), "el perro");
    await userEvent.type(screen.getByLabelText("Definition"), "the dog");
    await screen.findByRole("option", { name: "Languages" });
    await userEvent.selectOptions(screen.getByLabelText("Folder"), "new");

    // An empty name, then a name already taken, are caught on the field.
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Too short")).toBeTruthy();
    await userEvent.type(screen.getByLabelText("Name of the new folder"), "Languages");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("You already have a folder with this name")).toBeTruthy();
    expect(calls.some((c) => c.method === "POST" && c.path === "/api/sets")).toBe(false);

    await userEvent.clear(screen.getByLabelText("Name of the new folder"));
    await userEvent.type(screen.getByLabelText("Name of the new folder"), "Animals");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "POST" && c.path === "/api/sets")?.body).toMatchObject({ folderId: 4 }),
    );
  });

  test("editing shows the set's folder and can take it out", async () => {
    const { calls } = mockApi({
      "GET /api/me": () => ({ json: ME }),
      "GET /api/folders": () => ({ json: [{ id: 3, name: "Languages", setCount: 1 }] }),
      "GET /api/sets/7": () => ({ json: { ...SPANISH_DETAIL, folderId: 3 } }),
      "PATCH /api/sets/7": () => ({ json: SPANISH_DETAIL }),
    });
    renderApp("/sets/7/edit");
    await screen.findByRole("option", { name: "Languages" });
    const picker = screen.getByLabelText("Folder") as HTMLSelectElement;
    expect(picker.value).toBe("3");
    await userEvent.selectOptions(picker, "");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH")?.body).toMatchObject({ folderId: null }));
  });

  test("a folder deleted meanwhile is shown on the picker", async () => {
    mockApi({
      "GET /api/me": () => ({ json: ME }),
      "GET /api/folders": () => ({ json: [{ id: 3, name: "Languages", setCount: 0 }] }),
      "POST /api/sets": () => ({ status: 400, json: { error: "validation", fields: { folderId: "invalid_value" } } }),
    });
    renderApp("/sets/new");
    await userEvent.type(await screen.findByLabelText("Title"), "Spanish animals");
    await userEvent.type(screen.getByLabelText("Term"), "el perro");
    await userEvent.type(screen.getByLabelText("Definition"), "the dog");
    await screen.findByRole("option", { name: "Languages" });
    await userEvent.selectOptions(screen.getByLabelText("Folder"), "3");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Not an allowed value")).toBeTruthy();
  });

  test("a row turned into a gap sentence is saved as one; without its gap it is caught first", async () => {
    const { calls } = mockApi({
      "GET /api/me": () => ({ json: ME }),
      "POST /api/sets": () => ({ status: 201, json: { ...SPANISH_DETAIL, id: 9 } }),
      "GET /api/sets/9": () => ({ json: { ...SPANISH_DETAIL, id: 9 } }),
    });
    renderApp("/sets/new");
    await userEvent.type(await screen.findByLabelText("Title"), "Bern");
    await userEvent.click(screen.getByRole("radio", { name: "Gap sentence" }));
    fireEvent.change(screen.getByLabelText("Sentence"), { target: { value: "Bern is the federal city." } });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/Every gap sentence needs exactly one gap/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Sentence"), { target: { value: "Bern is the {{federal city}}." } });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "POST")?.body).toMatchObject({
        terms: [{ kind: "cloze", term: "Bern is the {{federal city}}.", definition: "federal city" }],
      }),
    );
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

  test("the set's side is loaded and a new one is saved", async () => {
    const { calls } = mockApi({
      "GET /api/me": () => ({ json: ME }),
      "GET /api/sets/7": () => ({ json: { ...SPANISH_DETAIL, answerWith: "term" } }),
      "PATCH /api/sets/7": () => ({ json: SPANISH_DETAIL }),
    });
    renderApp("/sets/7/edit");
    const group = await screen.findByRole("radiogroup", { name: "Answer with" });
    expect(within(group).getByRole("radio", { name: "Term" }).getAttribute("aria-checked")).toBe("true");
    await userEvent.click(within(group).getByRole("radio", { name: "Definition" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(calls.find((c) => c.method === "PATCH")?.body).toMatchObject({ answerWith: "definition" }),
    );
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
    pickImage(container);
    await waitFor(() => expect(screen.getByRole("img", { name: "Image" })).toBeTruthy());

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    const put = calls.find((c) => c.method === "PUT");
    expect(put?.path).toBe("/api/terms/70/image");
    expect(put?.body).toMatchObject({ image: expect.stringMatching(/^data:image\/png;base64,/) });
  });

  test("a picture still shrinking stays with its row when a row above is deleted", async () => {
    let done: (dataUrl: string) => void = () => {};
    vi.mocked(fileToDataUrl).mockImplementationOnce(() => new Promise((resolve) => (done = resolve)));
    const { calls } = mockApi({
      "GET /api/me": () => ({ json: ME }),
      "GET /api/sets/7": () => ({ json: SPANISH_DETAIL }),
      "GET /api/sets/7/images": () => ({ json: { images: {} } }),
      "PATCH /api/sets/7": () => ({ json: { ...SPANISH_DETAIL, terms: SPANISH_DETAIL.terms.slice(1) } }),
      "PUT /api/terms/71/image": () => ({ json: { ok: true } }),
    });
    const { container } = renderApp("/sets/7/edit");
    await screen.findByDisplayValue("el gato");

    pickImage(container, 1); // el gato's row
    await userEvent.click(screen.getAllByRole("button", { name: "Delete term" })[0]!); // el perro goes
    done("data:image/png;base64,GATO");
    await waitFor(() => expect(screen.getByRole("img", { name: "Image" })).toBeTruthy());
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    expect(calls.find((c) => c.method === "PUT")).toMatchObject({
      path: "/api/terms/71/image",
      body: { image: "data:image/png;base64,GATO" },
    });
  });

  test("a new row whose picture was taken off again is just an empty row", async () => {
    const { calls } = mockApi({
      "GET /api/me": () => ({ json: ME }),
      "POST /api/sets": () => ({ status: 201, json: { ...SPANISH_DETAIL, id: 9 } }),
      "GET /api/sets/9": () => ({ json: { ...SPANISH_DETAIL, id: 9 } }),
    });
    const { container } = renderApp("/sets/new");
    await userEvent.type(await screen.findByLabelText("Title"), "Spanish animals");
    await userEvent.type(screen.getByLabelText("Term"), "el perro");
    await userEvent.type(screen.getByLabelText("Definition"), "the dog");
    await userEvent.click(screen.getByRole("button", { name: "Add a term" }));
    pickImage(container, 1);
    await userEvent.click(await screen.findByRole("button", { name: "Remove image" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    expect((calls.find((c) => c.method === "POST")?.body as { terms: unknown[] }).terms).toHaveLength(1);
    expect(calls.some((c) => c.method === "PUT")).toBe(false);
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
