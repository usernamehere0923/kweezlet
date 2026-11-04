-- What the user did each day, for the Statistics page: how many cards were
-- studied, how many answers were right or wrong, how many cards were learned,
-- and how long the user actively studied. The day is YYYY-MM-DD in the user's
-- own timezone (the client sends it), like study_days; seconds and the counts
-- of the modes without per-answer requests come from the client as well
-- (worker/activity.ts), the Learn/Review answers are counted by the server
-- (worker/study.ts).
CREATE TABLE day_stats (
  user_id  INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  day      TEXT    NOT NULL,
  cards    INTEGER NOT NULL DEFAULT 0,
  correct  INTEGER NOT NULL DEFAULT 0,
  wrong    INTEGER NOT NULL DEFAULT 0,
  learned  INTEGER NOT NULL DEFAULT 0,
  seconds  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

-- The last time each set was studied, and in which mode: "Recently used" and
-- "Quick resume" on Home. One row per set, overwritten by every session.
CREATE TABLE set_activity (
  user_id         INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  set_id          INTEGER NOT NULL REFERENCES sets (id) ON DELETE CASCADE,
  last_studied_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_mode       TEXT    NOT NULL CHECK (last_mode IN ('flashcards', 'learn', 'test', 'match', 'review')),
  PRIMARY KEY (user_id, set_id)
);
CREATE INDEX set_activity_recent ON set_activity (user_id, last_studied_at DESC);
