import { Hono } from "hono";
import { accountRoutes } from "./account";
import { authRoutes, requireUser } from "./auth";
import { liveRoutes } from "./live";
import { matchRoutes } from "./match";
import { reviewRoutes } from "./review";
import { setRoutes } from "./sets";
import { streakRoutes } from "./streak";
import { studyRoutes } from "./study";
import type { AppEnv } from "./types";

// Only /api/* reaches this code (see wrangler.jsonc); everything else is the React app.
// Routes are chained so `AppType` carries every route's types to the UI (src/lib/api.ts).
const app = new Hono<AppEnv>()
  .use("/api/*", requireUser)
  .route("/api", authRoutes)
  .route("/api/me", accountRoutes)
  .route("/api", liveRoutes)
  .route("/api", setRoutes)
  .route("/api", matchRoutes)
  .route("/api", reviewRoutes)
  .route("/api", studyRoutes)
  .route("/api", streakRoutes)
  .all("/api/*", (c) => c.json({ error: "not_found" as const }, 404));

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "server_error" as const }, 500);
});

export type AppType = typeof app;
export { UserChannel } from "./live";
export default app;
