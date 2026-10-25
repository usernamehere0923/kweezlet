-- One image per term ("media on cards"). The picture is a data URL
-- (png/jpeg/webp), downscaled before it gets here (src/lib/images.ts); a D1
-- row caps at 2 MB, and the API caps a data URL at 600,000 characters.

CREATE TABLE term_images (
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  term_id    INTEGER NOT NULL REFERENCES terms (id) ON DELETE CASCADE,
  image      TEXT    NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, term_id)
);
