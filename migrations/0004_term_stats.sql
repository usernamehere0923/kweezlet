-- What the user got right or wrong per term: the numbers behind Learn mode,
-- and in Phase 5 behind spaced repetition. streak = correct answers in a row,
-- reset to 0 by a wrong one; two in a row means the term is learned.

CREATE TABLE term_stats (
  user_id     INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  term_id     INTEGER NOT NULL REFERENCES terms (id) ON DELETE CASCADE,
  set_id      INTEGER NOT NULL REFERENCES sets (id) ON DELETE CASCADE,
  correct     INTEGER NOT NULL DEFAULT 0,
  wrong       INTEGER NOT NULL DEFAULT 0,
  streak      INTEGER NOT NULL DEFAULT 0,
  last_seen_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, term_id)
);
CREATE INDEX term_stats_set ON term_stats (user_id, set_id);
