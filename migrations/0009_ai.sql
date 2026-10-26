-- AI-made sets (phase 8): the drafts an AI run proposes and what every run
-- cost. A draft lives until the user keeps it (saved into a set) or discards
-- it; the usage rows stay forever, for the running total in Settings.
-- Money is counted in nanodollars (cost_nanos: 1e-9 USD) as exact integers.

CREATE TABLE ai_drafts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  -- 'running' while the AiRunner Durable Object works on it.
  status        TEXT    NOT NULL CHECK (status IN ('running', 'ready', 'failed')),
  -- Why it failed, a code the UI translates ('ai_busy', 'ai_key', ...).
  error         TEXT,
  -- Where the material came from: a file name, 'pasted', 'photo'.
  source_name   TEXT    NOT NULL DEFAULT '',
  -- What to make: 'auto' (the AI classifies) or one kind outright.
  kind          TEXT    NOT NULL CHECK (kind IN ('auto', 'vocabulary', 'questions', 'terms')),
  -- 0 = as many cards as the material supports (hard cap 60).
  max_cards     INTEGER NOT NULL DEFAULT 0,
  -- Filled in by the AI (detected kind, suggested title, languages) after the run.
  title         TEXT    NOT NULL DEFAULT '',
  term_lang     TEXT CHECK (term_lang IS NULL OR term_lang IN ('en', 'de', 'fr', 'it', 'es')),
  def_lang      TEXT CHECK (def_lang IS NULL OR def_lang IN ('en', 'de', 'fr', 'it', 'es')),
  instructions  TEXT    NOT NULL DEFAULT '',
  -- Where the cards go when the draft is kept. NULL = a new set.
  set_id        INTEGER REFERENCES sets (id) ON DELETE SET NULL,
  -- The cards: [{term, definition, source, page, verified, checked}].
  cards_json    TEXT    NOT NULL DEFAULT '[]'
);
CREATE INDEX ai_drafts_user ON ai_drafts (user_id, updated_at DESC);

-- The material of a draft's run, so "More cards" and the quote check never
-- need the file again. One row per page, not one column for all: D1 refuses
-- a row over 2 MB, and six scan or photo pages as data URLs are more than that.
-- A page is its text or its image (a JPEG data URL), never both.
CREATE TABLE ai_draft_pages (
  user_id   INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  draft_id  INTEGER NOT NULL REFERENCES ai_drafts (id) ON DELETE CASCADE,
  n         INTEGER NOT NULL CHECK (n > 0),
  text      TEXT,
  image     TEXT,
  CHECK ((text IS NULL) <> (image IS NULL)),
  -- Far below the row limit: text runs are capped at 400,000 characters in all.
  CHECK (length(coalesce(text, image)) <= 1500000),
  PRIMARY KEY (draft_id, n)
);
CREATE INDEX ai_draft_pages_user ON ai_draft_pages (user_id);

CREATE TABLE ai_usage (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at     INTEGER NOT NULL DEFAULT (unixepoch()),
  action         TEXT    NOT NULL CHECK (action IN ('create', 'regenerate', 'more')),
  model          TEXT    NOT NULL,
  -- One action can be several calls: the run plus its repair retry.
  calls          INTEGER NOT NULL DEFAULT 0,
  input_tokens   INTEGER NOT NULL DEFAULT 0,
  cached_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens  INTEGER NOT NULL DEFAULT 0,
  cost_nanos     INTEGER NOT NULL DEFAULT 0,
  duration_ms    INTEGER NOT NULL DEFAULT 0,
  -- The draft this ran for. Gone with the draft; the cost stays.
  draft_id       INTEGER REFERENCES ai_drafts (id) ON DELETE SET NULL
);
CREATE INDEX ai_usage_user ON ai_usage (user_id, created_at DESC);
