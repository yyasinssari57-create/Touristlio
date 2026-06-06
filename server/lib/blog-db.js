const { sanitizeText } = require('./sanitize');
const { slugify } = require('./catalog-db');

function getDb(externalDb) {
  if (externalDb && typeof externalDb.prepare === 'function') return externalDb;
  const { db } = require('../db');
  if (!db || typeof db.prepare !== 'function') {
    throw new Error('Veritabanı henüz hazır değil');
  }
  return db;
}

const DEFAULT_BLOG_CATEGORIES = [
  { slug: 'guide', name_tr: 'Rehberler', name_en: 'Guides', icon: '🗺️', sort_order: 0 },
  { slug: 'hidden', name_tr: 'Gizli Köşeler', name_en: 'Hidden gems', icon: '💎', sort_order: 1 },
  { slug: 'food', name_tr: 'Yemek', name_en: 'Food', icon: '🍜', sort_order: 2 },
  { slug: 'nature', name_tr: 'Doğa', name_en: 'Nature', icon: '🌿', sort_order: 3 },
  { slug: 'culture', name_tr: 'Kültür', name_en: 'Culture', icon: '🎭', sort_order: 4 },
];

function normalizeBlogCategorySlug(value) {
  const slug = slugify(sanitizeText(value, 60));
  if (!slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    throw new Error('Kategori kodu geçersiz — küçük İngilizce harf, rakam ve tire (ör. guide, food)');
  }
  return slug;
}

function mapBlogCategory(row) {
  return {
    id: row.id,
    slug: row.slug,
    nameTr: row.name_tr,
    nameEn: row.name_en || row.name_tr,
    icon: row.icon || '',
    sortOrder: row.sort_order,
    isActive: !!row.is_active,
    postCount: row.post_count || 0,
  };
}

function seedBlogCategoriesIfEmpty(database) {
  const db = getDb(database);
  const count = db.prepare('SELECT COUNT(*) AS c FROM blog_categories').get().c;
  if (count > 0) return;
  const ins = db.prepare(`
    INSERT INTO blog_categories (slug, name_tr, name_en, icon, sort_order, is_active)
    VALUES (?, ?, ?, ?, ?, 1)
  `);
  for (const c of DEFAULT_BLOG_CATEGORIES) {
    ins.run(c.slug, c.name_tr, c.name_en, c.icon, c.sort_order);
  }
}

function listBlogCategories({ includeInactive = false } = {}) {
  const db = getDb();
  const where = includeInactive ? '' : ' WHERE bc.is_active = 1';
  const rows = db.prepare(`
    SELECT bc.*, (
      SELECT COUNT(*) FROM blogs b
      WHERE b.category = bc.slug AND b.status = 'approved'
    ) AS post_count
    FROM blog_categories bc${where}
    ORDER BY bc.sort_order, bc.name_tr
  `).all();
  return rows.map(mapBlogCategory);
}

function getBlogCategoryBySlug(slug) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM blog_categories WHERE slug = ?').get(slug);
  return row ? mapBlogCategory({ ...row, post_count: 0 }) : null;
}

function createBlogCategory(body = {}) {
  const db = getDb();
  const slug = normalizeBlogCategorySlug(body.slug);
  const nameTr = sanitizeText(body.nameTr || body.name_tr, 80);
  if (!nameTr) throw new Error('Türkçe ad gerekli');
  const nameEn = sanitizeText(body.nameEn || body.name_en || nameTr, 80);
  const icon = sanitizeText(body.icon, 8);
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM blog_categories').get().m;
  const sortOrder = body.sortOrder != null ? Number(body.sortOrder) : maxOrder + 1;
  try {
    const info = db.prepare(`
      INSERT INTO blog_categories (slug, name_tr, name_en, icon, sort_order, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(slug, nameTr, nameEn, icon, sortOrder);
    const row = db.prepare('SELECT * FROM blog_categories WHERE id = ?').get(info.lastInsertRowid);
    return mapBlogCategory({ ...row, post_count: 0 });
  } catch (err) {
    if (String(err.message).includes('UNIQUE constraint failed: blog_categories.slug')) {
      throw new Error('Bu blog kategori kodu zaten kayıtlı');
    }
    throw err;
  }
}

function updateBlogCategory(id, body = {}) {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM blog_categories WHERE id = ?').get(id);
  if (!existing) return null;
  const nameTr = body.nameTr != null ? sanitizeText(body.nameTr, 80) : existing.name_tr;
  const nameEn = body.nameEn != null ? sanitizeText(body.nameEn, 80) : existing.name_en;
  const icon = body.icon != null ? sanitizeText(body.icon, 8) : existing.icon;
  const sortOrder = body.sortOrder != null ? Number(body.sortOrder) : existing.sort_order;
  const isActive = body.isActive != null ? (body.isActive ? 1 : 0) : existing.is_active;
  db.prepare(`
    UPDATE blog_categories SET name_tr = ?, name_en = ?, icon = ?, sort_order = ?, is_active = ?
    WHERE id = ?
  `).run(nameTr, nameEn, icon, sortOrder, isActive, id);
  const row = db.prepare('SELECT * FROM blog_categories WHERE id = ?').get(id);
  const postCount = db.prepare(`
    SELECT COUNT(*) AS c FROM blogs WHERE category = ? AND status = 'approved'
  `).get(existing.slug).c;
  return mapBlogCategory({ ...row, post_count: postCount });
}

function deleteBlogCategory(id, { reassignTo } = {}) {
  const db = getDb();
  const cat = db.prepare('SELECT * FROM blog_categories WHERE id = ?').get(id);
  if (!cat) return { ok: false, error: 'Kategori bulunamadı' };
  const used = db.prepare('SELECT COUNT(*) AS c FROM blogs WHERE category = ?').get(cat.slug).c;
  if (used > 0) {
    if (!reassignTo) {
      return { ok: false, error: `${used} blog yazısı bu kategoride — önce başka kategoriye taşıyın`, postCount: used };
    }
    const target = db.prepare('SELECT * FROM blog_categories WHERE slug = ?').get(reassignTo);
    if (!target || !target.is_active) {
      return { ok: false, error: 'Hedef kategori bulunamadı veya pasif' };
    }
    if (target.slug === cat.slug) {
      return { ok: false, error: 'Hedef kategori mevcut kategoriyle aynı olamaz' };
    }
    db.prepare('UPDATE blogs SET category = ? WHERE category = ?').run(target.slug, cat.slug);
  }
  db.prepare('DELETE FROM blog_categories WHERE id = ?').run(id);
  return { ok: true, deleted: true, reassigned: used > 0 ? used : 0 };
}

function uniqueBlogSlug(db, base, excludeId) {
  let slug = base;
  let n = 2;
  while (true) {
    const row = excludeId
      ? db.prepare('SELECT id FROM blogs WHERE slug = ? AND id != ?').get(slug, excludeId)
      : db.prepare('SELECT id FROM blogs WHERE slug = ?').get(slug);
    if (!row) return slug;
    slug = `${base}-${n++}`;
  }
}

function parseTagsInput(value) {
  if (value == null || value === '') return [];
  if (Array.isArray(value)) {
    return value.map((t) => sanitizeText(t, 40)).filter(Boolean).slice(0, 20);
  }
  const raw = String(value).trim();
  if (!raw) return [];
  if (raw.startsWith('[')) {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr.map((t) => sanitizeText(t, 40)).filter(Boolean).slice(0, 20);
    } catch { /* fall through */ }
  }
  return raw.split(/[,;]+/).map((t) => sanitizeText(t, 40)).filter(Boolean).slice(0, 20);
}

function serializeTags(tags) {
  return JSON.stringify(parseTagsInput(tags));
}

function parseTagsStored(value) {
  if (!value) return [];
  try {
    const arr = JSON.parse(value);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return parseTagsInput(value);
  }
}

function backfillBlogSlugs(database) {
  const db = getDb(database);
  const rows = db.prepare("SELECT id, title, slug FROM blogs WHERE slug IS NULL OR slug = ''").all();
  for (const row of rows) {
    const base = uniqueBlogSlug(db, slugify(sanitizeText(row.title, 200)) || `blog-${row.id}`, row.id);
    db.prepare('UPDATE blogs SET slug = ? WHERE id = ?').run(base, row.id);
  }
}

module.exports = {
  DEFAULT_BLOG_CATEGORIES,
  seedBlogCategoriesIfEmpty,
  listBlogCategories,
  getBlogCategoryBySlug,
  createBlogCategory,
  updateBlogCategory,
  deleteBlogCategory,
  uniqueBlogSlug,
  parseTagsInput,
  serializeTags,
  parseTagsStored,
  backfillBlogSlugs,
  slugify,
};
