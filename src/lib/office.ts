// Word, PowerPoint and Excel files, read in the browser like PDFs: their text
// goes to the AI as numbered sections, so the quote check works on them too.
// .docx, .pptx and .xlsx are zip files of XML. No dependency: the browser's
// DecompressionStream unzips, DOMParser reads the XML.

/** One part of a file, sent like a PDF page: `n` is what the cards' page badge shows. */
export type OfficeSection = { n: number; label: string; text: string };

/**
 * Why a file could not be read, as a code the UI translates:
 * old_format = .doc/.ppt/.xls ("save it as .docx first"), unsupported = no
 * Office file at all, unreadable = damaged, or a zip feature we do not read.
 */
export type OfficeErrorCode = "old_format" | "unsupported" | "unreadable";
export class OfficeError extends Error {
  constructor(readonly code: OfficeErrorCode) {
    super(`office file: ${code}`);
    this.name = "OfficeError";
  }
}

/** A section longer than this is split, so the page picker can leave parts out. */
const MAX_SECTION_CHARS = 6000;

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const P = "http://schemas.openxmlformats.org/presentationml/2006/main";
const S = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const REL = "http://schemas.openxmlformats.org/package/2006/relationships";

/** The file's kind by its name: what extractSections can read. */
export function officeKind(name: string): "docx" | "pptx" | "xlsx" | "old" | null {
  const ext = /\.([a-z]+)$/i.exec(name)?.[1]?.toLowerCase();
  if (ext === "docx" || ext === "pptx" || ext === "xlsx") return ext;
  if (ext === "doc" || ext === "ppt" || ext === "xls") return "old";
  return null;
}

/** The text of a Word, PowerPoint or Excel file, as numbered sections. Throws OfficeError. */
export async function extractSections(file: File): Promise<OfficeSection[]> {
  const kind = officeKind(file.name);
  if (kind === "old") throw new OfficeError("old_format");
  if (kind === null) throw new OfficeError("unsupported");
  try {
    const zip = readZip(new Uint8Array(await readBytes(file)));
    if (kind === "docx") return await wordSections(zip);
    if (kind === "pptx") return await slideSections(zip);
    return await sheetSections(zip);
  } catch (err) {
    if (err instanceof OfficeError) throw err;
    throw new OfficeError("unreadable");
  }
}

// --- zip ---------------------------------------------------------------------

/** The files in a zip: name -> its text, unpacked when asked for. */
type Zip = { has: (name: string) => boolean; text: (name: string) => Promise<string> };

/**
 * Reads the central directory at the end of the zip. Sizes and offsets come
 * from there, never from the local headers: files written with a data
 * descriptor (LibreOffice, Google Docs exports) have zeros in those.
 */
function readZip(bytes: Uint8Array<ArrayBuffer>): Zip {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 22 || view.getUint32(0, true) !== 0x04034b50) throw new OfficeError("unreadable");
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new OfficeError("unreadable");
  const count = view.getUint16(eocd + 10, true);
  let at = view.getUint32(eocd + 16, true);
  const entries = new Map<string, { method: number; size: number; offset: number }>();
  const names = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new OfficeError("unreadable");
    const method = view.getUint16(at + 10, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const offset = view.getUint32(at + 42, true);
    const name = names.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    entries.set(name, { method, size, offset });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return {
    has: (name) => entries.has(name),
    text: async (name) => {
      const entry = entries.get(name);
      if (!entry) throw new OfficeError("unreadable");
      // The local header only tells where the data starts (its name and extra field vary).
      const start =
        entry.offset + 30 + view.getUint16(entry.offset + 26, true) + view.getUint16(entry.offset + 28, true);
      const data = bytes.subarray(start, start + entry.size);
      if (entry.method === 0) return new TextDecoder().decode(data);
      // ZIP64 or another compression method: not something Office writes for text.
      if (entry.method !== 8) throw new OfficeError("unreadable");
      const stream = new Response(data).body!.pipeThrough(new DecompressionStream("deflate-raw"));
      return new Response(stream).text();
    },
  };
}

function readBytes(file: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new OfficeError("unreadable"));
    reader.readAsArrayBuffer(file);
  });
}

function xml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) throw new OfficeError("unreadable");
  return doc;
}

const byTag = (node: Element | Document, ns: string, tag: string) => [...node.getElementsByTagNameNS(ns, tag)];

/** A part's relationships: id -> the path of its target, from the zip root. */
async function relations(zip: Zip, part: string): Promise<Map<string, string>> {
  const dir = part.slice(0, part.lastIndexOf("/") + 1);
  const rels = `${dir}_rels/${part.slice(dir.length)}.rels`;
  const map = new Map<string, string>();
  if (!zip.has(rels)) return map;
  for (const rel of byTag(xml(await zip.text(rels)), REL, "Relationship")) {
    const target = rel.getAttribute("Target") ?? "";
    map.set(rel.getAttribute("Id") ?? "", target.startsWith("/") ? target.slice(1) : dir + target);
  }
  return map;
}

// --- sections ----------------------------------------------------------------

type Block = { label: string; lines: string[] };

/** Blocks to numbered sections: empty ones go, long ones are split at line ends. */
function numbered(blocks: Block[]): OfficeSection[] {
  const sections: OfficeSection[] = [];
  for (const block of blocks) {
    const lines = block.lines.map((line) => line.trim()).filter(Boolean);
    let part: string[] = [];
    let length = 0;
    let parts = 0;
    const flush = () => {
      if (part.length === 0) return;
      parts++;
      const label = parts === 1 ? block.label : `${block.label} (${parts})`;
      sections.push({ n: sections.length + 1, label, text: part.join("\n") });
      part = [];
      length = 0;
    };
    for (const line of lines) {
      if (length + line.length > MAX_SECTION_CHARS) flush();
      part.push(line);
      length += line.length + 1;
    }
    flush();
  }
  return sections;
}

const short = (text: string) => (text.length > 60 ? `${text.slice(0, 59)}…` : text);

/**
 * Word: a section per heading (level 1 or 2, or the title). Headings are
 * found by their style's built-in name ("heading 1" in every language, while
 * the style id is localised: "berschrift1" in German Word) or outline level.
 */
async function wordSections(zip: Zip): Promise<OfficeSection[]> {
  const levels = zip.has("word/styles.xml") ? styleLevels(xml(await zip.text("word/styles.xml"))) : new Map();
  const body = byTag(xml(await zip.text("word/document.xml")), W, "body")[0];
  if (!body) throw new OfficeError("unreadable");
  const blocks: Block[] = [];
  let block: Block | null = null;
  for (const node of [...body.children]) {
    if (node.namespaceURI !== W) continue;
    if (node.localName === "p") {
      const text = paragraphText(node);
      const level = paragraphLevel(node, levels);
      if (level !== null && level <= 2 && text.trim()) {
        block = { label: short(text.trim()), lines: [text] };
        blocks.push(block);
      } else {
        if (!block) blocks.push((block = { label: "", lines: [] }));
        block.lines.push(text);
      }
    } else if (node.localName === "tbl") {
      if (!block) blocks.push((block = { label: "", lines: [] }));
      for (const row of byTag(node, W, "tr")) {
        block.lines.push(
          byTag(row, W, "tc")
            .map((cell) => byTag(cell, W, "p").map(paragraphText).join(" ").trim())
            .join(" | "),
        );
      }
    }
  }
  // Text before the first heading is labelled by its own first line.
  for (const b of blocks) if (!b.label) b.label = short(b.lines.find((line) => line.trim())?.trim() ?? "");
  return numbered(blocks);
}

/** Style id -> heading level, from the style's built-in name or its outline level. */
function styleLevels(styles: Document): Map<string, number> {
  const levels = new Map<string, number>();
  for (const style of byTag(styles, W, "style")) {
    const id = style.getAttributeNS(W, "styleId") ?? "";
    const name = byTag(style, W, "name")[0]?.getAttributeNS(W, "val") ?? "";
    const outline = byTag(style, W, "outlineLvl")[0]?.getAttributeNS(W, "val");
    const heading = /^heading ([1-9])$/i.exec(name);
    if (name.toLowerCase() === "title") levels.set(id, 1);
    else if (heading) levels.set(id, Number(heading[1]));
    else if (outline !== undefined && outline !== null) levels.set(id, Number(outline) + 1);
  }
  return levels;
}

function paragraphLevel(p: Element, levels: Map<string, number>): number | null {
  const outline = byTag(p, W, "outlineLvl")[0]?.getAttributeNS(W, "val");
  if (outline) return Number(outline) + 1;
  const style = byTag(p, W, "pStyle")[0]?.getAttributeNS(W, "val") ?? "";
  if (levels.has(style)) return levels.get(style)!;
  // No styles.xml: guess from the id, in the languages Word uses.
  const guess = /^(?:heading|berschrift|titre|titolo|t.tulo)\s*([1-9])$/i.exec(style);
  return guess ? Number(guess[1]) : null;
}

/** A paragraph's text: its runs, with tabs and line breaks kept. */
function paragraphText(p: Element): string {
  let text = "";
  for (const node of byTag(p, W, "*")) {
    if (node.localName === "t") text += node.textContent ?? "";
    else if (node.localName === "tab") text += "\t";
    else if (node.localName === "br") text += "\n";
  }
  return text;
}

/** PowerPoint: a section per slide, in show order, numbered like the slides. */
async function slideSections(zip: Zip): Promise<OfficeSection[]> {
  const part = "ppt/presentation.xml";
  const rels = await relations(zip, part);
  const ids = byTag(xml(await zip.text(part)), P, "sldId").map((slide) => slide.getAttributeNS(R, "id") ?? "");
  const sections: OfficeSection[] = [];
  for (const [i, id] of ids.entries()) {
    const path = rels.get(id);
    if (!path || !zip.has(path)) continue;
    const slide = xml(await zip.text(path));
    let title = "";
    const lines: string[] = [];
    for (const shape of byTag(slide, P, "sp")) {
      const paragraphs = byTag(shape, A, "p").map((p) =>
        byTag(p, A, "t")
          .map((t) => t.textContent ?? "")
          .join(""),
      );
      const kind = byTag(shape, P, "ph")[0]?.getAttribute("type");
      if (!title && (kind === "title" || kind === "ctrTitle")) title = paragraphs.join(" ").trim();
      lines.push(...paragraphs);
    }
    // Tables live in graphic frames, not shapes.
    for (const row of byTag(slide, A, "tr")) {
      lines.push(
        byTag(row, A, "tc")
          .map((cell) =>
            byTag(cell, A, "t")
              .map((t) => t.textContent ?? "")
              .join(""),
          )
          .join(" | "),
      );
    }
    const text = lines
      .map((line) => line.trim())
      .filter(Boolean)
      .join("\n");
    // The slide's own number, even when an empty slide before it is left out.
    if (text) sections.push({ n: i + 1, label: short(title || text.split("\n")[0]!), text });
  }
  return sections;
}

/** Excel: a section per sheet, each row a line "cell | cell". */
async function sheetSections(zip: Zip): Promise<OfficeSection[]> {
  const part = "xl/workbook.xml";
  const rels = await relations(zip, part);
  const shared = zip.has("xl/sharedStrings.xml")
    ? byTag(xml(await zip.text("xl/sharedStrings.xml")), S, "si").map((si) =>
        byTag(si, S, "t")
          .map((t) => t.textContent ?? "")
          .join(""),
      )
    : [];
  const blocks: Block[] = [];
  for (const sheet of byTag(xml(await zip.text(part)), S, "sheet")) {
    const path = rels.get(sheet.getAttributeNS(R, "id") ?? "");
    if (!path || !zip.has(path)) continue;
    const lines = byTag(xml(await zip.text(path)), S, "row").map((row) =>
      byTag(row, S, "c")
        .map((cell) => cellText(cell, shared))
        .filter(Boolean)
        .join(" | "),
    );
    blocks.push({ label: short(sheet.getAttribute("name") ?? ""), lines });
  }
  return numbered(blocks);
}

function cellText(cell: Element, shared: string[]): string {
  const type = cell.getAttribute("t");
  if (type === "inlineStr")
    return byTag(cell, S, "t")
      .map((t) => t.textContent ?? "")
      .join("");
  const value = byTag(cell, S, "v")[0]?.textContent ?? "";
  if (type === "s") return shared[Number(value)] ?? "";
  if (type === "b") return value === "1" ? "TRUE" : "FALSE";
  return value;
}
