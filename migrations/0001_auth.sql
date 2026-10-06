-- Accounts, sessions and the login rate limit. Plumbing only: business tables
-- go into new numbered files (0002_..., 0003_...), never into this one.

CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT    NOT NULL,
  salt          TEXT    NOT NULL,
  locale        TEXT    NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'de-CH')),
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

-- The cookie holds a random token; only its SHA-256 is stored, so a leaked
-- database does not leak working sessions.
CREATE TABLE sessions (
  token_hash TEXT    PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions (user_id);

CREATE TABLE login_attempts (
  username TEXT    NOT NULL COLLATE NOCASE,
  ip       TEXT    NOT NULL,
  at       INTEGER NOT NULL
);
CREATE INDEX login_attempts_username ON login_attempts (username, at);
CREATE INDEX login_attempts_ip ON login_attempts (ip, at);
