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

async function tableExists(db, table) {
  const row = await db.prepare(
    `SELECT 1 AS ok FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = ?`,
  ).get(table);
  return !!row;
}

async function columnExists(db, table, col) {
  if (!(await tableExists(db, table))) return false;
  const row = await db.prepare(
    `SELECT 1 AS ok FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = ? AND column_name = ?`,
  ).get(table, col);
  return !!row;
}

async function addColumnIfMissing(db, table, col, type) {
  if (!(await tableExists(db, table))) return;
  if (await columnExists(db, table, col)) return;
  try {
    await db.exec(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${col} ${type}`);
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

async function ensureIndex(db, indexName, table, columns) {
  if (!(await tableExists(db, table))) return;
  const cols = Array.isArray(columns) ? columns : [columns];
  for (const col of cols) {
    if (typeof col === 'string' && !/[()]/.test(col) && !(await columnExists(db, table, col))) return;
  }
  try {
    await db.exec(`CREATE INDEX IF NOT EXISTS ${indexName} ON ${table}(${cols.join(', ')})`);
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

async function runOptional(label, fn) {
  try {
    await fn();
  } catch (err) {
    logger.warn({
      msg: 'Migration: optional step skipped',
      step: label,
      code: err.code,
      err: err.message,
    });
  }
}

async function runMigrations(db) {
  try {
    await addColumnIfMissing(db, 'places', 'search_aliases', 'TEXT');
    await addColumnIfMissing(db, 'places', 'slug', 'TEXT');

    for (const col of PLACE_COLUMNS) {
      const type = ['lat', 'lng', 'popularity'].includes(col) ? 'DOUBLE PRECISION' : 'TEXT';
      await addColumnIfMissing(db, 'places', col, type);
    }

    for (const [col, def] of USER_COLUMNS) {
      await addColumnIfMissing(db, 'users', col, def);
    }

    await addColumnIfMissing(db, 'travel_lists', 'share_token', 'TEXT');
    await addColumnIfMissing(db, 'places', 'status', "TEXT DEFAULT 'published'");
    await addColumnIfMissing(db, 'tiolas', 'rejection_reason', 'TEXT');
    await addColumnIfMissing(db, 'tiolas', 'parent_id', 'INTEGER');
    await addColumnIfMissing(db, 'blogs', 'rejection_reason', 'TEXT');

    try {
      await db.prepare("UPDATE reports SET status = 'resolved_dismissed' WHERE status = 'dismissed'").run();
      await db.prepare("UPDATE reports SET status = 'resolved_removed' WHERE status = 'actioned'").run();
    } catch {
      /* reports tablosu henüz yok */
    }

    await addColumnIfMissing(db, 'blogs', 'slug', 'TEXT');
    await addColumnIfMissing(db, 'blogs', 'tags', 'TEXT');
    await addColumnIfMissing(db, 'blogs', 'featured', 'INTEGER DEFAULT 0');
    await addColumnIfMissing(db, 'blogs', 'author_name', 'TEXT');
    await addColumnIfMissing(db, 'blogs', 'published_at', 'TEXT');

    await db.exec(`
    CREATE TABLE IF NOT EXISTS cities (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      name_en TEXT,
      slug TEXT NOT NULL,
      country TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (to_char(timezone('utc', now()), 'YYYY-MM-DD HH24:MI:SS')),
      UNIQUE(country, slug)
    );

    CREATE TABLE IF NOT EXISTS place_categories (
      id SERIAL PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name_tr TEXT NOT NULL,
      name_en TEXT,
      icon TEXT,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (to_char(timezone('utc', now()), 'YYYY-MM-DD HH24:MI:SS'))
    );

    CREATE INDEX IF NOT EXISTS idx_cities_country ON cities(country, is_active);

    CREATE TABLE IF NOT EXISTS user_notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      link TEXT,
      read_at TEXT,
      created_at TEXT NOT NULL DEFAULT (to_char(timezone('utc', now()), 'YYYY-MM-DD HH24:MI:SS'))
    );

    CREATE INDEX IF NOT EXISTS idx_notifications_user ON user_notifications(user_id, read_at);

    CREATE TABLE IF NOT EXISTS blog_categories (
      id SERIAL PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name_tr TEXT NOT NULL,
      name_en TEXT,
      icon TEXT,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (to_char(timezone('utc', now()), 'YYYY-MM-DD HH24:MI:SS'))
    );

    CREATE TABLE IF NOT EXISTS reports (
      id SERIAL PRIMARY KEY,
      reporter_id INTEGER NOT NULL REFERENCES users(id),
      target_type TEXT NOT NULL,
      target_id INTEGER NOT NULL,
      reason TEXT NOT NULL,
      note TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      resolution_reason TEXT,
      action_taken TEXT,
      content_prev_status TEXT,
      created_at TEXT NOT NULL DEFAULT (to_char(timezone('utc', now()), 'YYYY-MM-DD HH24:MI:SS')),
      resolved_by INTEGER REFERENCES users(id),
      resolved_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_reports_target ON reports(target_type, target_id);

    CREATE TABLE IF NOT EXISTS tiola_likes (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tiola_id INTEGER NOT NULL REFERENCES tiolas(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (to_char(timezone('utc', now()), 'YYYY-MM-DD HH24:MI:SS')),
      PRIMARY KEY (user_id, tiola_id)
    );

    CREATE INDEX IF NOT EXISTS idx_tiola_likes_tiola ON tiola_likes(tiola_id);

    CREATE TABLE IF NOT EXISTS blog_likes (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      blog_id INTEGER NOT NULL REFERENCES blogs(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (to_char(timezone('utc', now()), 'YYYY-MM-DD HH24:MI:SS')),
      PRIMARY KEY (user_id, blog_id)
    );

    CREATE INDEX IF NOT EXISTS idx_blog_likes_blog ON blog_likes(blog_id);

    CREATE TABLE IF NOT EXISTS profile_change_requests (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      change_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      rejection_reason TEXT,
      reviewed_by INTEGER REFERENCES users(id),
      reviewed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (to_char(timezone('utc', now()), 'YYYY-MM-DD HH24:MI:SS'))
    );

    CREATE INDEX IF NOT EXISTS idx_profile_changes_status ON profile_change_requests(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_profile_changes_user ON profile_change_requests(user_id, status);

    CREATE INDEX IF NOT EXISTS idx_tiolas_user_place_month ON tiolas(user_id, place_id, created_at);

    CREATE TABLE IF NOT EXISTS admin_audit_log (
      id SERIAL PRIMARY KEY,
      admin_id INTEGER NOT NULL REFERENCES users(id),
      admin_name TEXT,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id INTEGER,
      detail TEXT,
      created_at TEXT NOT NULL DEFAULT (to_char(timezone('utc', now()), 'YYYY-MM-DD HH24:MI:SS'))
    );

    CREATE INDEX IF NOT EXISTS idx_audit_log_created ON admin_audit_log(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_log_action ON admin_audit_log(action, created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_log_admin ON admin_audit_log(admin_id, created_at);

    CREATE TABLE IF NOT EXISTS banned_words (
      id SERIAL PRIMARY KEY,
      word TEXT NOT NULL UNIQUE,
      added_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (to_char(timezone('utc', now()), 'YYYY-MM-DD HH24:MI:SS'))
    );

    CREATE INDEX IF NOT EXISTS idx_banned_words_word ON banned_words(word);

    CREATE TABLE IF NOT EXISTS moderation_history (
      id SERIAL PRIMARY KEY,
      content_type TEXT NOT NULL,
      content_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      admin_id INTEGER NOT NULL REFERENCES users(id),
      admin_name TEXT,
      reason TEXT,
      created_at TEXT NOT NULL DEFAULT (to_char(timezone('utc', now()), 'YYYY-MM-DD HH24:MI:SS'))
    );

    CREATE INDEX IF NOT EXISTS idx_mod_history_content ON moderation_history(content_type, content_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_mod_history_admin ON moderation_history(admin_id, created_at DESC);
  `);

    await addColumnIfMissing(db, 'place_categories', 'image_url', 'TEXT');
    await addColumnIfMissing(db, 'reports', 'resolution_reason', 'TEXT');
    await addColumnIfMissing(db, 'reports', 'action_taken', 'TEXT');
    await addColumnIfMissing(db, 'reports', 'content_prev_status', 'TEXT');
    await addColumnIfMissing(db, 'cities', 'image_url', 'TEXT');

    await ensureIndex(db, 'idx_places_status', 'places', 'status');
    await ensureIndex(db, 'idx_places_slug', 'places', 'slug');
    await ensureIndex(db, 'idx_blogs_slug', 'blogs', 'slug');
    await ensureIndex(db, 'idx_blogs_featured', 'blogs', ['featured', 'created_at']);
    await ensureIndex(db, 'idx_tiolas_parent', 'tiolas', 'parent_id');

    const catalogPerms = [
      ['admin.cities', 'Manage cities'],
      ['admin.categories', 'Manage categories'],
      ['admin.analytics', 'View analytics'],
    ];
    for (const [slug, name] of catalogPerms) {
      await db.prepare('INSERT OR IGNORE INTO permissions (slug, name) VALUES (?, ?)').run(slug, name);
      await db.prepare('INSERT OR IGNORE INTO role_permissions (role_slug, permission_slug) VALUES (?, ?)').run('admin', slug);
      await db.prepare('INSERT OR IGNORE INTO role_permissions (role_slug, permission_slug) VALUES (?, ?)').run('moderator', slug);
      await db.prepare('INSERT OR IGNORE INTO role_permissions (role_slug, permission_slug) VALUES (?, ?)').run('editor', slug);
      await db.prepare('INSERT OR IGNORE INTO role_permissions (role_slug, permission_slug) VALUES (?, ?)').run('staff', slug);
    }

    const { seedCategoriesIfEmpty, seedCitiesFromPlaces } = require('./catalog-db');
    const { backfillCityImages } = require('./city-images');
    const { seedBlogCategoriesIfEmpty, backfillBlogSlugs } = require('./blog-db');
    await runOptional('seedCategoriesIfEmpty', () => seedCategoriesIfEmpty(db));
    await runOptional('seedCitiesFromPlaces', () => seedCitiesFromPlaces(db));
    await runOptional('backfillCityImages', async () => {
      const cityImagesFilled = await backfillCityImages(db);
      if (cityImagesFilled > 0) {
        logger.info(`Backfilled ${cityImagesFilled} city cover images`);
      }
    });
    await runOptional('seedBlogCategoriesIfEmpty', () => seedBlogCategoriesIfEmpty(db));
    await runOptional('backfillBlogSlugs', () => backfillBlogSlugs(db));
    await runOptional('backfillPlaceSlugs', async () => {
      const { backfillPlaceSlugs } = require('./place-lookup');
      const filled = await backfillPlaceSlugs(db);
      if (filled > 0) logger.info({ msg: 'Backfilled place slugs', count: filled });
    });
    await runOptional('backfillPlaceCoords', async () => {
      const { backfillMissingPlaceCoords } = require('./city-coords');
      const filled = await backfillMissingPlaceCoords(db);
      if (filled > 0) logger.info({ msg: 'Backfilled place lat/lng', count: filled });
    });

    await runFileMigrations(db);
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

async function runFileMigrations(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (to_char(timezone('utc', now()), 'YYYY-MM-DD HH24:MI:SS'))
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
    const applied = await db.prepare('SELECT 1 AS ok FROM schema_migrations WHERE id = ?').get(id);
    if (applied) continue;
    try {
      await mod.up(db, helpers);
      await db.prepare('INSERT INTO schema_migrations (id) VALUES (?)').run(id);
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
