// Wipes the LOCAL database, re-runs all migrations, creates demo/demo and
// student/student and their sample data. Never touches the live database.
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";

rmSync(".wrangler/state/v3/d1", { recursive: true, force: true });
const run = (args: string[]) => execFileSync("npx", args, { stdio: "inherit" });
run(["wrangler", "d1", "migrations", "apply", "DB", "--local"]);
run(["tsx", "scripts/add-user.ts", "demo", "demo"]);
// A second, normal user (no admin level) to try the AI spending cap screens.
run(["tsx", "scripts/add-user.ts", "student", "student"]);
run(["tsx", "scripts/seed.ts"]);
