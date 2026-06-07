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
  addColumnIfMissing(db, 'tiolas', 'parent_id', 'INTEGER');
  addColumnIfMissing(db, 'place_categories', 'image_url', 'TEXT');
  addColumnIfMissing(db, 'blogs', 'rejection_reason', 'TEXT');
  addColumnIfMissing(db, 'reports', 'resolution_reason', 'TEXT');
  addColumnIfMissing(db, 'reports', 'action_taken', 'TEXT');
  addColumnIfMissing(db, 'reports', 'content_prev_status', 'TEXT');

  try {
    db.prepare("UPDATE reports SET status = 'resolved_dismissed' WHERE status = 'dismissed'").run();
    db.prepare("UPDATE reports SET status = 'resolved_removed' WHERE status = 'actioned'").run();
  } catch {
    /* reports tablosu henüz yok */
  }

  addColumnIfMissing(db, 'blogs', 'slug', 'TEXT');
  addColumnIfMissing(db, 'blogs', 'tags', 'TEXT');
  addColumnIfMissing(db, 'blogs', 'featured', 'INTEGER DEFAULT 0');
  addColumnIfMissing(db, 'blogs', 'author_name', 'TEXT');
  addColumnIfMissing(db, 'blogs', 'published_at', 'TEXT');
  addColumnIfMissing(db, 'cities', 'image_url', 'TEXT');

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
      resolution_reason TEXT,
      action_taken TEXT,
      content_prev_status TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_by INTEGER,
      resolved_at TEXT,
      FOREIGN KEY (reporter_id) REFERENCES users(id),
      FOREIGN KEY (resolved_by) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_reports_target ON reports(target_type, target_id);

    CREATE TABLE IF NOT EXISTS tiola_likes (
      user_id INTEGER NOT NULL,
      tiola_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, tiola_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (tiola_id) REFERENCES tiolas(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_tiola_likes_tiola ON tiola_likes(tiola_id);

    CREATE TABLE IF NOT EXISTS blog_likes (
      user_id INTEGER NOT NULL,
      blog_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, blog_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (blog_id) REFERENCES blogs(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_blog_likes_blog ON blog_likes(blog_id);

    CREATE TABLE IF NOT EXISTS profile_change_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      change_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      rejection_reason TEXT,
      reviewed_by INTEGER,
      reviewed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (reviewed_by) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_profile_changes_status ON profile_change_requests(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_profile_changes_user ON profile_change_requests(user_id, status);

    CREATE INDEX IF NOT EXISTS idx_tiolas_parent ON tiolas(parent_id);
    CREATE INDEX IF NOT EXISTS idx_tiolas_user_place_month ON tiolas(user_id, place_id, created_at);
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
