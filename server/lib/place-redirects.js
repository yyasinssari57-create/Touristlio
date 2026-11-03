const { db } = require('../db');
const { isPublishedPlaceStatus } = require('./place-status');

/**
 * 301 target for a drafted duplicate. Empty when the target is missing
 * or no longer published (republish the old slug and the redirect stops).
 */
async function publishedRedirectSlug(fromSlug) {
  const slug = String(fromSlug || '').trim().toLowerCase();
  if (!slug) return '';
  let row;
  try {
    row = await db.prepare('SELECT to_slug FROM place_slug_redirects WHERE from_slug = ?').get(slug);
  } catch {
    return '';
  }
  const toSlug = row && String(row.to_slug || '').trim();
  if (!toSlug || toSlug.toLowerCase() === slug) return '';
  try {
    const target = await db.prepare('SELECT slug, status FROM places WHERE slug = ?').get(toSlug);
    if (!target || !isPublishedPlaceStatus(target.status)) return '';
    return String(target.slug || '').trim();
  } catch {
    return '';
  }
}

module.exports = { publishedRedirectSlug };
