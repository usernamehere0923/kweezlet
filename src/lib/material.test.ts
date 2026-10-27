import { describe, expect, test, vi } from "vitest";
import { zipFile } from "../test/zip";
import { fileToDataUrl } from "./images";
import {
  fits,
  MAX_IMAGE_PAGES,
  MaterialError,
  pagesToSend,
  pickAll,
  readFile,
  readPhotos,
  totals,
  type MaterialPage,
} from "./material";

vi.mock("./pdf", () => ({
  SCAN_TEXT_CHARS: 20,
  openPdf: vi.fn(async (file: File) => {
    if (file.name === "broken.pdf") throw new Error("Invalid PDF structure");
    return {
      pages: [
        { n: 1, text: "Bern ist die Hauptstadt der Schweiz.", thumbnail: "thumb1" },
        { n: 2, text: "", thumbnail: "thumb2" },
      ],
      render: vi.fn(async (n: number, maxSide: number) => `data:image/jpeg;base64,PAGE${n}x${maxSide}`),
    };
  }),
}));
vi.mock("./images", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./images")>()),
  fileToDataUrl: vi.fn(async (file: File) => `data:image/jpeg;base64,${file.name}`),
}));

const code = (promise: Promise<unknown>) => promise.then(() => "ok").catch((err: MaterialError) => err.code);

describe("readFile", () => {
  test("a PDF: its pages, the ones without text as scans", async () => {
    const material = await readFile(new File(["%PDF"], "kurs.pdf", { type: "application/pdf" }));
    expect(material).toMatchObject({ name: "kurs.pdf", pickAll: false });
    expect(material.pages.map((p) => [p.n, p.scan, p.thumbnail])).toEqual([
      [1, false, "thumb1"],
      [2, true, "thumb2"],
    ]);
    expect(await code(readFile(new File(["x"], "broken.pdf")))).toBe("unreadable");
  });

  test("a text file is one page, picked at once; an empty one is unreadable", async () => {
    const material = await readFile(new File(["  el perro — the dog \n"], "vokabeln.txt", { type: "text/plain" }));
    expect(material).toEqual({
      name: "vokabeln.txt",
      pages: [{ n: 1, label: "vokabeln.txt", text: "el perro — the dog", scan: false }],
      pickAll: true,
    });
    expect(await code(readFile(new File(["  "], "empty.md")))).toBe("unreadable");
  });

  test("a text file longer than one run comes in parts to pick from", async () => {
    const line = "Bern ist die Hauptstadt der Schweiz.";
    const long = Array.from({ length: 12_000 }, () => line).join("\n"); // 443,999 characters
    const material = await readFile(new File([long], "export.txt", { type: "text/plain" }));
    expect(material.pickAll).toBe(false);
    expect(material.pages.length).toBeGreaterThan(20);
    expect(material.pages[1]).toMatchObject({ n: 2, label: "export.txt (2)", scan: false });
    expect(material.pages.every((page) => page.text.length <= 20_000)).toBe(true);
    expect(material.pages.map((page) => page.text).join("\n")).toBe(long);
    // One endless line is cut as well.
    const oneLine = await readFile(new File(["x".repeat(450_000)], "blob.txt", { type: "text/plain" }));
    expect(oneLine.pages.map((page) => page.text.length)).toEqual([...Array(22).fill(20_000), 10_000]);
  });

  test("Office files become their sections; old and foreign files are refused", async () => {
    const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
    const docx = await zipFile("kurs.docx", {
      "word/document.xml": `<w:document ${W}><w:body><w:p><w:r><w:t>Kantone</w:t></w:r></w:p></w:body></w:document>`,
    });
    // A single section: nothing to pick, it is picked at once.
    expect(await readFile(docx)).toMatchObject({
      pages: [{ n: 1, label: "Kantone", text: "Kantone", scan: false }],
      pickAll: true,
    });
    const empty = await zipFile("leer.docx", {
      "word/document.xml": `<w:document ${W}><w:body></w:body></w:document>`,
    });
    expect(await code(readFile(empty))).toBe("unreadable");
    expect(await code(readFile(new File(["x"], "alt.doc")))).toBe("old_format");
    expect(await code(readFile(new File(["x"], "song.mp3", { type: "audio/mpeg" })))).toBe("unsupported");
  });
});

describe("readPhotos", () => {
  test("each photo a picked scan page, at most 6; one that cannot be read stops it", async () => {
    const photos = Array.from({ length: 8 }, (_, i) => new File(["x"], `p${i + 1}.jpg`, { type: "image/jpeg" }));
    const material = await readPhotos(photos);
    expect(material.pages).toHaveLength(MAX_IMAGE_PAGES);
    expect(material.pages[0]).toEqual({
      n: 1,
      text: "",
      thumbnail: "data:image/jpeg;base64,p1.jpg",
      image: "data:image/jpeg;base64,p1.jpg",
      scan: true,
    });
    expect((await readPhotos([photos[0]!])).name).toBe("p1.jpg");
    // One shot at a time: new photos come after the ones there, still at most 6.
    const first = await readPhotos([photos[0]!]);
    const more = await readPhotos(photos.slice(1), first.pages);
    expect(more.pages.map((page) => page.n)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(more.pages[1]!.image).toBe("data:image/jpeg;base64,p2.jpg");
    vi.mocked(fileToDataUrl).mockRejectedValueOnce(new Error("image could not be read"));
    expect(await code(readPhotos([photos[0]!]))).toBe("photo");
  });
});

describe("picking pages", () => {
  const text = (n: number, length = 10): MaterialPage => ({ n, text: "x".repeat(length), scan: false });
  const scan = (n: number): MaterialPage => ({ n, text: "", scan: true });

  test("totals count pages, pictures and text, with an estimate", () => {
    const pages = [text(1, 4000), scan(2), text(3)];
    expect(totals(pages, new Set([1, 2]))).toMatchObject({ count: 2, images: 1, chars: 4000, tokens: 1000 + 1600 });
  });

  test("at most 60 pages, 6 pictures and 400,000 characters", () => {
    const many = Array.from({ length: 70 }, (_, i) => text(i + 1));
    expect(pickAll(many).size).toBe(60);
    const scans = Array.from({ length: 8 }, (_, i) => scan(i + 1));
    expect([...pickAll(scans)]).toEqual([1, 2, 3, 4, 5, 6]);
    const big = [text(1, 300_000), text(2, 150_000), text(3, 50_000)];
    expect([...pickAll(big)]).toEqual([1, 3]); // page 2 does not fit, page 3 still does
    expect(fits(big, new Set([1, 3]), big[1]!)).toBe(false);
  });

  test("the pages to send: text as it is, photos as they are, scanned PDF pages drawn now", async () => {
    const render = vi.fn(async (n: number) => `drawn${n}`);
    const material = {
      name: "x.pdf",
      pages: [text(1), scan(2), { ...scan(3), image: "photo3" }, text(4)],
      render,
      pickAll: false,
    };
    expect(await pagesToSend(material, new Set([1, 2, 3]))).toEqual([
      { n: 1, text: "xxxxxxxxxx" },
      { n: 2, image: "drawn2" },
      { n: 3, image: "photo3" },
    ]);
    expect(render).toHaveBeenCalledWith(2, 1600);
  });

  test("a scanned page too big to send is drawn smaller, and refused when it never fits", async () => {
    const huge = "x".repeat(700_000);
    const render = vi.fn(async (_n: number, side: number) => (side > 1200 ? huge : `small${side}`));
    const material = { name: "x.pdf", pages: [scan(1)], render, pickAll: true };
    expect(await pagesToSend(material, new Set([1]))).toEqual([{ n: 1, image: "small1200" }]);

    render.mockImplementation(async () => huge);
    expect(await code(pagesToSend(material, new Set([1])))).toBe("unreadable");
  });
});
