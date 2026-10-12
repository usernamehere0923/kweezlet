-- Study sets and their terms: the core of kweezlet.
-- Both tables belong to one user (user_id ... ON DELETE CASCADE); terms are
-- deleted with their set.

CREATE TABLE sets (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title       TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  -- Language of the terms / of the definitions (nullable, for future TTS and
  -- smart grading). Valid values live in worker/sets.ts.
  term_lang   TEXT,
  def_lang    TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX sets_user ON sets (user_id, updated_at);

CREATE TABLE terms (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  set_id     INTEGER NOT NULL REFERENCES sets (id) ON DELETE CASCADE,
  term       TEXT    NOT NULL,
  definition TEXT    NOT NULL,
  -- 0-based order inside the set.
  position   INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX terms_set ON terms (set_id, position);
CREATE INDEX terms_user ON terms (user_id);
