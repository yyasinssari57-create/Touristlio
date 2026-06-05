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

db.exec(`
  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS travel_lists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    is_public INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS travel_list_items (
    list_id INTEGER NOT NULL,
    place_id INTEGER NOT NULL,
    note TEXT,
    sort_order INTEGER DEFAULT 0,
    added_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (list_id, place_id),
    FOREIGN KEY (list_id) REFERENCES travel_lists(id) ON DELETE CASCADE,
    FOREIGN KEY (place_id) REFERENCES places(id)
  );

  CREATE TABLE IF NOT EXISTS visited_places (
    user_id INTEGER NOT NULL,
    place_id INTEGER NOT NULL,
    visited_at TEXT,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, place_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (place_id) REFERENCES places(id)
  );

  CREATE TABLE IF NOT EXISTS trip_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    country TEXT,
    city TEXT,
    start_date TEXT,
    end_date TEXT,
    travelers INTEGER DEFAULT 1,
    trip_type TEXT,
    budget TEXT,
    transport TEXT,
    visibility TEXT NOT NULL DEFAULT 'private',
    share_token TEXT UNIQUE,
    status TEXT NOT NULL DEFAULT 'draft',
    meta TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS trip_plan_days (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id INTEGER NOT NULL,
    day_number INTEGER NOT NULL,
    title TEXT,
    date TEXT,
    FOREIGN KEY (trip_id) REFERENCES trip_plans(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS trip_plan_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    day_id INTEGER NOT NULL,
    place_id INTEGER,
    sort_order INTEGER DEFAULT 0,
    start_time TEXT,
    note TEXT,
    FOREIGN KEY (day_id) REFERENCES trip_plan_days(id) ON DELETE CASCADE,
    FOREIGN KEY (place_id) REFERENCES places(id)
  );

  CREATE TABLE IF NOT EXISTS place_live_data (
    place_id INTEGER PRIMARY KEY,
    payload TEXT,
    crowd_level TEXT,
    source TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (place_id) REFERENCES places(id)
  );

  CREATE TABLE IF NOT EXISTS roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS permissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS role_permissions (
    role_slug TEXT NOT NULL,
    permission_slug TEXT NOT NULL,
    PRIMARY KEY (role_slug, permission_slug)
  );

  CREATE INDEX IF NOT EXISTS idx_trip_plans_user ON trip_plans(user_id);
  CREATE INDEX IF NOT EXISTS idx_travel_lists_user ON travel_lists(user_id);
  CREATE INDEX IF NOT EXISTS idx_visited_user ON visited_places(user_id);

  CREATE TABLE IF NOT EXISTS site_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

function seedRbac() {
  const roles = [
    ['admin', 'Administrator'],
    ['moderator', 'Moderator'],
    ['editor', 'Editor'],
    ['member', 'Member'],
  ];
  const perms = [
    ['admin.dashboard', 'View admin dashboard'],
    ['admin.moderate', 'Moderate content'],
    ['admin.users', 'Manage users'],
    ['admin.places', 'Manage places'],
    ['admin.content', 'Manage blog and pages'],
    ['admin.settings', 'System settings'],
    ['admin.roles', 'Roles and permissions'],
    ['admin.analytics', 'View analytics'],
  ];
  const rolePerms = {
    admin: perms.map((p) => p[0]),
    moderator: ['admin.dashboard', 'admin.moderate', 'admin.places', 'admin.content'],
    editor: ['admin.dashboard', 'admin.content'],
    member: [],
  };
  for (const [slug, name] of roles) {
    db.prepare('INSERT OR IGNORE INTO roles (slug, name) VALUES (?, ?)').run(slug, name);
  }
  for (const [slug, name] of perms) {
    db.prepare('INSERT OR IGNORE INTO permissions (slug, name) VALUES (?, ?)').run(slug, name);
  }
  for (const [role, ps] of Object.entries(rolePerms)) {
    for (const p of ps) {
      db.prepare('INSERT OR IGNORE INTO role_permissions (role_slug, permission_slug) VALUES (?, ?)').run(role, p);
    }
  }
}
seedRbac();

const { runMigrations } = require('./lib/migrations');
runMigrations(db);

function placeStats(placeId) {
  const all = allPlaceStats();
  return all.get(placeId) || { tiolaCount: 0, tiolaRating: null };
}

function allPlaceStats() {
  const rows = db.prepare(`
    SELECT place_id AS placeId, COUNT(*) AS count, ROUND(AVG(stars), 1) AS avg
    FROM tiolas
    WHERE status = 'approved' AND stars IS NOT NULL AND stars > 0 AND place_id IS NOT NULL
    GROUP BY place_id
  `).all();
  const map = new Map();
  for (const row of rows) {
    map.set(row.placeId, { tiolaCount: row.count || 0, tiolaRating: row.avg || null });
  }
  return map;
}

module.exports = { db, placeStats, allPlaceStats };
