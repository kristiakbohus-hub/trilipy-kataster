-- 0118: PRIPOMIENKY VLASTNÍKA v rannom brífingu (2026-11-13, rozhodnutie „Áno, v rannom brífingu").
-- Veci, ktoré musí urobiť vlastník sám (appka/Claude ich urobiť nesmie). Ukazujú sa na karte Dobré ráno, kým ich
-- neoznačí ako hotové.
CREATE TABLE IF NOT EXISTS owner_todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  detail TEXT,
  done_at TEXT,
  done_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO owner_todos (slug, title, detail) VALUES
 ('repo-private', 'Prepnúť GitHub repozitár trilipy-kataster na súkromný',
  'Migrácie v repozitári obsahujú mená fyzických osôb. GitHub → repozitár → Settings → General → Danger Zone → Change repository visibility → Private.'),
 ('eu-login-egms', 'Dokončiť registráciu EU Login (pre dáta EGMS o poklesoch terénu)',
  'Formulár je predvyplnený v prehliadači v appke Claude (karta ecas.europa.eu): zaškrtnúť súhlas so spracovaním údajov, kliknúť Create an account a heslo nastaviť cez e-mail.'),
 ('ziadosti-up', 'Odoslať 10 žiadostí obciam o územné plány',
  'Hotové texty a prehľad s kontaktmi sú na Macu v 49_LIST_NEHNUTELNOSTI/up/ziadosti/final/ (PREHLAD.md). Obec má na odpoveď 12 pracovných dní (zákon 211/2000 po novele 401/2024).');
