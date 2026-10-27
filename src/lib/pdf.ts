// Every pdf.js call lives here, behind one small API, and pdf.js itself is
// only loaded when a PDF is picked (it is big). jsdom cannot run it: UI tests
// mock this module; the real thing is checked in the browser.

/** One page: its text (what the AI reads and the quote check uses) and a small picture. */
export type PdfPage = { n: number; text: string; thumbnail?: string };

export type PdfDocument = {
  pages: PdfPage[];
  /** Page `n` as a JPEG data URL, at most `maxSide` px: what a scanned page sends instead of text. */
  render: (n: number, maxSide: number) => Promise<string>;
  /** Frees the document and its worker. Call when the file is replaced. */
  close: () => void;
};

/** A page with less text than this has no real text layer: a scan, sent as a picture. */
export const SCAN_TEXT_CHARS = 20;
/** Thumbnails of the page picker, this wide in px. */
const THUMB_WIDTH = 160;
/** Only this many pages get a thumbnail (drawing them takes time on the phone); later ones show their text. */
const MAX_THUMBNAILS = 100;

/** Opens a PDF: every page's text and thumbnail. Throws when it is no PDF or a damaged one. */
export async function openPdf(file: File): Promise<PdfDocument> {
  const pdfjs = await import("pdfjs-dist");
  const { default: workerUrl } = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;

  async function draw(n: number, width: number, quality: number): Promise<string> {
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: width / base.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await page.render({ canvas, viewport }).promise;
    return canvas.toDataURL("image/jpeg", quality);
  }

  try {
    return { pages: await readPages(), render, close: () => void task.destroy() };
  } catch (err) {
    // Destroying the loading task frees the document and its worker.
    void task.destroy();
    throw err;
  }

  async function render(n: number, maxSide: number): Promise<string> {
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    // Fit the longer side; a landscape page is limited by its width.
    const width = base.width >= base.height ? maxSide : (maxSide * base.width) / base.height;
    return draw(n, Math.min(width, base.width * 3), 0.8);
  }

  async function readPages(): Promise<PdfPage[]> {
    const pages: PdfPage[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      // Lines as the PDF has them: the quote check joins hyphens at line ends.
      let text = "";
      for (const item of content.items) {
        if (!("str" in item)) continue;
        text += item.str + (item.hasEOL ? "\n" : "");
      }
      const thumbnail = n <= MAX_THUMBNAILS ? await draw(n, THUMB_WIDTH, 0.7) : undefined;
      pages.push({ n, text: text.trim(), thumbnail });
    }
    return pages;
  }
}
