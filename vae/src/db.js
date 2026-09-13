const fs = require('fs');
const path = require('path');
const sqlite = require('./sqlite');

const DATA_DIR = process.env.VAE_DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = sqlite.open(path.join(DATA_DIR, 'vae.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  accent        TEXT NOT NULL DEFAULT '#7c5cff',
  active        INTEGER NOT NULL DEFAULT 1,
  is_sample     INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- One row per payment. A payment can carry USD, Robux, or both at once.
-- It always counts towards the team total; when member_id is set it also
-- counts as that member's own money.
CREATE TABLE IF NOT EXISTS entries (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  kind          TEXT NOT NULL,
  title         TEXT NOT NULL,
  usd_cents     INTEGER NOT NULL DEFAULT 0,
  robux         INTEGER NOT NULL DEFAULT 0,
  category      TEXT NOT NULL DEFAULT 'Other',
  occurred_on   TEXT NOT NULL,
  month_key     TEXT NOT NULL,
  note          TEXT NOT NULL DEFAULT '',
  member_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  percent_bp    INTEGER,
  of_usd_cents  INTEGER,
  of_robux      INTEGER,
  split_id      TEXT,
  split_label   TEXT,
  is_sample     INTEGER NOT NULL DEFAULT 0,
  created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL,
  updated_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_entries_month ON entries(month_key);
CREATE INDEX IF NOT EXISTS idx_entries_member ON entries(member_id);
CREATE INDEX IF NOT EXISTS idx_entries_split ON entries(split_id);

CREATE TABLE IF NOT EXISTS rooms (
  user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  room_name   TEXT NOT NULL,
  visibility  TEXT NOT NULL DEFAULT 'team',
  edit_access TEXT NOT NULL DEFAULT 'owner',
  theme       TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activity (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   INTEGER,
  summary     TEXT NOT NULL,
  month_key   TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity(created_at DESC);

CREATE TABLE IF NOT EXISTS revisions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id   INTEGER NOT NULL,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  changes     TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_revisions_entity ON revisions(entity_type, entity_id);
`);

const DEFAULT_SETTINGS = {
  team_name: 'VAE',
  timezone: 'Europe/Berlin',
  robux_rate: '0.0035',
  conversion_enabled: '1',
  join_code: ''
};

const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) insertSetting.run(k, v);

function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const out = { ...DEFAULT_SETTINGS };
  for (const r of rows) out[r.key] = r.value;
  return out;
}

function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, String(value));
}

module.exports = { db, getSettings, setSetting, DEFAULT_SETTINGS, DATA_DIR, backend: sqlite.backend };
