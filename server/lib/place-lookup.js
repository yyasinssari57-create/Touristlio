const { slugify } = require('./catalog-db');

const PLACE_PARAM_RESERVED = new Set(['meta', 'map', 'search', 'saved', 'cities', 'stats']);

function getDb(externalDb) {
  if (externalDb && typeof externalDb.prepare === 'function') return externalDb;
  return require('../db').db;
}

async function uniquePlaceSlug(database, base, excludeId) {
  const db = getDb(database);
  const root = slugify(base) || 'place';
  let slug = root;
  let n = 2;
  while (true) {
    const row = excludeId
      ? await db.prepare('SELECT id FROM places WHERE slug = ? AND id != ?').get(slug, excludeId)
      : await db.prepare('SELECT id FROM places WHERE slug = ?').get(slug);
    if (!row) return slug;
    slug = `${root}-${n}`;
    n += 1;
  }
}

function slugFromPlace(p) {
  return `${p.name || ''}-${p.city || p.country || ''}`;
}

async function findPlaceRow(idOrSlug, database) {
  const raw = String(idOrSlug || '').trim();
  if (!raw || PLACE_PARAM_RESERVED.has(raw.toLowerCase())) return null;
  const db = getDb(database);
  if (/^\d+$/.test(raw)) {
    return await db.prepare('SELECT * FROM places WHERE id = ?').get(Number(raw));
  }
  const slug = raw.toLowerCase();
  try {
    return await db.prepare('SELECT * FROM places WHERE slug = ?').get(slug);
  } catch {
    return null;
  }
}

async function backfillPlaceSlugs(database) {
  const db = getDb(database);
  let rows;
  try {
    rows = await db.prepare('SELECT id, name, city, country, slug FROM places').all();
  } catch {
    return 0;
  }
  const used = new Set(rows.map((r) => r.slug).filter(Boolean));
  const upd = await db.prepare('UPDATE places SET slug = ? WHERE id = ?');
  let filled = 0;
  const tx = db.transaction(async () => {
    for (const row of rows) {
      if (row.slug) continue;
      let slug = slugify(slugFromPlace(row)) || `place-${row.id}`;
      let n = 2;
      const root = slug;
      while (used.has(slug)) {
        slug = `${root}-${n}`;
        n += 1;
      }
      used.add(slug);
      await upd.run(slug, row.id);
      filled += 1;
    }
  });
  await tx();
  return filled;
}

module.exports = {
  PLACE_PARAM_RESERVED,
  uniquePlaceSlug,
  slugFromPlace,
  findPlaceRow,
  backfillPlaceSlugs,
};
