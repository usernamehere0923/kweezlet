// Sample data for the demo user. LOCAL database only: `npm run db:reset` runs it
// after the migrations, so a fresh database never starts empty.
//
// New table with user data → add a few rows here. Get demo's id with a subquery:
//   `INSERT INTO sets (user_id, title) VALUES ((SELECT id FROM users WHERE username = 'demo'), 'Spanish animals')`
import { execFileSync } from "node:child_process";

const demo = "(SELECT id FROM users WHERE username = 'demo')";
const set = (title: string) => `(SELECT id FROM sets WHERE title = '${title}' AND user_id = ${demo})`;
const term = (title: string, text: string) =>
  `(SELECT id FROM terms WHERE term = '${text}' AND set_id = ${set(title)})`;

/** YYYY-MM-DD, `offset` days ago, in the local timezone. */
const day = (offset: number) => {
  const d = new Date(Date.now() - offset * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

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
  // Two terms learned, one still in progress, one starred for later.
  `INSERT INTO term_state (user_id, term_id, set_id, status, starred) VALUES
     (${demo}, ${term("Spanish animals", "el perro")}, ${set("Spanish animals")}, 'know_it', 0),
     (${demo}, ${term("Spanish animals", "el gato")}, ${set("Spanish animals")}, 'know_it', 1),
     (${demo}, ${term("Swiss history", "1291")}, ${set("Swiss history")}, 'still_learning', 1)`,
  // The Learn numbers behind those marks: two in a row = learned.
  `INSERT INTO term_stats (user_id, term_id, set_id, correct, wrong, streak) VALUES
     (${demo}, ${term("Spanish animals", "el perro")}, ${set("Spanish animals")}, 2, 0, 2),
     (${demo}, ${term("Spanish animals", "el gato")}, ${set("Spanish animals")}, 2, 0, 2),
     (${demo}, ${term("Spanish animals", "el caballo")}, ${set("Spanish animals")}, 1, 0, 1),
     (${demo}, ${term("Swiss history", "1291")}, ${set("Swiss history")}, 1, 1, 0)`,
  // Studied today and on the two days before: a three day streak.
  `INSERT INTO study_days (user_id, day) VALUES (${demo}, '${day(0)}'), (${demo}, '${day(1)}'), (${demo}, '${day(2)}')`,
];

if (statements.length === 0) {
  console.log("seed: no sample data yet");
} else {
  execFileSync("npx", ["wrangler", "d1", "execute", "DB", "--local", "--command", statements.join(";\n")], {
    stdio: "inherit",
  });
}
