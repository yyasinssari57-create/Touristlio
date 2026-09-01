/** PostgreSQL schema for Touristlio (replaces SQLite CREATE TABLE in db.js). */

const PG_SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  avatar_color TEXT DEFAULT '#0ea5e9',
  created_at TEXT NOT NULL DEFAULT (to_char(timezone('utc', now()), 'YYYY-MM-DD HH24:MI:SS'))
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
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  place_id INTEGER REFERENCES places(id),
  stars INTEGER,
  category TEXT,
  text TEXT NOT NULL,
  photo_path TEXT,
  city_tag TEXT,
  country_tag TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  moderated_by INTEGER REFERENCES users(id),
  moderated_at TEXT,
  created_at TEXT NOT NULL DEFAULT (to_char(timezone('utc', now()), 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS blogs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  category TEXT,
  title TEXT NOT NULL,
  excerpt TEXT,
  body TEXT,
  image_url TEXT,
  place_id INTEGER REFERENCES places(id),
  status TEXT NOT NULL DEFAULT 'pending',
  moderated_by INTEGER REFERENCES users(id),
  moderated_at TEXT,
  created_at TEXT NOT NULL DEFAULT (to_char(timezone('utc', now()), 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS saved_places (
  user_id INTEGER NOT NULL REFERENCES users(id),
  place_id INTEGER NOT NULL REFERENCES places(id),
  created_at TEXT NOT NULL DEFAULT (to_char(timezone('utc', now()), 'YYYY-MM-DD HH24:MI:SS')),
  PRIMARY KEY (user_id, place_id)
);

CREATE INDEX IF NOT EXISTS idx_tiolas_place ON tiolas(place_id, status);
CREATE INDEX IF NOT EXISTS idx_tiolas_status ON tiolas(status, created_at);
CREATE INDEX IF NOT EXISTS idx_blogs_status ON blogs(status, created_at);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  token TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (to_char(timezone('utc', now()), 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS travel_lists (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT,
  is_public INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (to_char(timezone('utc', now()), 'YYYY-MM-DD HH24:MI:SS')),
  updated_at TEXT NOT NULL DEFAULT (to_char(timezone('utc', now()), 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS travel_list_items (
  list_id INTEGER NOT NULL REFERENCES travel_lists(id) ON DELETE CASCADE,
  place_id INTEGER NOT NULL REFERENCES places(id),
  note TEXT,
  sort_order INTEGER DEFAULT 0,
  added_at TEXT NOT NULL DEFAULT (to_char(timezone('utc', now()), 'YYYY-MM-DD HH24:MI:SS')),
  PRIMARY KEY (list_id, place_id)
);

CREATE TABLE IF NOT EXISTS visited_places (
  user_id INTEGER NOT NULL REFERENCES users(id),
  place_id INTEGER NOT NULL REFERENCES places(id),
  visited_at TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (to_char(timezone('utc', now()), 'YYYY-MM-DD HH24:MI:SS')),
  PRIMARY KEY (user_id, place_id)
);

CREATE TABLE IF NOT EXISTS trip_plans (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
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
  created_at TEXT NOT NULL DEFAULT (to_char(timezone('utc', now()), 'YYYY-MM-DD HH24:MI:SS')),
  updated_at TEXT NOT NULL DEFAULT (to_char(timezone('utc', now()), 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS trip_plan_days (
  id SERIAL PRIMARY KEY,
  trip_id INTEGER NOT NULL REFERENCES trip_plans(id) ON DELETE CASCADE,
  day_number INTEGER NOT NULL,
  title TEXT,
  date TEXT
);

CREATE TABLE IF NOT EXISTS trip_plan_items (
  id SERIAL PRIMARY KEY,
  day_id INTEGER NOT NULL REFERENCES trip_plan_days(id) ON DELETE CASCADE,
  place_id INTEGER REFERENCES places(id),
  sort_order INTEGER DEFAULT 0,
  start_time TEXT,
  note TEXT
);

CREATE TABLE IF NOT EXISTS place_live_data (
  place_id INTEGER PRIMARY KEY REFERENCES places(id),
  payload TEXT,
  crowd_level TEXT,
  source TEXT,
  updated_at TEXT NOT NULL DEFAULT (to_char(timezone('utc', now()), 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS permissions (
  id SERIAL PRIMARY KEY,
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

CREATE TABLE IF NOT EXISTS contact_messages (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT (to_char(timezone('utc', now()), 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE INDEX IF NOT EXISTS idx_contact_messages_created ON contact_messages(created_at DESC);

CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (to_char(timezone('utc', now()), 'YYYY-MM-DD HH24:MI:SS'))
);
`;

module.exports = { PG_SCHEMA };
