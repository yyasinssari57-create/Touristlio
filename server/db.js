const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'touristlio.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    avatar_color TEXT DEFAULT '#0ea5e9',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS places (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    location TEXT,
    country TEXT,
    city TEXT,
    district TEXT,
    category TEXT,
    google_rating REAL,
    google_count TEXT,
    image_url TEXT,
    is_local INTEGER DEFAULT 0,
    entry_fee TEXT,
    best_time TEXT,
    description TEXT,
    history TEXT,
    tips TEXT,
    tags TEXT,
    search_aliases TEXT
  );

  CREATE TABLE IF NOT EXISTS tiolas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    place_id INTEGER,
    stars INTEGER,
    category TEXT,
    text TEXT NOT NULL,
    photo_path TEXT,
    city_tag TEXT,
    country_tag TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    moderated_by INTEGER,
    moderated_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (place_id) REFERENCES places(id),
    FOREIGN KEY (moderated_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS blogs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    category TEXT,
    title TEXT NOT NULL,
    excerpt TEXT,
    body TEXT,
    image_url TEXT,
    place_id INTEGER,
    status TEXT NOT NULL DEFAULT 'pending',
    moderated_by INTEGER,
    moderated_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (place_id) REFERENCES places(id)
  );

  CREATE TABLE IF NOT EXISTS saved_places (
    user_id INTEGER NOT NULL,
    place_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, place_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (place_id) REFERENCES places(id)
  );

  CREATE INDEX IF NOT EXISTS idx_tiolas_place ON tiolas(place_id, status);
  CREATE INDEX IF NOT EXISTS idx_tiolas_status ON tiolas(status, created_at);
  CREATE INDEX IF NOT EXISTS idx_blogs_status ON blogs(status, created_at);
`);

try {
  db.prepare('SELECT search_aliases FROM places LIMIT 1').get();
} catch {
  db.exec('ALTER TABLE places ADD COLUMN search_aliases TEXT');
}

for (const col of ['description_en', 'history_en', 'tips_en', 'entry_fee_en', 'best_time_en']) {
  try {
    db.prepare(`SELECT ${col} FROM places LIMIT 1`).get();
  } catch {
    db.exec(`ALTER TABLE places ADD COLUMN ${col} TEXT`);
  }
}

function placeStats(placeId) {
  const row = db.prepare(`
    SELECT COUNT(*) AS count, ROUND(AVG(stars), 1) AS avg
    FROM tiolas
    WHERE place_id = ? AND status = 'approved' AND stars IS NOT NULL AND stars > 0
  `).get(placeId);
  return {
    tiolaCount: row.count || 0,
    tiolaRating: row.avg || null,
  };
}

module.exports = { db, placeStats };
