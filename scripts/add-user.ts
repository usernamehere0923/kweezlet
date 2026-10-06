// Creates a user, or resets the password of an existing one.
//   npm run user:add -- anna 'some password'            (local dev database)
//   npm run user:add -- anna 'some password' --remote   (the live database)
import { execFileSync } from "node:child_process";
import { hashPassword, randomHex } from "../worker/crypto";

const args = process.argv.slice(2);
const remote = args.includes("--remote");
const [username, password] = args.filter((a) => !a.startsWith("--"));

if (!username || !password) {
  console.error("usage: npm run user:add -- <username> <password> [--remote]");
  process.exit(1);
}
if (!/^[a-zA-Z0-9_.-]{2,32}$/.test(username)) {
  console.error("username: 2-32 characters, letters, digits, _ . - only");
  process.exit(1);
}
if (password.length < 8) console.warn("warning: password is shorter than 8 characters");

const salt = randomHex(16);
const hash = await hashPassword(password, salt);
// username is checked above, salt and hash are hex: nothing here needs escaping.
const sql =
  `INSERT INTO users (username, password_hash, salt) VALUES ('${username}', '${hash}', '${salt}') ` +
  `ON CONFLICT (username) DO UPDATE SET password_hash = excluded.password_hash, salt = excluded.salt`;

execFileSync("npx", ["wrangler", "d1", "execute", "DB", remote ? "--remote" : "--local", "--command", sql], {
  stdio: "inherit",
});
console.log(`user "${username}" ready (${remote ? "remote" : "local"})`);
