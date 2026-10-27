-- Phase 9: folders group a user's sets on Home. One level; a set sits in no
-- folder or in one. Deleting a folder keeps its sets: they just lose it.

CREATE TABLE folders (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
-- One name once per user, whatever the case ("Spanish" = "spanish").
CREATE UNIQUE INDEX folders_user_name ON folders (user_id, name COLLATE NOCASE);

-- The set's folder: always one of the same user's (worker/folders.ts checks).
ALTER TABLE sets ADD COLUMN folder_id INTEGER REFERENCES folders (id) ON DELETE SET NULL;
CREATE INDEX sets_folder ON sets (folder_id);
