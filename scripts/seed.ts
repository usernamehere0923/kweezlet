// Sample data for the demo user. LOCAL database only: `npm run db:reset` runs it
// after the migrations, so a fresh database never starts empty.
//
// New table with user data → add a few rows here. Get demo's id with a subquery:
//   `INSERT INTO sets (user_id, title) VALUES ((SELECT id FROM users WHERE username = 'demo'), 'Spanish animals')`
import { execFileSync } from "node:child_process";

const demo = "(SELECT id FROM users WHERE username = 'demo')";
const set = (title: string) => `(SELECT id FROM sets WHERE title = '${title}' AND user_id = ${demo})`;

const statements: string[] = [
  `INSERT INTO sets (user_id, title, description, term_lang, def_lang) VALUES
     (${demo}, 'Spanish animals', 'Vocabulary from chapter 1', 'es', 'en'),
     (${demo}, 'Swiss history', 'Dates and names to remember', 'de', 'en')`,
  `INSERT INTO terms (user_id, set_id, term, definition, position) VALUES
     (${demo}, ${set("Spanish animals")}, 'el perro', 'the dog', 0),
     (${demo}, ${set("Spanish animals")}, 'el gato', 'the cat', 1),
     (${demo}, ${set("Spanish animals")}, 'el caballo', 'the horse', 2),
     (${demo}, ${set("Spanish animals")}, 'el pajaro', 'the bird', 3),
     (${demo}, ${set("Spanish animals")}, 'el pez', 'the fish', 4)`,
  `INSERT INTO terms (user_id, set_id, term, definition, position) VALUES
     (${demo}, ${set("Swiss history")}, '1291', 'Bundesbrief, the founding charter of the Swiss Confederacy', 0),
     (${demo}, ${set("Swiss history")}, '1848', 'Bundesverfassung, the first Federal Constitution', 1),
     (${demo}, ${set("Swiss history")}, '1863', 'Red Cross founded in Geneva', 2),
     (${demo}, ${set("Swiss history")}, '1971', 'Frauenstimmrecht, women get the right to vote', 3),
     (${demo}, ${set("Swiss history")}, '2002', 'Switzerland joins the United Nations', 4)`,
];

if (statements.length === 0) {
  console.log("seed: no sample data yet");
} else {
  execFileSync("npx", ["wrangler", "d1", "execute", "DB", "--local", "--command", statements.join(";\n")], {
    stdio: "inherit",
  });
}
