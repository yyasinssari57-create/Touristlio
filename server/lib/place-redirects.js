const { isPublishedPlaceStatus } = require('./place-status');

function normalizeSlug(value) {
  return String(value || '').trim().toLowerCase();
}

function getDb(database) {
  if (database && typeof database.prepare === 'function') return database;
  return require('../db').db;
}

/**
 * 301 target for an old slug. Empty when the target is missing
 * or no longer published (draft/archive stay 404 — republish same slug to reopen).
 */
async function publishedRedirectSlug(fromSlug, database) {
  const slug = normalizeSlug(fromSlug);
  if (!slug) return '';
  const db = getDb(database);
  let row;
  try {
    row = await db.prepare('SELECT to_slug FROM place_slug_redirects WHERE from_slug = ?').get(slug);
  } catch {
    return '';
  }
  const toSlug = row && String(row.to_slug || '').trim();
  if (!toSlug || normalizeSlug(toSlug) === slug) return '';
  try {
    const target = await db.prepare('SELECT slug, status FROM places WHERE slug = ?').get(toSlug);
    if (!target || !isPublishedPlaceStatus(target.status)) return '';
    return String(target.slug || '').trim();
  } catch {
    return '';
  }
}

/**
 * True when an admin slug change should write place_slug_redirects.
 * Any prior slug that changes is recorded; publishedRedirectSlug only
 * fires when the new target is published (draft/archive targets stay 404).
 */
function shouldRecordSlugRedirect(_status, fromSlug, toSlug) {
  const from = normalizeSlug(fromSlug);
  const to = normalizeSlug(toSlug);
  return !!(from && to && from !== to);
}

/**
 * Upsert from→to and collapse chains (A→B then B→C ⇒ A→C, B→C).
 * Removes any redirect FROM the new slug so it does not bounce away.
 */
async function recordPlaceSlugRedirect(fromSlug, toSlug, database) {
  const from = normalizeSlug(fromSlug);
  const to = normalizeSlug(toSlug);
  if (!from || !to || from === to) return false;
  const db = getDb(database);

  try {
    // Anything that pointed at the old slug now points at the new one (no A→B→C).
    await db.prepare(`
      UPDATE place_slug_redirects
      SET to_slug = ?
      WHERE to_slug = ?
        AND from_slug <> ?
    `).run(to, from, to);

    await db.prepare(`
      INSERT INTO place_slug_redirects (from_slug, to_slug) VALUES (?, ?)
      ON CONFLICT (from_slug) DO UPDATE SET to_slug = EXCLUDED.to_slug
    `).run(from, to);

    // Live URL must not redirect away from itself.
    await db.prepare('DELETE FROM place_slug_redirects WHERE from_slug = ?').run(to);

    await db.prepare('DELETE FROM place_slug_redirects WHERE from_slug = to_slug').run();
  } catch (err) {
    // Table missing in brand-new envs before migration 018 — do not block place save.
    if (/place_slug_redirects|does not exist|no such table/i.test(String(err && err.message))) {
      return false;
    }
    throw err;
  }
  return true;
}

module.exports = {
  publishedRedirectSlug,
  recordPlaceSlugRedirect,
  shouldRecordSlugRedirect,
  normalizeSlug,
};
