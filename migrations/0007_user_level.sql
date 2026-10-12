-- One level per account: admin, pro or standard. No UI or route changes it.
-- The first account is admin; everybody after it is standard.

ALTER TABLE users ADD COLUMN level TEXT NOT NULL DEFAULT 'standard'
  CHECK (level IN ('admin', 'pro', 'standard'));

-- Accounts that already exist: the oldest one is the first user.
UPDATE users SET level = 'admin' WHERE id = (SELECT MIN(id) FROM users);

-- New accounts: whoever is created into an empty table becomes admin. A
-- trigger, so every way of creating a user (user:add, the seed, tests) gets it.
CREATE TRIGGER users_first_is_admin AFTER INSERT ON users
  WHEN NOT EXISTS (SELECT 1 FROM users WHERE id <> NEW.id)
BEGIN
  UPDATE users SET level = 'admin' WHERE id = NEW.id;
END;
