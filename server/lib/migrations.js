const fs = require('fs');
const path = require('path');
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

function tableExists(db, table) {
  const row = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
  return !!row;
}

function columnExists(db, table, col) {
  if (!tableExists(db, table)) return false;
  try {
    db.prepare(`SELECT ${col} FROM ${table} LIMIT 1`).get();
    return true;
  } catch {
    return false;
  }
}

function addColumnIfMissing(db, table, col, type) {
  if (!tableExists(db, table)) return;
  if (columnExists(db, table, col)) return;
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
    logger.info({ msg: 'Migration: column added', table, col });
  } catch (err) {
    logger.error({
      msg: 'Migration: add column failed',
      table,
      col,
      code: err.code,
      err: err.message,
    });
    throw err;
  }
}

function ensureIndex(db, indexName, table, columns) {
  if (!tableExists(db, table)) return;
  const cols = Array.isArray(columns) ? columns : [columns];
  if (!cols.every((col) => columnExists(db, table, col))) return;
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS ${indexName} ON ${table}(${cols.join(', ')})`);
  } catch (err) {
    logger.warn({
      msg: 'Migration: index skipped',
      indexName,
      table,
      code: err.code,
      err: err.message,
    });
  }
}

function runOptional(label, fn) {
  try {
    fn();
  } catch (err) {
    logger.warn({
      msg: 'Migration: optional step skipped',
      step: label,
      code: err.code,
      err: err.message,
    });
  }
}

function runMigrations(db) {
  try {
    addColumnIfMissing(db, 'places', 'search_aliases', 'TEXT');

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
    addColumnIfMissing(db, 'blogs', 'rejection_reason', 'TEXT');

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

    CREATE INDEX IF NOT EXISTS idx_tiolas_user_place_month ON tiolas(user_id, place_id, created_at);

    CREATE TABLE IF NOT EXISTS admin_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER NOT NULL,
      admin_name TEXT,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id INTEGER,
      detail TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (admin_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_audit_log_created ON admin_audit_log(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_log_action ON admin_audit_log(action, created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_log_admin ON admin_audit_log(admin_id, created_at);

    CREATE TABLE IF NOT EXISTS banned_words (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      word TEXT NOT NULL UNIQUE,
      added_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (added_by) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_banned_words_word ON banned_words(word);

    CREATE TABLE IF NOT EXISTS moderation_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content_type TEXT NOT NULL,
      content_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      admin_id INTEGER NOT NULL,
      admin_name TEXT,
      reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (admin_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_mod_history_content ON moderation_history(content_type, content_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_mod_history_admin ON moderation_history(admin_id, created_at DESC);
  `);

    addColumnIfMissing(db, 'place_categories', 'image_url', 'TEXT');
    addColumnIfMissing(db, 'reports', 'resolution_reason', 'TEXT');
    addColumnIfMissing(db, 'reports', 'action_taken', 'TEXT');
    addColumnIfMissing(db, 'reports', 'content_prev_status', 'TEXT');
    addColumnIfMissing(db, 'cities', 'image_url', 'TEXT');

    ensureIndex(db, 'idx_places_status', 'places', 'status');
    ensureIndex(db, 'idx_blogs_slug', 'blogs', 'slug');
    ensureIndex(db, 'idx_blogs_featured', 'blogs', ['featured', 'created_at']);
    ensureIndex(db, 'idx_tiolas_parent', 'tiolas', 'parent_id');

    const catalogPerms = [
      ['admin.cities', 'Manage cities'],
      ['admin.categories', 'Manage categories'],
      ['admin.analytics', 'View analytics'],
    ];
    for (const [slug, name] of catalogPerms) {
      db.prepare('INSERT OR IGNORE INTO permissions (slug, name) VALUES (?, ?)').run(slug, name);
      db.prepare('INSERT OR IGNORE INTO role_permissions (role_slug, permission_slug) VALUES (?, ?)').run('admin', slug);
      db.prepare('INSERT OR IGNORE INTO role_permissions (role_slug, permission_slug) VALUES (?, ?)').run('moderator', slug);
      db.prepare('INSERT OR IGNORE INTO role_permissions (role_slug, permission_slug) VALUES (?, ?)').run('editor', slug);
      db.prepare('INSERT OR IGNORE INTO role_permissions (role_slug, permission_slug) VALUES (?, ?)').run('staff', slug);
    }

    const { seedCategoriesIfEmpty, seedCitiesFromPlaces } = require('./catalog-db');
    const { backfillCityImages } = require('./city-images');
    const { seedBlogCategoriesIfEmpty, backfillBlogSlugs } = require('./blog-db');
    runOptional('seedCategoriesIfEmpty', () => seedCategoriesIfEmpty(db));
    runOptional('seedCitiesFromPlaces', () => seedCitiesFromPlaces(db));
    runOptional('backfillCityImages', () => {
      const cityImagesFilled = backfillCityImages(db);
      if (cityImagesFilled > 0) {
        logger.info(`Backfilled ${cityImagesFilled} city cover images`);
      }
    });
    runOptional('seedBlogCategoriesIfEmpty', () => seedBlogCategoriesIfEmpty(db));
    runOptional('backfillBlogSlugs', () => backfillBlogSlugs(db));

    runFileMigrations(db);
  } catch (err) {
    logger.error({
      msg: 'runMigrations failed',
      code: err.code,
      err: err.message,
      stack: err.stack,
    });
    throw err;
  }
}

function runFileMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const migrationsDir = path.join(__dirname, '..', '..', 'db', 'migrations');
  if (!fs.existsSync(migrationsDir)) return;

  const helpers = { columnExists, addColumnIfMissing, tableExists };
  const files = fs.readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.js'))
    .sort();

  for (const file of files) {
    const mod = require(path.join(migrationsDir, file));
    const id = mod.id || file.replace(/\.js$/, '');
    const applied = db.prepare('SELECT 1 FROM schema_migrations WHERE id = ?').get(id);
    if (applied) continue;
    try {
      mod.up(db, helpers);
      db.prepare('INSERT INTO schema_migrations (id) VALUES (?)').run(id);
      logger.info({ msg: 'Migration applied', id });
    } catch (err) {
      const optional = mod.optional === true || id === '002_places_fts';
      logger.error({
        msg: optional ? 'File migration failed (non-fatal)' : 'File migration failed',
        id,
        file,
        code: err.code,
        err: err.message,
        stack: err.stack,
      });
      if (!optional) throw err;
    }
  }
}

module.exports = { runMigrations, tableExists, columnExists, addColumnIfMissing };
