const express = require('express');
const { body, validationResult } = require('express-validator');
const { db } = require('../db');
const { authOptional, authRequired } = require('../middleware/auth');
const { sanitizeText } = require('../lib/sanitize');

const router = express.Router();

const MAX_TITLE = 200;
const MAX_EXCERPT = 500;
const MAX_BODY = 20000;

function mapBlog(row) {
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    excerpt: row.excerpt,
    body: row.body,
    imageUrl: row.image_url,
    placeId: row.place_id,
    authorName: row.author_name,
    status: row.status,
    createdAt: row.created_at,
  };
}

router.get('/', authOptional, (req, res) => {
  const { category, mine } = req.query;
  const params = [];
  let where = 'WHERE 1=1';

  if (mine === '1') {
    if (!req.user) return res.status(401).json({ error: 'Giriş gerekli' });
    where += ' AND b.user_id = ?';
    params.push(req.user.id);
  } else {
    where += " AND b.status = 'approved'";
  }
  if (category && category !== 'all') {
    where += ' AND b.category = ?';
    params.push(category);
  }

  const rows = db.prepare(`
    SELECT b.*, u.name AS author_name
    FROM blogs b JOIN users u ON u.id = b.user_id
    ${where}
    ORDER BY b.created_at DESC
  `).all(...params);

  res.json({ blogs: rows.map(mapBlog) });
});

router.post('/', authRequired, [
  body('imageUrl')
    .optional({ nullable: true, checkFalsy: true })
    .isURL({ protocols: ['https'], require_protocol: true })
    .withMessage('Görsel URL geçerli bir HTTPS adresi olmalı'),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

  const { title, excerpt, body: bodyText, category, imageUrl, placeId } = req.body || {};
  const cleanTitle = sanitizeText(title, MAX_TITLE);
  const cleanBody = sanitizeText(bodyText, MAX_BODY);
  if (!cleanTitle || !cleanBody) {
    return res.status(400).json({ error: 'Başlık ve içerik gerekli' });
  }
  const cleanExcerpt = sanitizeText(excerpt || cleanBody, MAX_EXCERPT).slice(0, MAX_EXCERPT);
  const info = db.prepare(`
    INSERT INTO blogs (user_id, category, title, excerpt, body, image_url, place_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
  `).run(
    req.user.id,
    category || 'guide',
    cleanTitle,
    cleanExcerpt,
    cleanBody,
    imageUrl || null,
    placeId ? Number(placeId) : null,
  );
  const row = db.prepare(`
    SELECT b.*, u.name AS author_name FROM blogs b
    JOIN users u ON u.id = b.user_id WHERE b.id = ?
  `).get(info.lastInsertRowid);
  res.status(201).json({
    blog: mapBlog(row),
    message: 'Blog yazın alındı. Onay sonrası yayınlanacak.',
  });
});

module.exports = router;
