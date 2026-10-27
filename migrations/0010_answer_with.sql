-- Phase 9: which side a set's questions ask for. 'both' asks either way round
-- (what every set did before), 'term' shows the definition and asks for the
-- term, 'definition' the other way. Learn, Review, Test and the first side of
-- Flashcards follow it.

ALTER TABLE sets ADD COLUMN answer_with TEXT NOT NULL DEFAULT 'both'
  CHECK (answer_with IN ('both', 'term', 'definition'));
