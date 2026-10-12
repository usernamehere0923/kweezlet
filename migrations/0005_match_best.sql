-- The best Match time per set: one row per user and set. A finished round
-- only replaces the row when it was faster (worker/match.ts).

CREATE TABLE match_best (
  user_id     INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  set_id      INTEGER NOT NULL REFERENCES sets (id) ON DELETE CASCADE,
  seconds     INTEGER NOT NULL,
  achieved_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, set_id)
);
