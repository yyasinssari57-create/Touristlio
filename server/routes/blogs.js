const express = require('express');
const { body, validationResult } = require('express-validator');
const { db } = require('../db');
const { authOptional, authRequired } = require('../middleware/auth');
const { sanitizeText } = require('../lib/sanitize');
const blogDb = require('../lib/blog-db');
const settingsService = require('../modules/settings/settings.service');
const { enrichBlogLikes, toggleBlogLike } = require('../lib/likes');
const { canModifyOwnContent } = require('../lib/content-ownership');
const { containsBannedWord } = require('../lib/contentFilter');

const router = express.Router();

const MAX_TITLE = 200;
const MAX_EXCERPT = 500;
const MAX_BODY = 20000;

function categoryLabel(slug, lang) {
  const row = db.prepare('SELECT name_tr, name_en, icon FROM blog_categories WHERE slug = ? AND is_active = 1').get(slug);
  if (!row) return slug || '';
  const name = lang === 'en' ? (row.name_en || row.name_tr) : row.name_tr;
  return row.icon ? `${row.icon} ${name}` : name;
}

function mapBlog(row, lang = 'tr', userId = null) {
  const tags = blogDb.parseTagsStored(row.tags);
  const displayAuthor = row.author_name || row.author_name_user || 'Anonim';
  const likes = enrichBlogLikes(row, userId);
  return {
    id: row.id,
    userId: row.user_id,
    slug: row.slug,
    category: row.category,
    categoryLabel: categoryLabel(row.category, lang),
    title: row.title,
    excerpt: row.excerpt,
    body: row.body,
    imageUrl: row.image_url,
    placeId: row.place_id,
    authorName: displayAuthor,
    avatarColor: row.avatar_color || null,
    avatarUrl: row.avatar_url || null,
    avatarPreset: row.avatar_preset || null,
    tags,
    featured: !!row.featured,
    status: row.status,
    rejectionReason: row.rejection_reason || null,
    likeCount: likes.likeCount,
    likedByMe: likes.likedByMe,
    publishedAt: row.published_at || row.created_at,
    createdAt: row.created_at,
  };
}

function publicBlogSelect() {
  return `
    SELECT b.*, u.name AS author_name_user, u.avatar_color, u.avatar_url, u.avatar_preset
    FROM blogs b
    JOIN users u ON u.id = b.user_id
  `;
}

router.get('/meta', (_req, res) => {
  const lang = String(_req.query.lang || 'tr').startsWith('en') ? 'en' : 'tr';
  const page = settingsService.getBlogPageSettings();
  const categories = blogDb.listBlogCategories().map((c) => ({
    slug: c.slug,
    label: lang === 'en'
      ? (c.icon ? `${c.icon} ${c.nameEn}` : c.nameEn)
      : (c.icon ? `${c.icon} ${c.nameTr}` : c.nameTr),
    nameTr: c.nameTr,
    nameEn: c.nameEn,
    icon: c.icon,
    postCount: c.postCount,
  }));
  res.json({
    page: {
      heroTitle: lang === 'en' ? page.heroTitleEn : page.heroTitleTr,
      heroTitleEm: lang === 'en' ? page.heroTitleEmEn : page.heroTitleEmTr,
      subtitle: lang === 'en' ? page.subtitleEn : page.subtitleTr,
      catAll: lang === 'en' ? page.catAllEn : page.catAllTr,
      empty: lang === 'en' ? page.emptyEn : page.emptyTr,
      searchPh: lang === 'en' ? page.searchPhEn : page.searchPhTr,
      featuredLbl: lang === 'en' ? page.featuredLblEn : page.featuredLblTr,
      viewPlace: lang === 'en' ? page.viewPlaceEn : page.viewPlaceTr,
    },
    categories,
  });
});

router.get('/', authOptional, (req, res) => {
  const { category, mine, featured, q } = req.query;
  const lang = String(req.query.lang || 'tr').startsWith('en') ? 'en' : 'tr';
  const params = [];
  let where = 'WHERE 1=1';

  if (mine === '1') {
    if (!req.user) return res.status(401).json({ error: 'Giriş gerekli' });
    where += " AND b.user_id = ? AND b.status != 'deleted'";
    params.push(req.user.id);
  } else {
    where += " AND b.status = 'approved'";
  }
  if (category && category !== 'all') {
    where += ' AND b.category = ?';
    params.push(category);
  }
  if (featured === '1') {
    where += ' AND b.featured = 1';
  }
  if (q && String(q).trim()) {
    where += ' AND (b.title LIKE ? OR b.excerpt LIKE ? OR b.body LIKE ?)';
    const like = `%${sanitizeText(q, 80)}%`;
    params.push(like, like, like);
  }

  const rows = db.prepare(`
    ${publicBlogSelect()}
    ${where}
    ORDER BY b.featured DESC, datetime(COALESCE(b.published_at, b.created_at)) DESC
  `).all(...params);

  res.json({ blogs: rows.map((r) => mapBlog(r, lang, req.user?.id)) });
});

router.get('/:slug', authOptional, (req, res) => {
  const lang = String(req.query.lang || 'tr').startsWith('en') ? 'en' : 'tr';
  const slug = sanitizeText(req.params.slug, 120);
  if (!slug) return res.status(400).json({ error: 'Geçersiz slug' });

  let row = db.prepare(`
    ${publicBlogSelect()}
    WHERE b.slug = ?
  `).get(slug);

  if (!row && /^\d+$/.test(slug)) {
    row = db.prepare(`
      ${publicBlogSelect()}
      WHERE b.id = ?
    `).get(Number(slug));
  }

  if (!row || row.status === 'deleted') return res.status(404).json({ error: 'Blog bulunamadı' });
  if (row.status !== 'approved') {
    if (!req.user || (req.user.id !== row.user_id && !['admin', 'moderator', 'editor', 'staff'].includes(req.user.role))) {
      return res.status(404).json({ error: 'Blog bulunamadı' });
    }
  }

  res.json({ blog: mapBlog(row, lang, req.user?.id) });
});

router.post('/:id/like', authRequired, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Geçersiz id' });
  const row = db.prepare("SELECT id, user_id, status FROM blogs WHERE id = ? AND status = 'approved'").get(id);
  if (!row) return res.status(404).json({ error: 'Blog bulunamadı' });
  if (row.user_id === req.user.id) return res.status(400).json({ error: 'Kendi blogunuzu beğenemezsiniz' });
  const result = toggleBlogLike(req.user.id, id);
  res.json(result);
});

router.post('/', authRequired, [
  body('imageUrl')
    .optional({ nullable: true, checkFalsy: true })
    .isURL({ protocols: ['https'], require_protocol: true })
    .withMessage('Görsel URL geçerli bir HTTPS adresi olmalı'),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

  if (!req.user.emailVerified) {
    return res.status(403).json({
      error: 'Blog yazmak için e-posta adresinizi doğrulamanız gerekir.',
    });
  }

  const { title, excerpt, body: bodyText, category, imageUrl, placeId } = req.body || {};
  const cleanTitle = sanitizeText(title, MAX_TITLE);
  const cleanBody = sanitizeText(bodyText, MAX_BODY);
  if (!cleanTitle || !cleanBody) {
    return res.status(400).json({ error: 'Başlık ve içerik gerekli' });
  }
  const cleanExcerpt = sanitizeText(excerpt || cleanBody, MAX_EXCERPT).slice(0, MAX_EXCERPT);
  const slug = blogDb.uniqueBlogSlug(db, blogDb.slugify(cleanTitle) || `blog-${Date.now()}`);
  const combined = `${cleanTitle} ${cleanExcerpt} ${cleanBody}`;
  const initialStatus = containsBannedWord(combined) ? 'spam' : 'pending';
  const info = db.prepare(`
    INSERT INTO blogs (user_id, category, title, slug, excerpt, body, image_url, place_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.user.id,
    category || 'guide',
    cleanTitle,
    slug,
    cleanExcerpt,
    cleanBody,
    imageUrl || null,
    placeId ? Number(placeId) : null,
    initialStatus,
  );
  const row = db.prepare(`
    SELECT b.*, u.name AS author_name_user FROM blogs b
    JOIN users u ON u.id = b.user_id WHERE b.id = ?
  `).get(info.lastInsertRowid);
  res.status(201).json({
    blog: mapBlog(row, 'tr', req.user.id),
    message: initialStatus === 'spam'
      ? 'Blog yazınız spam olarak işaretlendi ve yayınlanmayacak.'
      : 'Blog yazın alındı. Onay sonrası yayınlanacak.',
  });
});

router.delete('/:id', authRequired, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Geçersiz id' });

  const row = db.prepare('SELECT id, user_id, status FROM blogs WHERE id = ?').get(id);
  if (!row || row.status === 'deleted') {
    return res.status(404).json({ error: 'Blog bulunamadı' });
  }
  if (!canModifyOwnContent(req.user, row.user_id)) {
    return res.status(403).json({ error: 'Bu içeriği silme yetkiniz yok' });
  }

  db.prepare(`
    UPDATE blogs SET status = 'deleted', moderated_at = datetime('now')
    WHERE id = ?
  `).run(id);

  res.json({ deleted: true, message: 'Blog yazınız silindi' });
});

module.exports = router;
