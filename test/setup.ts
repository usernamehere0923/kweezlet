import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach } from "vitest";

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

// Storage is shared by all tests in a file, so every test starts empty.
// Every table with user data cascades from users (see AGENTS.md).
beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DROP TABLE IF EXISTS notes"),
    env.DB.prepare("DELETE FROM users"),
    env.DB.prepare("DELETE FROM login_attempts"),
    env.DB.prepare("DELETE FROM sqlite_sequence"),
  ]);
});
