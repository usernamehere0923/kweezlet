/**
 * "Download my data" (Settings). Every table that has a user_id column and
 * holds the user's own data MUST be listed here, or it is silently missing
 * from their backup. test/export.test.ts fails when one is forgotten.
 */
export const exportTables: string[] = [
  // "sets",
  // "terms",
];

/** Tables that have a user_id but must never be exported (secrets, plumbing). */
export const privateTables = ["sessions"];

export async function exportUserData(
  db: D1Database,
  userId: number,
  tables: string[] = exportTables,
): Promise<Record<string, unknown[]>> {
  const out: Record<string, unknown[]> = {};
  for (const table of tables) {
    // Table names cannot be bound as parameters; the list is ours, but check anyway.
    if (!/^[a-z_][a-z0-9_]*$/.test(table)) throw new Error(`bad table name: ${table}`);
    const { results } = await db.prepare(`SELECT * FROM "${table}" WHERE user_id = ?`).bind(userId).all();
    out[table] = results;
  }
  return out;
}
