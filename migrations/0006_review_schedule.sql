-- Spaced repetition gets its own counter. term_stats.streak counts correct
-- answers in a row from any mode (Learn uses it for "learned"); review_step
-- only moves when a term that is due gets answered, so cramming or answering
-- early does not push the next review out. due_at (epoch seconds) is when
-- the term comes back.
ALTER TABLE term_stats ADD COLUMN review_step INTEGER NOT NULL DEFAULT 0;
ALTER TABLE term_stats ADD COLUMN due_at INTEGER NOT NULL DEFAULT 0;
-- Terms answered before: back one day after they were last seen.
UPDATE term_stats SET due_at = last_seen_at + 86400;
CREATE INDEX term_stats_due ON term_stats (user_id, due_at);
