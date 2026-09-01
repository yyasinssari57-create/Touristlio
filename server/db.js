require('dotenv').config();
const logger = require('./lib/logger');
const { createPool, db, closePool, getPool } = require('./lib/pg-db');
const { PG_SCHEMA } = require('./lib/pg-schema');

function resolveDatabaseUrl() {
  const url = String(process.env.DATABASE_URL || '').trim();
  if (!url) {
    throw new Error(
      'DATABASE_URL is required. Set postgresql://... in .env (Supabase). SQLite is no longer used.',
    );
  }
  if (/şifreni buraya yaz|YOUR_PASSWORD|\[.*\]/i.test(url)) {
    throw new Error(
      'DATABASE_URL still has a password placeholder. Paste the real Supabase database password.',
    );
  }
  return url;
}

function isEphemeralStorage() {
  if (process.env.DATABASE_URL) return false;
  if (process.env.STORAGE_PERSISTENT === 'true') return false;
  if (process.env.STORAGE_PERSISTENT === 'false') return true;
  return process.env.RENDER === 'true';
}

let dbPath = null;
let initialized = false;

async function seedRbac() {
  const roles = [
    ['admin', 'Administrator'],
    ['moderator', 'Moderator'],
    ['editor', 'Editor'],
    ['staff', 'Content Manager'],
    ['member', 'Member'],
  ];
  const perms = [
    ['admin.dashboard', 'View admin dashboard'],
    ['admin.moderate', 'Moderate content'],
    ['admin.users', 'Manage users'],
    ['admin.places', 'Manage places'],
    ['admin.cities', 'Manage cities'],
    ['admin.categories', 'Manage categories'],
    ['admin.content', 'Manage blog and pages'],
    ['admin.settings', 'System settings'],
    ['admin.roles', 'Roles and permissions'],
    ['admin.analytics', 'View analytics'],
  ];
  const rolePerms = {
    admin: perms.map((p) => p[0]),
    moderator: [
      'admin.dashboard', 'admin.analytics', 'admin.moderate', 'admin.places', 'admin.cities',
      'admin.categories', 'admin.content',
    ],
    editor: ['admin.dashboard', 'admin.analytics', 'admin.content'],
    staff: [
      'admin.dashboard', 'admin.analytics', 'admin.moderate', 'admin.places', 'admin.cities',
      'admin.categories', 'admin.content',
    ],
    member: [],
  };
  for (const [slug, name] of roles) {
    await db.prepare('INSERT OR IGNORE INTO roles (slug, name) VALUES (?, ?)').run(slug, name);
  }
  for (const [slug, name] of perms) {
    await db.prepare('INSERT OR IGNORE INTO permissions (slug, name) VALUES (?, ?)').run(slug, name);
  }
  for (const [role, ps] of Object.entries(rolePerms)) {
    for (const p of ps) {
      await db.prepare('INSERT OR IGNORE INTO role_permissions (role_slug, permission_slug) VALUES (?, ?)').run(role, p);
    }
  }
}

async function initDb() {
  if (initialized) return { db, dbPath };
  const url = resolveDatabaseUrl();
  createPool(url);
  try {
    const u = new URL(url.replace(/^postgresql:/, 'http:'));
    dbPath = `${u.hostname}:${u.port || 5432}${u.pathname}`;
  } catch {
    dbPath = 'postgresql';
  }
  logger.info({ msg: 'Connecting to PostgreSQL', dbPath });
  await db.exec(PG_SCHEMA);
  await seedRbac();
  const { runMigrations } = require('./lib/migrations');
  logger.info({ msg: 'Running database migrations' });
  await runMigrations(db);
  logger.info({ msg: 'Database migrations complete' });
  initialized = true;
  return { db, dbPath };
}

async function placeStats(placeId) {
  try {
    const row = await db.prepare(`
      SELECT tiola_count AS "tiolaCount", tiola_rating AS "tiolaRating" FROM places WHERE id = ?
    `).get(placeId);
    if (row) {
      return { tiolaCount: row.tiolaCount || 0, tiolaRating: row.tiolaRating ?? null };
    }
  } catch {
    /* columns not migrated yet */
  }
  const map = await allPlaceStats();
  return map.get(placeId) || { tiolaCount: 0, tiolaRating: null };
}

async function aggregatePlaceStats() {
  const rows = await db.prepare(`
    SELECT place_id AS "placeId", COUNT(*) AS count, ROUND(AVG(stars), 1) AS avg
    FROM tiolas
    WHERE status = 'approved' AND parent_id IS NULL
      AND stars IS NOT NULL AND stars > 0 AND place_id IS NOT NULL
    GROUP BY place_id
  `).all();
  const map = new Map();
  for (const row of rows) {
    map.set(row.placeId, { tiolaCount: Number(row.count) || 0, tiolaRating: row.avg || null });
  }
  return map;
}

async function allPlaceStats() {
  try {
    const rows = await db.prepare(`
      SELECT id AS "placeId", tiola_count AS count, tiola_rating AS avg
      FROM places
      WHERE COALESCE(tiola_count, 0) > 0
    `).all();
    const map = new Map();
    for (const row of rows) {
      map.set(row.placeId, { tiolaCount: Number(row.count) || 0, tiolaRating: row.avg ?? null });
    }
    return map;
  } catch {
    return aggregatePlaceStats();
  }
}

module.exports = {
  db,
  get dbPath() { return dbPath; },
  isEphemeralStorage,
  placeStats,
  allPlaceStats,
  initDb,
  closePool,
  getPool,
};
