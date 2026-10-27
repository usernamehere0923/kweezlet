-- Phase 9: fill-in-the-blank (cloze) cards. A cloze term is a sentence with
-- one part marked {{like this}}; its definition is that part (worker/cloze.ts).
-- Every term so far is a term/definition pair.

ALTER TABLE terms ADD COLUMN kind TEXT NOT NULL DEFAULT 'pair'
  CHECK (kind IN ('pair', 'cloze'));

-- What an AI draft makes: pairs, or cloze sentences. A column of its own, not a
-- new ai_drafts.kind value: changing that CHECK means rebuilding the table, and
-- dropping it would cascade into ai_draft_pages.
ALTER TABLE ai_drafts ADD COLUMN form TEXT NOT NULL DEFAULT 'pair'
  CHECK (form IN ('pair', 'cloze'));
