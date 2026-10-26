import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { openPdf } from "../lib/pdf";
import { ME, renderApp } from "../test/render";
import { mockApi } from "../test/server";

// jsdom runs no pdf.js and decodes no pictures: both are checked in the browser.
vi.mock("../lib/pdf", () => ({
  SCAN_TEXT_CHARS: 20,
  openPdf: vi.fn(async () => ({
    pages: [
      { n: 1, text: "Kapitel 1: Bern ist die Hauptstadt der Schweiz.", thumbnail: "thumb1.png" },
      { n: 2, text: "", thumbnail: "thumb2.png" },
      { n: 3, text: "Kapitel 3: Die Schweiz hat 26 Kantone.", thumbnail: "thumb3.png" },
    ],
    render: vi.fn(async (n: number) => `data:image/jpeg;base64,PAGE${n}`),
    close: vi.fn(),
  })),
}));
vi.mock("../lib/images", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/images")>()),
  fileToDataUrl: vi.fn(async (file: File) => `data:image/jpeg;base64,${file.name}`),
}));

const DRAFT = {
  id: 9,
  status: "running",
  error: null,
  sourceName: "pasted",
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
  cards: [],
  pages: [{ n: 1, image: false }],
  cost: { nanos: 0, tokens: 0, durationMs: 0 },
  updatedAt: 0,
};

function pick(container: HTMLElement, accept: RegExp, files: File[]) {
  const input = [...container.querySelectorAll<HTMLInputElement>('input[type="file"]')].find((el) =>
    accept.test(el.accept),
  )!;
  fireEvent.change(input, { target: { files } });
}

describe("cards from material", () => {
  test("pasted text goes out as one page with the options, then the draft shows its run", async () => {
    const { calls } = mockApi({
      "GET /api/me": () => ({ json: ME }),
      "POST /api/ai/drafts": () => ({ status: 201, json: { id: 9 } }),
      "GET /api/ai/drafts/9": () => ({ json: DRAFT }),
    });
    renderApp("/create/ai");
    await userEvent.click(await screen.findByRole("radio", { name: "Text" }));
    await userEvent.type(screen.getByLabelText("Text"), "el perro — the dog");
    await userEvent.selectOptions(screen.getByLabelText("What to make"), "vocabulary");
    await userEvent.click(screen.getByRole("radio", { name: "25" }));
    await userEvent.type(screen.getByLabelText("Instructions"), "answers in German");
    expect(screen.getByText("about 5 tokens · about $0.01")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Create cards" }));

    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({
      sourceName: "pasted",
      kind: "vocabulary",
      maxCards: 25,
      instructions: "answers in German",
      pages: [{ n: 1, text: "el perro — the dog" }],
    });
    expect(await screen.findByText("Making cards…")).toBeTruthy();
  });

  test("a PDF: pages start unpicked; picked ones go out, a scanned one as a picture", async () => {
    const { calls } = mockApi({
      "GET /api/me": () => ({ json: ME }),
      "POST /api/ai/drafts": () => ({ status: 201, json: { id: 9 } }),
      "GET /api/ai/drafts/9": () => ({ json: DRAFT }),
    });
    const { container } = renderApp("/create/ai");
    await screen.findByRole("button", { name: "Choose a file" });
    pick(container, /pdf/, [new File(["%PDF"], "kurs.pdf", { type: "application/pdf" })]);

    const page1 = await screen.findByRole("button", { name: /^Page 1:/ });
    expect(screen.getByRole("button", { name: "Page 2, scan" }).getAttribute("aria-pressed")).toBe("false");
    await userEvent.click(screen.getByRole("button", { name: "Create cards" }));
    expect(screen.getByText("Pick at least one page, or paste some text.")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(screen.getByText(/^3 pages/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    await userEvent.click(page1);
    await userEvent.click(screen.getByRole("button", { name: "Page 2, scan" }));
    await userEvent.click(screen.getByRole("button", { name: "Create cards" }));

    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    expect(calls.find((c) => c.method === "POST")?.body).toMatchObject({
      sourceName: "kurs.pdf",
      kind: "auto",
      maxCards: 0,
      pages: [
        { n: 1, text: "Kapitel 1: Bern ist die Hauptstadt der Schweiz." },
        { n: 2, image: "data:image/jpeg;base64,PAGE2" },
      ],
    });
  });

  test("photos are picked at once; an old Word file and a full budget say why", async () => {
    const { calls } = mockApi({
      "GET /api/me": () => ({ json: ME }),
      "POST /api/ai/drafts": () => ({ status: 402, json: { error: "ai_cap", capNanos: 2_000_000_000 } }),
    });
    const { container } = renderApp("/create/ai");
    await screen.findByRole("button", { name: "Choose a file" });
    pick(container, /pdf/, [new File(["x"], "alt.doc")]);
    expect(await screen.findByText("Save it as .docx, .pptx or .xlsx first, then try again.")).toBeTruthy();

    await userEvent.click(screen.getByRole("radio", { name: "Photo" }));
    pick(container, /image/, [new File(["x"], "seite1.jpg", { type: "image/jpeg" })]);
    const tile = await screen.findByRole("button", { name: "Page 1, scan" });
    expect(tile.getAttribute("aria-pressed")).toBe("true");
    await userEvent.click(screen.getByRole("button", { name: "Create cards" }));

    expect(
      await screen.findByText("The monthly AI budget of $2.00 is used up. It starts again on the 1st."),
    ).toBeTruthy();
    expect(calls.find((c) => c.method === "POST")?.body).toMatchObject({
      sourceName: "seite1.jpg",
      pages: [{ n: 1, image: "data:image/jpeg;base64,seite1.jpg" }],
    });
  });

  test("photos add up one shot at a time; a slow PDF never lands after a switch; a replaced PDF is closed", async () => {
    mockApi({ "GET /api/me": () => ({ json: ME }) });
    const close = vi.fn();
    let finish: (doc: Awaited<ReturnType<typeof openPdf>>) => void = () => {};
    vi.mocked(openPdf).mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    const { container } = renderApp("/create/ai");
    await screen.findByRole("button", { name: "Choose a file" });
    pick(container, /pdf/, [new File(["%PDF"], "slow.pdf", { type: "application/pdf" })]);
    expect(await screen.findByLabelText("Reading the file…")).toBeTruthy();

    await userEvent.click(screen.getByRole("radio", { name: "Photo" }));
    pick(container, /image/, [new File(["x"], "a.jpg", { type: "image/jpeg" })]);
    await screen.findByRole("button", { name: "Page 1, scan" });
    pick(container, /image/, [new File(["x"], "b.jpg", { type: "image/jpeg" })]);
    const second = await screen.findByRole("button", { name: "Page 2, scan" });
    expect(second.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/^2 pages/)).toBeTruthy();

    // The slow PDF arrives now: it is closed, and the photos stay.
    finish({ pages: [{ n: 1, text: "late", thumbnail: "t" }], render: vi.fn(), close });
    await waitFor(() => expect(close).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Page 2, scan" })).toBeTruthy();

    // A PDF replaced by another is closed too.
    const first = vi.fn();
    vi.mocked(openPdf).mockResolvedValueOnce({
      pages: [{ n: 1, text: "eins zwei drei vier fünf sechs" }],
      render: vi.fn(),
      close: first,
    });
    await userEvent.click(screen.getByRole("radio", { name: "File" }));
    pick(container, /pdf/, [new File(["%PDF"], "a.pdf", { type: "application/pdf" })]);
    expect(await screen.findByText("a.pdf")).toBeTruthy();
    pick(container, /pdf/, [new File(["%PDF"], "b.pdf", { type: "application/pdf" })]);
    await waitFor(() => expect(first).toHaveBeenCalled());
  });

  test("a run already going, and a refused body, get their own message", async () => {
    let answer = { status: 409, json: { error: "ai_running" } as unknown };
    mockApi({
      "GET /api/me": () => ({ json: ME }),
      "POST /api/ai/drafts": () => answer,
    });
    renderApp("/create/ai");
    await userEvent.click(await screen.findByRole("radio", { name: "Text" }));
    await userEvent.type(screen.getByLabelText("Text"), "Bern");
    await userEvent.click(screen.getByRole("button", { name: "Create cards" }));
    expect(await screen.findByText("Cards are already being made. Wait until they are done.")).toBeTruthy();

    answer = { status: 400, json: { error: "validation", fields: { pages: "too_big" } } };
    await userEvent.click(screen.getByRole("button", { name: "Create cards" }));
    expect(await screen.findByText("This material cannot be sent. Pick fewer pages, or other ones.")).toBeTruthy();
  });
});
