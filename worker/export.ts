/**
 * "Download my data" (Settings). Every table that has a user_id column and
 * holds the user's own data MUST be listed here, or it is silently missing
 * from their backup. test/ownership.test.ts fails when one is forgotten.
 */
export const exportTables: string[] = [
  "sets",
  "terms",
  "term_images",
  "term_state",
  "study_days",
  "term_stats",
  "match_best",
  "ai_drafts",
  "ai_draft_pages",
  "ai_usage",
];

/** Tables that have a user_id but must never be exported (secrets, plumbing). */
export const privateTables = ["sessions"];

export async function exportUserData(
  db: D1Database,
  userId: number,
  tables: string[] = exportTables,
): Promise<Record<string, unknown[]>> {
  // Table names cannot be bound as parameters; the list is ours, but check anyway.
  for (const table of tables) {
    if (!/^[a-z_][a-z0-9_]*$/.test(table)) throw new Error(`bad table name: ${table}`);
  }
  if (tables.length === 0) return {};
  // One round trip for all tables.
  const results = await db.batch(
    tables.map((table) => db.prepare(`SELECT * FROM "${table}" WHERE user_id = ?`).bind(userId)),
  );
  return Object.fromEntries(tables.map((table, i) => [table, results[i]!.results]));
}
