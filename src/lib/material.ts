// What "Cards from material" sends: the pages of a file, pasted text or
// photos, the ones the user picked, within one run's limits (worker/ai.ts).
import { estimateRun } from "./cost";
import { fileToDataUrl, PAGE_IMAGE } from "./images";
import { extractSections, OfficeError, officeKind, type OfficeErrorCode } from "./office";

/** At most this much per run; the API refuses more. */
export const MAX_PAGES = 60;
export const MAX_IMAGE_PAGES = 6;
export const MAX_TEXT_CHARS = 400_000;
/** A run's request body (worker/ai.ts): the JSON of all picked pages. */
export const MAX_BODY_CHARS = 4 * 1024 * 1024 - 64 * 1024;

/**
 * One page of material: text (what the AI reads, and what proves its quotes),
 * or a picture (`scan`: a photo, or a PDF page without a text layer).
 */
export type MaterialPage = {
  n: number;
  /** Shown on the tile without a thumbnail: a heading, a slide title, a file name. */
  label?: string;
  text: string;
  thumbnail?: string;
  scan: boolean;
  /** A photo's picture, ready to send. A scanned PDF page is drawn when the run starts. */
  image?: string;
};

export type Material = {
  name: string;
  pages: MaterialPage[];
  /** Draws a scanned PDF page for sending (PDF only). */
  render?: (n: number, maxSide: number) => Promise<string>;
  /** Frees what reading it holds (a PDF's document and worker): call when it is replaced. */
  close?: () => void;
  /** Picked at once: a single page, or photos. Several pages of a file are left to the user. */
  pickAll: boolean;
};

/** Why material could not be read, as a code the page translates. */
export type MaterialErrorCode = OfficeErrorCode | "photo";
export class MaterialError extends Error {
  constructor(readonly code: MaterialErrorCode) {
    super(`material: ${code}`);
    this.name = "MaterialError";
  }
}

const isPdf = (file: File) => file.type === "application/pdf" || /\.pdf$/i.test(file.name);
const isText = (file: File) => file.type.startsWith("text/") || /\.(txt|md)$/i.test(file.name);

/** A picked file as pages: PDF (pdf.js, loaded only now), Office, or plain text. */
export async function readFile(file: File): Promise<Material> {
  if (isPdf(file)) {
    const { openPdf, SCAN_TEXT_CHARS } = await import("./pdf");
    let doc;
    try {
      doc = await openPdf(file);
    } catch {
      throw new MaterialError("unreadable");
    }
    return {
      name: file.name,
      pages: doc.pages.map((page) => ({ ...page, scan: page.text.length < SCAN_TEXT_CHARS })),
      render: doc.render,
      close: doc.close,
      // One page: nothing to pick. More: all unpicked at first, the user chooses.
      pickAll: doc.pages.length === 1,
    };
  }
  if (isText(file)) {
    const text = (await file.text()).trim();
    if (!text) throw new MaterialError("unreadable");
    const pages = textPages(file.name, text);
    return { name: file.name, pages, pickAll: pages.length === 1 };
  }
  if (officeKind(file.name) === null) throw new MaterialError("unsupported");
  try {
    const sections = await extractSections(file);
    if (sections.length === 0) throw new MaterialError("unreadable");
    const pages = sections.map((s) => ({ ...s, scan: false }));
    return { name: file.name, pages, pickAll: pages.length === 1 };
  } catch (err) {
    if (err instanceof OfficeError) throw new MaterialError(err.code);
    throw err;
  }
}

/** A text file over one run's limit comes in parts of about this size, to pick from. */
const TEXT_PART_CHARS = 20_000;

/** A text file as one page, or in parts at line ends when it is longer than one run takes. */
function textPages(name: string, text: string): MaterialPage[] {
  if (text.length <= MAX_TEXT_CHARS) return [{ n: 1, label: name, text, scan: false }];
  const parts: string[] = [];
  let part = "";
  for (const line of text.split("\n")) {
    // A line longer than a part (no line breaks at all) is cut.
    for (let at = 0; at < Math.max(line.length, 1); at += TEXT_PART_CHARS) {
      const piece = line.slice(at, at + TEXT_PART_CHARS);
      if (part && part.length + piece.length + 1 > TEXT_PART_CHARS) {
        parts.push(part);
        part = "";
      }
      part += (part ? "\n" : "") + piece;
    }
  }
  if (part.trim()) parts.push(part);
  return parts.map((text, i) => ({ n: i + 1, label: `${name} (${i + 1})`, text: text.trim(), scan: false }));
}

/**
 * Photos of pages, one page each, shrunk for sending, numbered after the
 * `before` photos already there (the phone camera gives one shot at a time).
 * At most 6 per run: photos beyond that are left out.
 */
export async function readPhotos(files: File[], before: MaterialPage[] = []): Promise<Material> {
  const pages = [...before];
  for (const file of files.slice(0, Math.max(0, MAX_IMAGE_PAGES - before.length))) {
    let image: string;
    try {
      image = await fileToDataUrl(file, PAGE_IMAGE);
    } catch {
      throw new MaterialError("photo");
    }
    pages.push({ n: pages.length + 1, text: "", thumbnail: image, image, scan: true });
  }
  return { name: pages.length === 1 ? files[0]!.name : "photo", pages, pickAll: true };
}

/** What the picked pages add up to. */
export function totals(pages: MaterialPage[], picked: Set<number>) {
  let count = 0;
  let images = 0;
  let chars = 0;
  for (const page of pages) {
    if (!picked.has(page.n)) continue;
    count++;
    if (page.scan) images++;
    else chars += page.text.length;
  }
  return { count, images, chars, ...estimateRun({ chars, images }) };
}

/** True when one more page fits this run: page count, pictures and text all have a limit. */
export function fits(pages: MaterialPage[], picked: Set<number>, page: MaterialPage): boolean {
  const sum = totals(pages, picked);
  if (sum.count >= MAX_PAGES) return false;
  if (page.scan) return sum.images < MAX_IMAGE_PAGES;
  return sum.chars + page.text.length <= MAX_TEXT_CHARS;
}

/** "Select all": every page in order, as far as the limits go. */
export function pickAll(pages: MaterialPage[]): Set<number> {
  const picked = new Set<number>();
  for (const page of pages) if (fits(pages, picked, page)) picked.add(page.n);
  return picked;
}

/** Sizes a scanned PDF page is drawn at, largest first, until it is small enough to send. */
const SCAN_SIDES = [PAGE_IMAGE.maxSide, 1200, 900];

/** A scanned PDF page as a picture within PAGE_IMAGE's size, like a photo. */
async function drawScan(material: Material, n: number): Promise<string> {
  for (const side of SCAN_SIDES) {
    const image = await material.render!(n, side);
    if (image.length <= PAGE_IMAGE.maxChars) return image;
  }
  throw new MaterialError("unreadable");
}

/** The picked pages as the API takes them; scanned PDF pages are drawn now. */
export async function pagesToSend(material: Material, picked: Set<number>) {
  const out: ({ n: number; text: string } | { n: number; image: string })[] = [];
  for (const page of material.pages) {
    if (!picked.has(page.n)) continue;
    if (!page.scan) out.push({ n: page.n, text: page.text });
    else out.push({ n: page.n, image: page.image ?? (await drawScan(material, page.n)) });
  }
  return out;
}
