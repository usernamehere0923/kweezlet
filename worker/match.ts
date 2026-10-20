import { Hono } from "hono";
import { z } from "zod";
import { notifyLater } from "./live";
import type { AppEnv } from "./types";
import { idParam, validate } from "./validate";

/** A finished Match round: whole seconds, and an hour is plenty for 12 tiles. */
const scoreBody = z.object({ seconds: z.number().int().positive().max(3600) });

export const matchRoutes = new Hono<AppEnv>()
  // Record a finished Match round. Only a faster time replaces the best one;
  // the answer is computed here, so two devices always agree on who won.
  .post("/sets/:id/match", validate("param", idParam), validate("json", scoreBody), async (c) => {
    const user = c.get("user");
    const { id } = c.req.valid("param");
    const { seconds } = c.req.valid("json");
    const db = c.env.DB;
    // One conditional upsert: two rounds finishing at once cannot let the
    // slower one overwrite the faster. The insert reads the set itself, so a
    // set that isn't the user's writes nothing and has no best time to read.
    const [saved, best] = await db.batch([
      db
        .prepare(
          `INSERT INTO match_best (user_id, set_id, seconds, achieved_at)
             SELECT user_id, id, ?, unixepoch() FROM sets WHERE id = ? AND user_id = ?
           ON CONFLICT (user_id, set_id) DO UPDATE SET seconds = excluded.seconds, achieved_at = unixepoch()
             WHERE excluded.seconds < match_best.seconds`,
        )
        .bind(seconds, id, user.id),
      db.prepare("SELECT seconds FROM match_best WHERE user_id = ? AND set_id = ?").bind(user.id, id),
    ]);
    const row = best!.results[0] as { seconds: number } | undefined;
    if (!row) return c.json({ error: "not_found" as const }, 404);
    const isNewBest = saved!.meta.changes > 0;
    if (isNewBest) notifyLater(c, "match");
    const result: { best: number; isNewBest: boolean } = { best: row.seconds, isNewBest };
    return c.json(result, 200);
  });
