-- How far the user got with each term, and on which days they studied.
-- term_state has no row until a term is marked or starred: no row (or a NULL
-- status) means "unseen".

CREATE TABLE term_state (
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  term_id    INTEGER NOT NULL REFERENCES terms (id) ON DELETE CASCADE,
  set_id     INTEGER NOT NULL REFERENCES sets (id) ON DELETE CASCADE,
  status     TEXT CHECK (status IN ('still_learning', 'know_it')),
  starred    INTEGER NOT NULL DEFAULT 0 CHECK (starred IN (0, 1)),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, term_id)
);
CREATE INDEX term_state_set ON term_state (user_id, set_id);

-- One row per day the user studied. The day is YYYY-MM-DD in the user's own
-- timezone (the client sends it), so "today" is their today.
CREATE TABLE study_days (
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  day     TEXT    NOT NULL,
  PRIMARY KEY (user_id, day)
);
