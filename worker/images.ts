// A term's image ("media on cards"): one picture per term, stored as a data
// URL. The client downscales before sending (src/lib/images.ts); the server
// checks the shape and the size, and never trusts a term it does not own.
import { Hono } from "hono";
import { z } from "zod";
import { notifyLater } from "./live";
import type { AppEnv } from "./types";
import { idParam, validate } from "./validate";

/** A png/jpeg/webp picture as a data URL, at most 600k characters (~450 KB). */
export const imageDataUrl = z
  .string()
  .regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/)
  .max(600_000);

const imageBody = z.object({ image: imageDataUrl.nullable() });

/** The JSON shape of GET /sets/:id/images: term id -> data URL. */
export type SetImages = { images: Record<number, string> };

export const imageRoutes = new Hono<AppEnv>()
  // The images of a set's terms. Terms without one are simply missing from
  // the map; the data is only fetched where it is shown.
  .get("/sets/:id/images", validate("param", idParam), async (c) => {
    const { id } = c.req.valid("param");
    const userId = c.get("user").id;
    const [owned, rows] = await c.env.DB.batch([
      c.env.DB.prepare("SELECT 1 FROM sets WHERE id = ? AND user_id = ?").bind(id, userId),
      c.env.DB.prepare(
        `SELECT i.term_id, i.image FROM term_images i
           JOIN terms t ON t.id = i.term_id
          WHERE t.set_id = ? AND i.user_id = ?`,
      ).bind(id, userId),
    ]);
    if (owned!.results.length === 0) return c.json({ error: "not_found" as const }, 404);
    const images: Record<number, string> = {};
    for (const row of rows!.results as { term_id: number; image: string }[]) images[row.term_id] = row.image;
    return c.json({ images }, 200);
  })

  // Put an image on one of my terms, or take it off again (image: null).
  .put("/terms/:id/image", validate("param", idParam), validate("json", imageBody), async (c) => {
    const { id } = c.req.valid("param");
    const { image } = c.req.valid("json");
    const userId = c.get("user").id;
    const db = c.env.DB;
    const mine = await db.prepare("SELECT 1 FROM terms WHERE id = ? AND user_id = ?").bind(id, userId).first();
    if (!mine) return c.json({ error: "not_found" as const }, 404);
    if (image === null) {
      await db.prepare("DELETE FROM term_images WHERE term_id = ? AND user_id = ?").bind(id, userId).run();
    } else {
      // A second image replaces the first; one row per term (the primary key).
      await db
        .prepare(
          `INSERT INTO term_images (user_id, term_id, image) VALUES (?, ?, ?)
           ON CONFLICT (user_id, term_id) DO UPDATE SET image = excluded.image, updated_at = unixepoch()`,
        )
        .bind(userId, id, image)
        .run();
    }
    notifyLater(c, "sets");
    return c.json({ ok: true as const }, 200);
  });
