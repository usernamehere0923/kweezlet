/** One page of material as the browser sends it: extracted text, or a scan/photo as an image. */
export type PageInput = { n: number; text: string } | { n: number; image: string };

/** A draft holds at most this many cards: what the review screen can save in one go. */
export const MAX_DRAFT_CARDS = 500;

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
