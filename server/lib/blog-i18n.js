/**
 * V4 Adım 2 — blog EN alanları.
 * lang=en iken TR metnine düşülmez. Dört alan da doluysa translated.
 * Mevcut TR satırlarına yazılmaz.
 */

const UNTRANSLATED_NOTE = 'Bu yazı henüz İngilizceye çevrilmedi';
const EN_UNTRANSLATED_TITLE = 'This story is not in English yet — Touristlio';
const EN_UNTRANSLATED_DESCRIPTION = 'This story has not been translated into English yet.';

function filled(value) {
  return String(value == null ? '' : value).trim();
}

function blogEnFields(row) {
  const title = filled(row?.title_en ?? row?.titleEn);
  const excerpt = filled(row?.excerpt_en ?? row?.excerptEn);
  const body = filled(row?.body_en ?? row?.bodyEn);
  const slug = filled(row?.slug_en ?? row?.slugEn);
  return {
    title,
    excerpt,
    body,
    slug,
    translated: !!(title && excerpt && body && slug),
  };
}

function blogTrFields(row) {
  return {
    title: filled(row?.title),
    excerpt: filled(row?.excerpt),
    body: filled(row?.body),
    slug: filled(row?.slug),
  };
}

/** Display fields for one language. EN never copies title/excerpt/body/slug from TR. */
function localizeBlog(row, lang = 'tr') {
  const en = blogEnFields(row);
  const tr = blogTrFields(row);
  const useEn = lang === 'en';
  return {
    title: useEn ? en.title : tr.title,
    excerpt: useEn ? en.excerpt : tr.excerpt,
    body: useEn ? en.body : tr.body,
    slug: useEn ? en.slug : tr.slug,
    titleEn: en.title,
    excerptEn: en.excerpt,
    bodyEn: en.body,
    slugEn: en.slug,
    titleTr: tr.title,
    excerptTr: tr.excerpt,
    bodyTr: tr.body,
    slugTr: tr.slug,
    translated: en.translated,
  };
}

function blogAuthorName(row, lang = 'tr') {
  const name = filled(row?.author_name) || filled(row?.author_name_user) || filled(row?.user_name);
  if (name) return name;
  return lang === 'en' ? 'Anonymous' : 'Anonim';
}

function blogEnReadySql(alias = 'b') {
  const a = alias || 'b';
  return `AND ${a}.title_en IS NOT NULL AND btrim(${a}.title_en) <> ''
    AND ${a}.excerpt_en IS NOT NULL AND btrim(${a}.excerpt_en) <> ''
    AND ${a}.body_en IS NOT NULL AND btrim(${a}.body_en) <> ''
    AND ${a}.slug_en IS NOT NULL AND btrim(${a}.slug_en) <> ''`;
}

function blogEnSitemapPath(row) {
  const en = blogEnFields(row);
  if (!en.translated) return null;
  return `/en/blog/${encodeURIComponent(en.slug)}`;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function untranslatedNoteHtml(trPath) {
  const href = escapeHtml(trPath || '/blog');
  return `<h1 class="bd-title">This story is not in English yet</h1>`
    + `<p class="bd-excerpt">${UNTRANSLATED_NOTE}.</p>`
    + `<p class="bd-excerpt">This story has not been translated into English yet.</p>`
    + `<p class="bd-excerpt"><a href="${href}">Türkçe sürüm</a></p>`;
}

function injectUntranslatedNote(html, trPath) {
  const note = untranslatedNoteHtml(trPath);
  return String(html).replace(/id="blogDetailBody">\s*/, `id="blogDetailBody">${note}`);
}

async function findBlogRow(db, slug, lang = 'tr') {
  const clean = filled(slug);
  if (!clean || !db) return null;
  const select = `
    SELECT b.*, u.name AS author_name_user, u.avatar_color, u.avatar_url, u.avatar_preset
    FROM blogs b
    JOIN users u ON u.id = b.user_id
  `;
  if (lang === 'en') {
    let row = await db.prepare(`${select} WHERE b.slug_en = ?`).get(clean);
    if (!row) row = await db.prepare(`${select} WHERE b.slug = ?`).get(clean);
    return row || null;
  }
  return (await db.prepare(`${select} WHERE b.slug = ?`).get(clean)) || null;
}

/** Approved blogs with a complete EN translation (title/excerpt/body/slug_en). */
async function countPublishedEnBlogs(db) {
  if (!db) return 0;
  const row = await db.prepare(`
    SELECT COUNT(*)::int AS n
    FROM blogs b
    WHERE b.status = 'approved'
      AND b.slug IS NOT NULL AND btrim(b.slug) <> ''
      ${blogEnReadySql('b')}
  `).get();
  return Number(row?.n || 0);
}

async function hasPublishedEnBlogs(db) {
  return (await countPublishedEnBlogs(db)) > 0;
}

module.exports = {
  UNTRANSLATED_NOTE,
  EN_UNTRANSLATED_TITLE,
  EN_UNTRANSLATED_DESCRIPTION,
  filled,
  blogEnFields,
  blogTrFields,
  localizeBlog,
  blogAuthorName,
  blogEnReadySql,
  blogEnSitemapPath,
  untranslatedNoteHtml,
  injectUntranslatedNote,
  findBlogRow,
  countPublishedEnBlogs,
  hasPublishedEnBlogs,
};
