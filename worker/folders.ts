import { Hono } from "hono";
import { z } from "zod";
import { notifyLater } from "./live";
import type { AppEnv } from "./types";
import { idParam, validate, validationError } from "./validate";

const folderBody = z.object({ name: z.string().trim().min(1).max(60) });

/** A folder on Home, with how many of the user's sets are in it. */
export type Folder = { id: number; name: string; setCount: number };

/** Whether `folderId` is one of the user's folders. */
export async function ownsFolder(db: D1Database, userId: number, folderId: number): Promise<boolean> {
  const row = await db.prepare("SELECT 1 FROM folders WHERE id = ? AND user_id = ?").bind(folderId, userId).first();
  return row !== null;
}

/** The SQLite error for a second folder with the same name (folders_user_name). */
const isTaken = (err: unknown) => err instanceof Error && err.message.includes("UNIQUE constraint failed");

export const folderRoutes = new Hono<AppEnv>()
  // My folders by name, each with its number of sets.
  .get("/folders", async (c) => {
    const { results } = await c.env.DB.prepare(
      `SELECT f.id, f.name,
              (SELECT COUNT(*) FROM sets s WHERE s.folder_id = f.id AND s.user_id = f.user_id) AS setCount
         FROM folders f
        WHERE f.user_id = ?
        ORDER BY f.name COLLATE NOCASE, f.id`,
    )
      .bind(c.get("user").id)
      .all<Folder>();
    return c.json(results, 200);
  })

  .post("/folders", validate("json", folderBody), async (c) => {
    const { name } = c.req.valid("json");
    try {
      const row = await c.env.DB.prepare("INSERT INTO folders (user_id, name) VALUES (?, ?) RETURNING id")
        .bind(c.get("user").id, name)
        .first<{ id: number }>();
      notifyLater(c, "sets");
      const folder: Folder = { id: row!.id, name, setCount: 0 };
      return c.json(folder, 201);
    } catch (err) {
      if (isTaken(err)) return validationError(c, { name: "taken" });
      throw err;
    }
  })

  .patch("/folders/:id", validate("param", idParam), validate("json", folderBody), async (c) => {
    const { id } = c.req.valid("param");
    const { name } = c.req.valid("json");
    try {
      const { meta } = await c.env.DB.prepare("UPDATE folders SET name = ? WHERE id = ? AND user_id = ?")
        .bind(name, id, c.get("user").id)
        .run();
      if (meta.changes === 0) return c.json({ error: "not_found" as const }, 404);
    } catch (err) {
      if (isTaken(err)) return validationError(c, { name: "taken" });
      throw err;
    }
    notifyLater(c, "sets");
    return c.json({ id, name }, 200);
  })

  // The sets stay; they are just in no folder any more.
  .delete("/folders/:id", validate("param", idParam), async (c) => {
    const { id } = c.req.valid("param");
    const user = c.get("user");
    const db = c.env.DB;
    const [, deleted] = await db.batch([
      db.prepare("UPDATE sets SET folder_id = NULL WHERE folder_id = ? AND user_id = ?").bind(id, user.id),
      db.prepare("DELETE FROM folders WHERE id = ? AND user_id = ?").bind(id, user.id),
    ]);
    if (deleted!.meta.changes === 0) return c.json({ error: "not_found" as const }, 404);
    notifyLater(c, "sets");
    return c.json({ ok: true as const }, 200);
  });
