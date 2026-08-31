const { db } = require('../db');
const { normalizeSearch } = require('./search-normalize');

function buildFtsQuery(q) {
  const qNorm = normalizeSearch(q);
  if (!qNorm) return null;
  const words = qNorm.split(' ').filter((w) => w.length >= 2);
  if (!words.length) return null;
  return words.map((w) => `"${w.replace(/"/g, '')}"*`).join(' AND ');
}

/**
 * FTS5-backed place row fetch with optional country/city SQL filters.
 */
function searchPlacesRows({ q, country, city, category } = {}) {
  const ftsQuery = q ? buildFtsQuery(q) : null;
  const params = [];
  const where = [];

  if (ftsQuery) {
    where.push('p.id IN (SELECT rowid FROM places_fts WHERE places_fts MATCH ?)');
    params.push(ftsQuery);
  }
  if (country) {
    const countryNeedle = String(country).toLowerCase().replace(/[%_]/g, '');
    where.push('LOWER(p.country) LIKE ?');
    params.push(`%${countryNeedle}%`);
  }
  if (city) {
    const cityNeedle = String(city).toLowerCase().replace(/[%_]/g, '');
    where.push('LOWER(p.city) LIKE ?');
    params.push(`%${cityNeedle}%`);
  }
  if (category) {
    where.push('(p.category = ? OR (p.categories IS NOT NULL AND p.categories LIKE ?))');
    params.push(category, `%"${category}"%`);
  }

  const sql = `SELECT p.* FROM places p${where.length ? ` WHERE ${where.join(' AND ')}` : ''}`;
  try {
    return db.prepare(sql).all(...params);
  } catch {
    return db.prepare('SELECT * FROM places').all();
  }
}

module.exports = { buildFtsQuery, searchPlacesRows };
