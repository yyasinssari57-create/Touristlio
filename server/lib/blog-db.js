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

async function seedBlogCategoriesIfEmpty(database) {
  const db = getDb(database);
  const count = (await db.prepare('SELECT COUNT(*) AS c FROM blog_categories').get()).c;
  if (count > 0) return;
  const ins = await db.prepare(`
    INSERT INTO blog_categories (slug, name_tr, name_en, icon, sort_order, is_active)
    VALUES (?, ?, ?, ?, ?, 1)
  `);
  for (const c of DEFAULT_BLOG_CATEGORIES) {
    await ins.run(c.slug, c.name_tr, c.name_en, c.icon, c.sort_order);
  }
}

async function listBlogCategories({ includeInactive = false } = {}) {
  const db = getDb();
  const where = includeInactive ? '' : ' WHERE bc.is_active = 1';
  const rows = await db.prepare(`
    SELECT bc.*, (
      SELECT COUNT(*) FROM blogs b
      WHERE b.category = bc.slug AND b.status = 'approved'
    ) AS post_count
    FROM blog_categories bc${where}
    ORDER BY bc.sort_order, bc.name_tr
  `).all();
  return rows.map(mapBlogCategory);
}

async function getBlogCategoryBySlug(slug) {
  const db = getDb();
  const row = await db.prepare('SELECT * FROM blog_categories WHERE slug = ?').get(slug);
  return row ? mapBlogCategory({ ...row, post_count: 0 }) : null;
}

async function createBlogCategory(body = {}) {
  const db = getDb();
  const slug = normalizeBlogCategorySlug(body.slug);
  const nameTr = sanitizeText(body.nameTr || body.name_tr, 80);
  if (!nameTr) throw new Error('Türkçe ad gerekli');
  const nameEn = sanitizeText(body.nameEn || body.name_en || nameTr, 80);
  const icon = sanitizeText(body.icon, 8);
  const maxOrder = (await db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM blog_categories').get()).m;
  const sortOrder = body.sortOrder != null ? Number(body.sortOrder) : maxOrder + 1;
  try {
    const info = await db.prepare(`
      INSERT INTO blog_categories (slug, name_tr, name_en, icon, sort_order, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(slug, nameTr, nameEn, icon, sortOrder);
    const row = await db.prepare('SELECT * FROM blog_categories WHERE id = ?').get(info.lastInsertRowid);
    return mapBlogCategory({ ...row, post_count: 0 });
  } catch (err) {
    if (String(err.message).includes('UNIQUE constraint failed: blog_categories.slug')) {
      throw new Error('Bu blog kategori kodu zaten kayıtlı');
    }
    throw err;
  }
}

async function updateBlogCategory(id, body = {}) {
  const db = getDb();
  const existing = await db.prepare('SELECT * FROM blog_categories WHERE id = ?').get(id);
  if (!existing) return null;
  const nameTr = body.nameTr != null ? sanitizeText(body.nameTr, 80) : existing.name_tr;
  const nameEn = body.nameEn != null ? sanitizeText(body.nameEn, 80) : existing.name_en;
  const icon = body.icon != null ? sanitizeText(body.icon, 8) : existing.icon;
  const sortOrder = body.sortOrder != null ? Number(body.sortOrder) : existing.sort_order;
  const isActive = body.isActive != null ? (body.isActive ? 1 : 0) : existing.is_active;
  await db.prepare(`
    UPDATE blog_categories SET name_tr = ?, name_en = ?, icon = ?, sort_order = ?, is_active = ?
    WHERE id = ?
  `).run(nameTr, nameEn, icon, sortOrder, isActive, id);
  const row = await db.prepare('SELECT * FROM blog_categories WHERE id = ?').get(id);
  const postCount = (await db.prepare(`
    SELECT COUNT(*) AS c FROM blogs WHERE category = ? AND status = 'approved'
  `).get(existing.slug)).c;
  return mapBlogCategory({ ...row, post_count: postCount });
}

async function deleteBlogCategory(id, { reassignTo } = {}) {
  const db = getDb();
  const cat = await db.prepare('SELECT * FROM blog_categories WHERE id = ?').get(id);
  if (!cat) return { ok: false, error: 'Kategori bulunamadı' };
  const used = (await db.prepare('SELECT COUNT(*) AS c FROM blogs WHERE category = ?').get(cat.slug)).c;
  if (used > 0) {
    if (!reassignTo) {
      return { ok: false, error: `${used} blog yazısı bu kategoride — önce başka kategoriye taşıyın`, postCount: used };
    }
    const target = await db.prepare('SELECT * FROM blog_categories WHERE slug = ?').get(reassignTo);
    if (!target || !target.is_active) {
      return { ok: false, error: 'Hedef kategori bulunamadı veya pasif' };
    }
    if (target.slug === cat.slug) {
      return { ok: false, error: 'Hedef kategori mevcut kategoriyle aynı olamaz' };
    }
    await db.prepare('UPDATE blogs SET category = ? WHERE category = ?').run(target.slug, cat.slug);
  }
  await db.prepare('UPDATE blog_categories SET is_active = 0 WHERE id = ?').run(id);
  return { ok: true, deleted: false, deactivated: true, reassigned: used > 0 ? used : 0 };
}

async function uniqueBlogSlug(db, base, excludeId) {
  let slug = base;
  let n = 2;
  while (true) {
    const row = excludeId
      ? await db.prepare('SELECT id FROM blogs WHERE slug = ? AND id != ?').get(slug, excludeId)
      : await db.prepare('SELECT id FROM blogs WHERE slug = ?').get(slug);
    if (!row) return slug;
    slug = `${base}-${n++}`;
  }
}

/** Prisma / i18n objects → string. blogs.category is TEXT; tags are TEXT/JSON string[]. */
function labelFromUnknown(value, lang = 'tr') {
  if (value == null || value === '') return '';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}'))
      || (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
      try {
        return labelFromUnknown(JSON.parse(trimmed), lang);
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value.map((v) => labelFromUnknown(v, lang)).filter(Boolean)[0] || '';
  }
  if (typeof value === 'object') {
    const enFirst = lang === 'en';
    const keys = enFirst
      ? ['nameEn', 'name_en', 'en', 'name', 'title', 'label', 'nameTr', 'name_tr', 'tr', 'slug', 'id']
      : ['nameTr', 'name_tr', 'tr', 'name', 'title', 'label', 'nameEn', 'name_en', 'en', 'slug', 'id'];
    for (const k of keys) {
      if (value[k] != null && value[k] !== '') {
        const found = labelFromUnknown(value[k], lang);
        if (found) return found;
      }
    }
  }
  return '';
}

function categorySlugFromUnknown(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'object' && !Array.isArray(value)) {
    const slug = value.slug != null && typeof value.slug !== 'object'
      ? value.slug
      : (value.code != null && typeof value.code !== 'object' ? value.code : null);
    if (slug != null && slug !== '') return sanitizeText(String(slug), 60);
    return sanitizeText(labelFromUnknown(value), 60);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return categorySlugFromUnknown(JSON.parse(trimmed));
      } catch {
        return sanitizeText(trimmed, 60);
      }
    }
    return sanitizeText(trimmed, 60);
  }
  return sanitizeText(String(value), 60);
}

function tagToString(t) {
  if (t == null || t === '') return '';
  if (typeof t === 'string') return sanitizeText(t, 40);
  if (typeof t === 'number' || typeof t === 'boolean') return sanitizeText(String(t), 40);
  if (typeof t === 'object') return sanitizeText(labelFromUnknown(t), 40);
  return '';
}

function parseTagsInput(value) {
  if (value == null || value === '') return [];
  if (Array.isArray(value)) {
    return value.map(tagToString).filter(Boolean).slice(0, 20);
  }
  if (typeof value === 'object') {
    if (Array.isArray(value.tags)) return value.tags.map(tagToString).filter(Boolean).slice(0, 20);
    const one = tagToString(value);
    return one ? [one] : [];
  }
  const raw = String(value).trim();
  if (!raw) return [];
  if (raw.startsWith('[')) {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr.map(tagToString).filter(Boolean).slice(0, 20);
    } catch { /* fall through */ }
  }
  return raw.split(/[,;]+/).map((t) => tagToString(t)).filter(Boolean).slice(0, 20);
}

function serializeTags(tags) {
  return JSON.stringify(parseTagsInput(tags));
}

function parseTagsStored(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(tagToString).filter(Boolean).slice(0, 20);
  if (typeof value === 'object') return parseTagsInput(value);
  try {
    const arr = JSON.parse(value);
    if (Array.isArray(arr)) return arr.map(tagToString).filter(Boolean).slice(0, 20);
    return parseTagsInput(arr);
  } catch {
    return parseTagsInput(value);
  }
}

async function blogCategoryLabel(slugOrObj, lang = 'tr') {
  const slug = categorySlugFromUnknown(slugOrObj);
  if (!slug) return '';
  const db = getDb();
  const row = await db.prepare('SELECT name_tr, name_en, icon FROM blog_categories WHERE slug = ? AND is_active = 1').get(slug);
  if (!row) return slug;
  const name = lang === 'en' ? (row.name_en || row.name_tr) : row.name_tr;
  return row.icon ? `${row.icon} ${name}` : name;
}

async function backfillBlogSlugs(database) {
  const db = getDb(database);
  const rows = await db.prepare("SELECT id, title, slug FROM blogs WHERE slug IS NULL OR slug = ''").all();
  for (const row of rows) {
    const base = await uniqueBlogSlug(db, slugify(sanitizeText(row.title, 200)) || `blog-${row.id}`, row.id);
    await db.prepare('UPDATE blogs SET slug = ? WHERE id = ?').run(base, row.id);
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
  labelFromUnknown,
  categorySlugFromUnknown,
  tagToString,
  parseTagsInput,
  serializeTags,
  parseTagsStored,
  blogCategoryLabel,
  backfillBlogSlugs,
  slugify,
};
