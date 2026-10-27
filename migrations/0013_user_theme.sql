-- The theme each account picked in Settings (worker/themes.ts lists them).
-- No CHECK: adding a theme must not need a migration. The worker validates
-- writes, and an id that no longer exists reads as the default.

ALTER TABLE users ADD COLUMN theme TEXT NOT NULL DEFAULT 'cardigan';
