// Wipes the LOCAL database, re-runs all migrations, creates demo/demo and its sample data.
// Never touches the live database.
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";

rmSync(".wrangler/state/v3/d1", { recursive: true, force: true });
const run = (args: string[]) => execFileSync("npx", args, { stdio: "inherit" });
run(["wrangler", "d1", "migrations", "apply", "DB", "--local"]);
run(["tsx", "scripts/add-user.ts", "demo", "demo"]);
run(["tsx", "scripts/seed.ts"]);
