// Sample data for the demo user. LOCAL database only: `npm run db:reset` runs it
// after the migrations, so a fresh database never starts empty.
//
// New table with user data → add a few rows here. Get demo's id with a subquery:
//   `INSERT INTO sets (user_id, title) VALUES ((SELECT id FROM users WHERE username = 'demo'), 'Spanish animals')`
import { execFileSync } from "node:child_process";

const statements: string[] = [];

if (statements.length === 0) {
  console.log("seed: no sample data yet");
} else {
  execFileSync("npx", ["wrangler", "d1", "execute", "DB", "--local", "--command", statements.join(";\n")], {
    stdio: "inherit",
  });
}
