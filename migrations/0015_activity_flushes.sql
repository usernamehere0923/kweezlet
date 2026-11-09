-- Activity flushes already counted (worker/activity.ts). A flush whose answer
-- never reached the client (connection dropped after the write) is sent again
-- with the same id; without this the retry would count its cards and seconds
-- twice. Bookkeeping, not user data: not exported, pruned after a week.
CREATE TABLE activity_flushes (
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  id         TEXT    NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, id)
);
