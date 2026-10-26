// Sample data for the demo user. LOCAL database only: `npm run db:reset` runs it
// after the migrations, so a fresh database never starts empty.
//
// New table with user data → add a few rows here. Get demo's id with a subquery:
//   `INSERT INTO sets (user_id, title) VALUES ((SELECT id FROM users WHERE username = 'demo'), 'Spanish animals')`
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const demo = "(SELECT id FROM users WHERE username = 'demo')";
const student = "(SELECT id FROM users WHERE username = 'student')";
const set = (title: string) => `(SELECT id FROM sets WHERE title = '${title}' AND user_id = ${demo})`;
const draft = (user: string) => `(SELECT id FROM ai_drafts WHERE user_id = ${user} ORDER BY id LIMIT 1)`;
const term = (title: string, text: string) =>
  `(SELECT id FROM terms WHERE term = '${text}' AND set_id = ${set(title)})`;
/** A data URL of one of the app's icons: the stand-in photo on a demo card. */
const photo = (file: string) => `data:image/png;base64,${readFileSync(`public/${file}`).toString("base64")}`;

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
  // The Learn numbers behind those marks: two in a row = learned. Two terms
  // are due for a review now (the Home banner), two come back later.
  `INSERT INTO term_stats (user_id, term_id, set_id, correct, wrong, streak, review_step, due_at) VALUES
     (${demo}, ${term("Spanish animals", "el perro")}, ${set("Spanish animals")}, 2, 0, 2, 2, unixepoch() + 2 * 86400),
     (${demo}, ${term("Spanish animals", "el gato")}, ${set("Spanish animals")}, 2, 0, 2, 1, unixepoch() + 86400),
     (${demo}, ${term("Spanish animals", "el caballo")}, ${set("Spanish animals")}, 1, 0, 1, 1, unixepoch() - 3600),
     (${demo}, ${term("Swiss history", "1291")}, ${set("Swiss history")}, 1, 1, 0, 0, unixepoch() - 3600)`,
  // Best Match times: one fast round on the animals, an older one on history.
  `INSERT INTO match_best (user_id, set_id, seconds, achieved_at) VALUES
     (${demo}, ${set("Spanish animals")}, 12, unixepoch() - 86400),
     (${demo}, ${set("Swiss history")}, 27, unixepoch() - 3 * 86400)`,
  // Studied today and on the two days before: a three day streak.
  `INSERT INTO study_days (user_id, day) VALUES (${demo}, '${day(0)}'), (${demo}, '${day(1)}'), (${demo}, '${day(2)}')`,
  // Two cards carry an image ("media on cards").
  `INSERT INTO term_images (user_id, term_id, image) VALUES
     (${demo}, ${term("Spanish animals", "el gato")}, '${photo("icon-192.png")}'),
     (${demo}, ${term("Spanish animals", "el perro")}, '${photo("apple-touch-icon.png")}')`,
  // An unfinished AI draft: ready to review, one card unverified and unchecked.
  `INSERT INTO ai_drafts (user_id, status, source_name, kind, max_cards, title, term_lang, def_lang, instructions, pages_json, cards_json) VALUES
     (${demo}, 'ready', 'Vokabeln Kapitel 2.pdf', 'auto', 25, 'Spanish animals', 'es', 'en', '',
      '[{"n":1,"text":"Vokabeln Kapitel 2"},{"n":2,"text":"el perro — the dog\\nel gato — the cat"}]',
      '[{"term":"el perro","definition":"the dog","source":"el perro — the dog","page":2,"verified":true,"checked":true},{"term":"el gato","definition":"the cat","source":"el gato","page":2,"verified":true,"checked":true},{"term":"el caballo","definition":"the horse","source":"","page":null,"verified":false,"checked":false}]')`,
  // What the AI has cost so far: one create run on that draft, an older "more
  // cards" run whose draft is gone (the cost row stays).
  `INSERT INTO ai_usage (user_id, created_at, action, model, calls, input_tokens, cached_tokens, output_tokens, cost_nanos, duration_ms, draft_id) VALUES
     (${demo}, unixepoch() - 3600, 'create', 'glm-5.3-flash', 1, 8400, 0, 2100, 2310000, 38000, ${draft(demo)}),
     (${demo}, unixepoch() - 2 * 86400, 'more', 'glm-5.3-flash', 2, 11200, 4000, 3300, 2850000, 71000, NULL)`,
  // A second, normal account (student / student) for trying the monthly cap.
  `INSERT INTO ai_usage (user_id, created_at, action, model, calls, input_tokens, cached_tokens, output_tokens, cost_nanos, duration_ms, draft_id) VALUES
     (${student}, unixepoch() - 86400, 'create', 'glm-5.3-flash', 1, 5200, 0, 1400, 1480000, 29000, NULL)`,
];

execFileSync("npx", ["wrangler", "d1", "execute", "DB", "--local", "--command", statements.join(";\n")], {
  stdio: "inherit",
});
