const { sanitizeName, sanitizeText } = require('./sanitize');

/** Lazy db access — avoids circular require with db.js → migrations → catalog-db */
function getDb(externalDb) {
  if (externalDb && typeof externalDb.prepare === 'function') return externalDb;
  const { db } = require('../db');
  if (!db || typeof db.prepare !== 'function') {
    throw new Error('Veritabanı henüz hazır değil');
  }
  return db;
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'item';
}

function normalizeCategorySlug(value) {
  const raw = sanitizeText(value, 60);
  if (!raw) return '';
  const fromSlugify = slugify(raw);
  return (fromSlugify || raw.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_|_$/g, ''));
}

/** Category codes: English lowercase slug (historical, museum) — not the Turkish display name. */
function normalizeCategorySlug(value) {
  const slug = slugify(sanitizeText(value, 60));
  if (!slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    throw new Error('Kategori kodu geçersiz — küçük İngilizce harf, rakam ve tire (ör. museum, historical)');
  }
  return slug;
}

function mapDbError(err, fallback) {
  const msg = String(err?.message || '');
  if (msg.includes('UNIQUE constraint failed: cities')) {
    return 'Bu şehir zaten kayıtlı (aynı ülke ve slug)';
  }
  if (msg.includes('UNIQUE constraint failed: place_categories')) {
    return 'Bu kategori kodu zaten kayıtlı';
  }
  if (msg.includes('no such table: cities') || msg.includes('no such table: place_categories')) {
    return 'Veritabanı güncel değil — sunucuyu yeniden başlatın (npm start)';
  }
  return fallback || msg || 'Kayıt başarısız';
}

const DEFAULT_CATEGORIES = [
  { slug: 'landmark', name_tr: 'Simge yapı', name_en: 'Landmark', icon: '🏛️', sort_order: 0 },
  { slug: 'museum', name_tr: 'Müze', name_en: 'Museum', icon: '🏺', sort_order: 1 },
  { slug: 'nature', name_tr: 'Doğa', name_en: 'Nature', icon: '⛰️', sort_order: 2 },
  { slug: 'beach', name_tr: 'Plaj', name_en: 'Beach', icon: '🏖️', sort_order: 3 },
  { slug: 'historical', name_tr: 'Tarihi', name_en: 'Historical', icon: '📜', sort_order: 4 },
  { slug: 'religious', name_tr: 'Dini', name_en: 'Religious', icon: '🕌', sort_order: 5 },
  { slug: 'restaurant', name_tr: 'Restoran', name_en: 'Restaurant', icon: '🍽️', sort_order: 6 },
  { slug: 'viewpoint', name_tr: 'Manzara', name_en: 'Viewpoint', icon: '👁️', sort_order: 7 },
  { slug: 'adventure', name_tr: 'Macera', name_en: 'Adventure', icon: '🧗', sort_order: 8 },
  { slug: 'food', name_tr: 'Yemek', name_en: 'Food', icon: '🍴', sort_order: 9 },
  { slug: 'entertainment', name_tr: 'Eğlence', name_en: 'Entertainment', icon: '🎭', sort_order: 10 },
];

function seedCategoriesIfEmpty(database) {
  const db = getDb(database);
  const count = db.prepare('SELECT COUNT(*) AS c FROM place_categories').get().c;
  if (count > 0) return;
  const ins = db.prepare(`
    INSERT INTO place_categories (slug, name_tr, name_en, icon, sort_order, is_active)
    VALUES (?, ?, ?, ?, ?, 1)
  `);
  for (const c of DEFAULT_CATEGORIES) {
    ins.run(c.slug, c.name_tr, c.name_en, c.icon, c.sort_order);
  }
}

function seedCitiesFromPlaces(database) {
  const db = getDb(database);
  const count = db.prepare('SELECT COUNT(*) AS c FROM cities').get().c;
  if (count > 0) return;
  const rows = db.prepare(`
    SELECT DISTINCT TRIM(city) AS city, TRIM(country) AS country
    FROM places
    WHERE city IS NOT NULL AND city != '' AND country IS NOT NULL AND country != ''
    ORDER BY country, city
  `).all();
  const ins = db.prepare(`
    INSERT OR IGNORE INTO cities (name, name_en, slug, country, sort_order, is_active)
    VALUES (?, ?, ?, ?, ?, 1)
  `);
  let order = 0;
  for (const r of rows) {
    const name = r.city;
    ins.run(name, name, slugify(name), r.country, order++);
  }
}

function listCities({ includeInactive = false } = {}) {
  const db = getDb();
  const where = includeInactive ? '' : ' WHERE is_active = 1';
  const rows = db.prepare(`SELECT * FROM cities${where} ORDER BY country, sort_order, name`).all();
  const counts = db.prepare(`
    SELECT TRIM(city) AS city, TRIM(country) AS country, COUNT(*) AS c
    FROM places
    WHERE COALESCE(status, 'published') != 'archived'
    GROUP BY TRIM(city), TRIM(country)
  `).all();
  const countMap = new Map(counts.map((r) => [`${r.country}|${r.city}`, r.c]));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    nameEn: r.name_en || r.name,
    slug: r.slug,
    country: r.country,
    sortOrder: r.sort_order,
    isActive: !!r.is_active,
    placeCount: countMap.get(`${r.country}|${r.name}`) || 0,
    createdAt: r.created_at,
  }));
}

function createCity(body) {
  const db = getDb();
  const name = sanitizeName(body.name);
  const country = sanitizeName(body.country, 120);
  if (!name || !country) throw new Error('Şehir adı ve ülke zorunlu');
  const slug = sanitizeText(body.slug || slugify(name), 80) || slugify(name);
  const nameEn = sanitizeName(body.nameEn || body.name_en || name, 120);
  const sortOrder = Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 0;
  try {
    const result = db.prepare(`
      INSERT INTO cities (name, name_en, slug, country, sort_order, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(name, nameEn, slug, country, sortOrder);
    return getCityById(result.lastInsertRowid);
  } catch (err) {
    throw new Error(mapDbError(err, 'Şehir eklenemedi'));
  }
}

function getCityById(id) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM cities WHERE id = ?').get(id);
  if (!row) return null;
  const placeCount = db.prepare(`
    SELECT COUNT(*) AS c FROM places
    WHERE TRIM(city) = ? AND TRIM(country) = ? AND COALESCE(status, 'published') != 'archived'
  `).get(row.name, row.country).c;
  return {
    id: row.id,
    name: row.name,
    nameEn: row.name_en || row.name,
    slug: row.slug,
    country: row.country,
    sortOrder: row.sort_order,
    isActive: !!row.is_active,
    placeCount,
    createdAt: row.created_at,
  };
}

function updateCity(id, body) {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM cities WHERE id = ?').get(id);
  if (!existing) return null;
  const name = body.name != null ? sanitizeName(body.name) : existing.name;
  const country = body.country != null ? sanitizeName(body.country, 120) : existing.country;
  const nameEn = body.nameEn != null || body.name_en != null
    ? sanitizeName(body.nameEn || body.name_en || name, 120)
    : (existing.name_en || existing.name);
  const slug = body.slug != null ? sanitizeText(body.slug, 80) : existing.slug;
  const sortOrder = body.sortOrder != null ? Number(body.sortOrder) : existing.sort_order;
  const isActive = body.isActive != null ? (body.isActive ? 1 : 0) : existing.is_active;

  if (!name || !country) throw new Error('Şehir adı ve ülke zorunlu');

  const renameCity = name !== existing.name || country !== existing.country;
  db.prepare(`
    UPDATE cities SET name = ?, name_en = ?, slug = ?, country = ?, sort_order = ?, is_active = ?
    WHERE id = ?
  `).run(name, nameEn, slug || slugify(name), country, sortOrder, isActive, id);

  if (renameCity) {
    db.prepare(`
      UPDATE places SET city = ?, country = ?
      WHERE TRIM(city) = ? AND TRIM(country) = ?
    `).run(name, country, existing.name, existing.country);
  }
  return getCityById(id);
}

function deleteCity(id, { hard = false } = {}) {
  const db = getDb();
  const city = db.prepare('SELECT * FROM cities WHERE id = ?').get(id);
  if (!city) return { ok: false, error: 'Şehir bulunamadı' };
  const used = db.prepare(`
    SELECT COUNT(*) AS c FROM places
    WHERE TRIM(city) = ? AND TRIM(country) = ? AND COALESCE(status, 'published') != 'archived'
  `).get(city.name, city.country).c;
  if (used > 0 && hard) {
    return { ok: false, error: `Bu şehirde ${used} yer kayıtlı; önce yerleri taşıyın veya arşivleyin` };
  }
  if (hard) {
    db.prepare('DELETE FROM cities WHERE id = ?').run(id);
    return { ok: true, deleted: true };
  }
  db.prepare('UPDATE cities SET is_active = 0 WHERE id = ?').run(id);
  return { ok: true, deleted: false };
}

function countCategoryUsage(slug) {
  const db = getDb();
  const direct = db.prepare(`
    SELECT COUNT(*) AS c FROM places
    WHERE category = ? AND COALESCE(status, 'published') != 'archived'
  `).get(slug).c;
  const rows = db.prepare(`
    SELECT categories FROM places
    WHERE category != ? AND COALESCE(status, 'published') != 'archived'
      AND categories IS NOT NULL AND categories != '' AND categories != '[]'
  `).all(slug);
  let extra = 0;
  for (const row of rows) {
    try {
      const cats = JSON.parse(row.categories);
      if (Array.isArray(cats) && cats.includes(slug)) extra += 1;
    } catch { /* ignore bad JSON */ }
  }
  return direct + extra;
}

function listCategories({ includeInactive = false } = {}) {
  const db = getDb();
  const where = includeInactive ? '' : ' WHERE is_active = 1';
  const rows = db.prepare(`SELECT * FROM place_categories${where} ORDER BY sort_order, name_tr`).all();
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    nameTr: r.name_tr,
    nameEn: r.name_en || r.slug,
    icon: r.icon || '',
    sortOrder: r.sort_order,
    isActive: !!r.is_active,
    placeCount: countCategoryUsage(r.slug),
  }));
}

function createCategory(body) {
  const db = getDb();
  const nameTr = sanitizeName(body.nameTr || body.name);
  if (!nameTr) throw new Error('Kategori kodu ve Türkçe ad zorunlu');
  const slug = normalizeCategorySlug(body.slug || body.nameTr || body.name);
  if (!slug) throw new Error('Geçerli bir kategori kodu (slug) girin — örn. dance, museum');
  const exists = db.prepare('SELECT id FROM place_categories WHERE slug = ?').get(slug);
  if (exists) throw new Error('Bu kategori kodu zaten var');
  const nameEn = sanitizeName(body.nameEn || body.name_en || nameTr, 120);
  const icon = sanitizeText(body.icon || '', 8);
  const maxSort = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM place_categories').get().m;
  const sortOrder = Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : maxSort + 1;
  try {
    const result = db.prepare(`
      INSERT INTO place_categories (slug, name_tr, name_en, icon, sort_order, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(slug, nameTr, nameEn, icon, sortOrder);
    return listCategories({ includeInactive: true }).find((c) => c.id === result.lastInsertRowid);
  } catch (err) {
    throw new Error(mapDbError(err, 'Kategori eklenemedi'));
  }
}

function updateCategory(id, body) {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM place_categories WHERE id = ?').get(id);
  if (!existing) return null;
  const nameTr = body.nameTr != null ? sanitizeName(body.nameTr) : existing.name_tr;
  const nameEn = body.nameEn != null || body.name_en != null
    ? sanitizeName(body.nameEn || body.name_en, 120)
    : existing.name_en;
  const icon = body.icon != null ? sanitizeText(body.icon, 8) : existing.icon;
  const sortOrder = body.sortOrder != null ? Number(body.sortOrder) : existing.sort_order;
  const isActive = body.isActive != null ? (body.isActive ? 1 : 0) : existing.is_active;
  let slug = existing.slug;
  if (body.slug && body.slug !== existing.slug) {
    const newSlug = normalizeCategorySlug(body.slug);
    const taken = db.prepare('SELECT id FROM place_categories WHERE slug = ? AND id != ?').get(newSlug, id);
    if (taken) throw new Error('Bu kategori kodu kullanılıyor');
    db.prepare('UPDATE places SET category = ? WHERE category = ?').run(newSlug, existing.slug);
    slug = newSlug;
  }
  db.prepare(`
    UPDATE place_categories SET slug = ?, name_tr = ?, name_en = ?, icon = ?, sort_order = ?, is_active = ?
    WHERE id = ?
  `).run(slug, nameTr, nameEn, icon, sortOrder, isActive, id);
  return listCategories({ includeInactive: true }).find((c) => c.id === id);
}

function reorderCategories(orderedIds) {
  const db = getDb();
  if (!Array.isArray(orderedIds) || !orderedIds.length) throw new Error('Sıralama listesi gerekli');
  const stmt = db.prepare('UPDATE place_categories SET sort_order = ? WHERE id = ?');
  const tx = db.transaction((ids) => {
    ids.forEach((id, idx) => stmt.run(idx, id));
  });
  tx(orderedIds.map((id) => Number(id)).filter((n) => n > 0));
  return listCategories({ includeInactive: true });
}

function reassignPlacesFromCategory(fromSlug, toSlug) {
  const db = getDb();
  const rows = db.prepare(`
    SELECT id, category, categories FROM places
    WHERE COALESCE(status, 'published') != 'archived'
      AND (category = ? OR (categories IS NOT NULL AND categories LIKE ?))
  `).all(fromSlug, `%${fromSlug}%`);
  const upd = db.prepare('UPDATE places SET category = ?, categories = ? WHERE id = ?');
  let count = 0;
  for (const row of rows) {
    let cats = [];
    try {
      cats = JSON.parse(row.categories || '[]');
      if (!Array.isArray(cats)) cats = [];
    } catch {
      cats = [];
    }
    const nextCats = [...new Set(cats.filter((c) => c !== fromSlug).concat(toSlug))];
    const nextCategory = row.category === fromSlug ? toSlug : row.category;
    upd.run(nextCategory, JSON.stringify(nextCats.length ? nextCats : [toSlug]), row.id);
    count += 1;
  }
  return count;
}

function deleteCategory(id, { reassignTo } = {}) {
  const db = getDb();
  const cat = db.prepare('SELECT * FROM place_categories WHERE id = ?').get(id);
  if (!cat) return { ok: false, error: 'Kategori bulunamadı' };
  const used = countCategoryUsage(cat.slug);
  if (used > 0) {
    let target = reassignTo ? sanitizeText(reassignTo, 60) : null;
    if (!target) {
      const fallback = db.prepare(`
        SELECT slug FROM place_categories
        WHERE is_active = 1 AND slug != ?
        ORDER BY sort_order, name_tr LIMIT 1
      `).get(cat.slug);
      if (!fallback) {
        return {
          ok: false,
          error: `Bu kategoride ${used} yer var. Silmek için reassignTo ile hedef kategori belirtin.`,
          placeCount: used,
        };
      }
      target = fallback.slug;
    }
    const targetCat = db.prepare('SELECT slug FROM place_categories WHERE slug = ? AND is_active = 1').get(target);
    if (!targetCat) {
      return { ok: false, error: 'Hedef kategori bulunamadı veya pasif' };
    }
    if (targetCat.slug === cat.slug) {
      return { ok: false, error: 'Hedef kategori mevcut kategoriyle aynı olamaz' };
    }
    reassignPlacesFromCategory(cat.slug, targetCat.slug);
  }
  db.prepare('DELETE FROM place_categories WHERE id = ?').run(id);
  return { ok: true, deleted: true, reassigned: used > 0 ? used : 0 };
}

module.exports = {
  slugify,
  seedCategoriesIfEmpty,
  seedCitiesFromPlaces,
  listCities,
  createCity,
  getCityById,
  updateCity,
  deleteCity,
  listCategories,
  createCategory,
  updateCategory,
  reorderCategories,
  deleteCategory,
  countCategoryUsage,
  reassignPlacesFromCategory,
  DEFAULT_CATEGORIES,
};
