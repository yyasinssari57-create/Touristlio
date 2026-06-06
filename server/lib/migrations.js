const logger = require('./logger');

const PLACE_COLUMNS = [
  'description_en', 'history_en', 'tips_en', 'entry_fee_en', 'best_time_en',
  'overview', 'overview_en', 'things_to_do', 'things_to_do_en',
  'culture_food', 'culture_food_en', 'travel_tips', 'travel_tips_en',
  'how_to_get_there', 'how_to_get_there_en', 'photos',
  'categories', 'lat', 'lng', 'popularity',
  'faq_tr', 'faq_en', 'affiliate_hotel_url', 'affiliate_booking_url', 'timezone',
];

const USER_COLUMNS = [
  ['email_verified', 'INTEGER DEFAULT 0'],
  ['failed_login_count', 'INTEGER DEFAULT 0'],
  ['locked_until', 'TEXT'],
  ['verification_token', 'TEXT'],
  ['risk_score', 'INTEGER DEFAULT 0'],
  ['is_blocked', 'INTEGER DEFAULT 0'],
  ['avatar_url', 'TEXT'],
  ['avatar_preset', 'TEXT'],
];

function columnExists(db, table, col) {
  try {
    db.prepare(`SELECT ${col} FROM ${table} LIMIT 1`).get();
    return true;
  } catch {
    return false;
  }
}

function addColumnIfMissing(db, table, col, type) {
  if (columnExists(db, table, col)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
  logger.info({ msg: 'Migration: column added', table, col });
}

function runMigrations(db) {
  if (!columnExists(db, 'places', 'search_aliases')) {
    db.exec('ALTER TABLE places ADD COLUMN search_aliases TEXT');
    logger.info({ msg: 'Migration: places.search_aliases' });
  }

  for (const col of PLACE_COLUMNS) {
    const type = ['lat', 'lng', 'popularity'].includes(col) ? 'REAL' : 'TEXT';
    addColumnIfMissing(db, 'places', col, type);
  }

  for (const [col, def] of USER_COLUMNS) {
    addColumnIfMissing(db, 'users', col, def);
  }

  addColumnIfMissing(db, 'travel_lists', 'share_token', 'TEXT');
  addColumnIfMissing(db, 'places', 'status', "TEXT DEFAULT 'published'");
  addColumnIfMissing(db, 'tiolas', 'rejection_reason', 'TEXT');

  addColumnIfMissing(db, 'blogs', 'slug', 'TEXT');
  addColumnIfMissing(db, 'blogs', 'tags', 'TEXT');
  addColumnIfMissing(db, 'blogs', 'featured', 'INTEGER DEFAULT 0');
  addColumnIfMissing(db, 'blogs', 'author_name', 'TEXT');
  addColumnIfMissing(db, 'blogs', 'published_at', 'TEXT');

  db.exec(`
    CREATE TABLE IF NOT EXISTS cities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      name_en TEXT,
      slug TEXT NOT NULL,
      country TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(country, slug)
    );

    CREATE TABLE IF NOT EXISTS place_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name_tr TEXT NOT NULL,
      name_en TEXT,
      icon TEXT,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_cities_country ON cities(country, is_active);
    CREATE INDEX IF NOT EXISTS idx_places_status ON places(status);

    CREATE TABLE IF NOT EXISTS user_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      link TEXT,
      read_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_notifications_user ON user_notifications(user_id, read_at);

    CREATE TABLE IF NOT EXISTS blog_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name_tr TEXT NOT NULL,
      name_en TEXT,
      icon TEXT,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_blogs_slug ON blogs(slug);
    CREATE INDEX IF NOT EXISTS idx_blogs_featured ON blogs(featured, created_at);

    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reporter_id INTEGER NOT NULL,
      target_type TEXT NOT NULL,
      target_id INTEGER NOT NULL,
      reason TEXT NOT NULL,
      note TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_by INTEGER,
      resolved_at TEXT,
      FOREIGN KEY (reporter_id) REFERENCES users(id),
      FOREIGN KEY (resolved_by) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_reports_target ON reports(target_type, target_id);
  `);

  const catalogPerms = [
    ['admin.cities', 'Manage cities'],
    ['admin.categories', 'Manage categories'],
    ['admin.analytics', 'View analytics'],
  ];
  for (const [slug, name] of catalogPerms) {
    db.prepare('INSERT OR IGNORE INTO permissions (slug, name) VALUES (?, ?)').run(slug, name);
    db.prepare('INSERT OR IGNORE INTO role_permissions (role_slug, permission_slug) VALUES (?, ?)').run('admin', slug);
    db.prepare('INSERT OR IGNORE INTO role_permissions (role_slug, permission_slug) VALUES (?, ?)').run('moderator', slug);
  }

  const { seedCategoriesIfEmpty, seedCitiesFromPlaces } = require('./catalog-db');
  const { seedBlogCategoriesIfEmpty, backfillBlogSlugs } = require('./blog-db');
  seedCategoriesIfEmpty(db);
  seedCitiesFromPlaces(db);
  seedBlogCategoriesIfEmpty(db);
  backfillBlogSlugs(db);
}

module.exports = { runMigrations };
