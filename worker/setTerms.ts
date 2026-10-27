// Keeping a set's stored terms in step with an edited list (PATCH /sets/:id).

/** A term as the set form sends it: with an id when it already exists. */
type TermInput = { id?: number; kind?: "pair" | "cloze"; term: string; definition: string };

/** The ids of this user's terms in this set, or null when the set is not theirs. One query. */
export async function ownedTermIds(db: D1Database, userId: number, setId: number): Promise<Set<number> | null> {
  const { results } = await db
    .prepare(
      `SELECT t.id FROM sets s LEFT JOIN terms t ON t.set_id = s.id AND t.user_id = s.user_id
        WHERE s.id = ? AND s.user_id = ?`,
    )
    .bind(setId, userId)
    .all<{ id: number | null }>();
  if (results.length === 0) return null;
  return new Set(results.flatMap((row) => (row.id === null ? [] : [row.id])));
}

/**
 * The statements that make the stored terms exactly the given list: new ones
 * are inserted, given ids are updated in place (their id survives, so study
 * progress sticks to the term), ids that disappear are deleted. `ownedIds`
 * must be the set's owned term ids (ownedTermIds); every given id must be in it.
 */
export function termStatements(
  db: D1Database,
  userId: number,
  setId: number,
  terms: TermInput[],
  ownedIds: Set<number>,
): D1PreparedStatement[] {
  const keep = new Set(terms.flatMap((t) => (t.id === undefined ? [] : [t.id])));
  const statements: D1PreparedStatement[] = [...ownedIds]
    .filter((termId) => !keep.has(termId))
    .map((termId) => db.prepare("DELETE FROM terms WHERE id = ? AND user_id = ?").bind(termId, userId));
  terms.forEach((t, position) => {
    statements.push(
      t.id === undefined
        ? db
            .prepare("INSERT INTO terms (user_id, set_id, term, definition, position, kind) VALUES (?, ?, ?, ?, ?, ?)")
            .bind(userId, setId, t.term, t.definition, position, t.kind ?? "pair")
        : db
            .prepare(
              `UPDATE terms SET term = ?, definition = ?, position = ?, kind = ?
                WHERE id = ? AND set_id = ? AND user_id = ?`,
            )
            .bind(t.term, t.definition, position, t.kind ?? "pair", t.id, setId, userId),
    );
  });
  return statements;
}

/** True when every given term id is one of this user's terms in this set. */
export function allIdsOwned(terms: TermInput[], ownedIds: Set<number>): boolean {
  return terms.every((t) => t.id === undefined || ownedIds.has(t.id));
}
