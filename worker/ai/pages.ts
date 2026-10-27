/** One page of material as the browser sends it: extracted text, or a scan/photo as an image. */
export type PageInput = { n: number; text: string } | { n: number; image: string };

/** A draft holds at most this many cards: what the review screen can save in one go. */
export const MAX_DRAFT_CARDS = 500;

/** One run's material: at most 60 pages, 6 of them images, 400,000 characters of text. */
export const MAX_PAGES = 60;
export const MAX_IMAGE_PAGES = 6;
export const MAX_TEXT_CHARS = 400_000;

/**
 * The pages one run may send, in order, within the limits above. A draft can
 * hold more than one run's worth ("More cards" adds pages): a regenerate then
 * sends what fits, never more than z.ai was promised for one run.
 */
export function withinRunLimits<T extends { text: string } | { image: string }>(pages: T[]): T[] {
  const out: T[] = [];
  let images = 0;
  let chars = 0;
  for (const page of pages) {
    if (out.length >= MAX_PAGES) break;
    if ("image" in page) {
      if (images >= MAX_IMAGE_PAGES) continue;
      images++;
    } else {
      if (chars + page.text.length > MAX_TEXT_CHARS) continue;
      chars += page.text.length;
    }
    out.push(page);
  }
  return out;
}

/**
 * The pages as rows of ai_draft_pages; an existing page number is replaced.
 * `draftId: "latest"` = the user's newest draft, for the batch that creates it.
 */
export function pageStatements(
  db: D1Database,
  userId: number,
  draftId: number | "latest",
  pages: PageInput[],
): D1PreparedStatement[] {
  const draft = draftId === "latest" ? "(SELECT MAX(id) FROM ai_drafts WHERE user_id = ?)" : "?";
  return pages.map((page) =>
    db
      .prepare(
        `INSERT OR REPLACE INTO ai_draft_pages (user_id, draft_id, n, text, image) VALUES (?, ${draft}, ?, ?, ?)`,
      )
      .bind(
        userId,
        draftId === "latest" ? userId : draftId,
        page.n,
        "text" in page ? page.text : null,
        "image" in page ? page.image : null,
      ),
  );
}
