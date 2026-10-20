// Rows written straight into the database, for tests that need data the API
// would take several requests to build.
import { env } from "cloudflare:workers";

/** A set with optional terms ([term, definition] pairs, in order). */
export async function addSet(
  userId: number,
  title: string,
  { description = "", terms = [] }: { description?: string; terms?: [string, string][] } = {},
): Promise<{ id: number; termIds: number[] }> {
  const row = await env.DB.prepare("INSERT INTO sets (user_id, title, description) VALUES (?, ?, ?) RETURNING id")
    .bind(userId, title, description)
    .first<{ id: number }>();
  const id = row!.id;
  const termIds: number[] = [];
  for (const [position, [term, definition]] of terms.entries()) {
    termIds.push(await insertTerm(userId, id, term, definition, position));
  }
  return { id, termIds };
}

/** A term, optionally with an answer history: on review step `step`, due `dueInDays` from now (negative = overdue). */
export async function addTerm(
  userId: number,
  setId: number,
  term: string,
  position: number,
  history: { step: number; dueInDays: number; streak?: number } | null,
): Promise<number> {
  const id = await insertTerm(userId, setId, term, `the ${term}`, position);
  if (history) {
    const streak = history.streak ?? history.step;
    await env.DB.prepare(
      `INSERT INTO term_stats (user_id, term_id, set_id, correct, wrong, streak, review_step, due_at)
       VALUES (?, ?, ?, ?, 0, ?, ?, unixepoch() + ? * 86400)`,
    )
      .bind(userId, id, setId, streak, streak, history.step, history.dueInDays)
      .run();
  }
  return id;
}

async function insertTerm(userId: number, setId: number, term: string, definition: string, position: number) {
  const row = await env.DB.prepare(
    "INSERT INTO terms (user_id, set_id, term, definition, position) VALUES (?, ?, ?, ?, ?) RETURNING id",
  )
    .bind(userId, setId, term, definition, position)
    .first<{ id: number }>();
  return row!.id;
}
