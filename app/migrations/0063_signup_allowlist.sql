-- 0063_signup_allowlist.sql — registrácia LEN na pozvanie (uzavretie otvorenej registrácie na verejnej URL).
-- Prvý účet = admin, takže otvorená registrácia = ktokoľvek si vezme admina. Gate: zaregistrovať sa smú len emaily tu.
CREATE TABLE IF NOT EXISTS signup_allowlist (
  email      TEXT PRIMARY KEY,
  note       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO signup_allowlist (email, note) VALUES ('kristiak.bohus@gmail.com', 'owner/admin — seed');
