const path = require('path');
const express = require('express');
const multer = require('multer');
const { db } = require('../db');
const { authOptional, authRequired } = require('../middleware/auth');
const { sanitizeText } = require('../lib/sanitize');

const router = express.Router();

const MIME_TO_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', '..', 'uploads'),
  filename: (_req, file, cb) => {
    const ext = MIME_TO_EXT[file.mimetype] || '.jpg';
    cb(null, `tiola-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Sadece resim dosyaları (JPG, PNG, WebP)'));
  },
});

const SPAM_WORDS = [
  'http://', 'https://', 'www.', 'bit.ly', 't.me/',
  'casino', 'viagra', 'kumar', 'bahis', 'forex', 'crypto scam',
  'click here', 'free money', 'whatsapp', 'telegram.me',
  'buy now', 'limited offer', 'earn $', 'work from home',
];

function mapTiola(row) {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    avatarColor: row.avatar_color,
    avatarUrl: row.avatar_url || null,
    avatarPreset: row.avatar_preset || null,
    placeId: row.place_id,
    placeName: row.place_name,
    placeImage: row.place_image,
    stars: row.stars,
    category: row.category,
    text: row.text,
    photoUrl: row.photo_path ? `/uploads/${path.basename(row.photo_path)}` : null,
    cityTag: row.city_tag,
    countryTag: row.country_tag,
    status: row.status,
    rejectionReason: row.rejection_reason || null,
    createdAt: row.created_at,
  };
}

function tiolaSelect(extra = '') {
  return `
    SELECT t.*, u.name AS user_name, u.avatar_color, u.avatar_url, u.avatar_preset,
           p.name AS place_name, p.image_url AS place_image
    FROM tiolas t
    JOIN users u ON u.id = t.user_id
    LEFT JOIN places p ON p.id = t.place_id
    ${extra}
  `;
}

function looksLikeSpam(text) {
  const lower = text.toLowerCase();
  if (SPAM_WORDS.some((w) => lower.includes(w))) return true;
  const linkCount = (lower.match(/https?:\/\//g) || []).length;
  if (linkCount >= 2) return true;
  if (/(.)\1{8,}/.test(lower)) return true;
  return false;
}

router.get('/', authOptional, (req, res) => {
  const { placeId, general, status, mine, limit = 50 } = req.query;
  const params = [];
  let where = 'WHERE 1=1';

  if (mine === '1') {
    if (!req.user) return res.status(401).json({ error: 'Giriş gerekli' });
    where += ' AND t.user_id = ?';
    params.push(req.user.id);
  } else {
    where += ' AND t.status = ?';
    params.push(status || 'approved');
  }

  if (placeId) {
    const pid = Number(placeId);
    if (!Number.isFinite(pid)) return res.status(400).json({ error: 'Geçersiz placeId' });
    where += ' AND t.place_id = ?';
    params.push(pid);
  }
  if (general === '1') {
    where += ' AND t.place_id IS NULL';
  }

  const rows = db.prepare(`
    ${tiolaSelect(where)}
    ORDER BY t.created_at DESC
    LIMIT ?
  `).all(...params, Math.min(Number(limit) || 50, 100));

  res.json({ tiolas: rows.map(mapTiola) });
});

router.post('/', authRequired, upload.single('photo'), (req, res) => {
  const { text, stars, category, placeId, cityTag, countryTag } = req.body || {};
  const cleanText = sanitizeText(text, 2000);
  if (!cleanText) {
    return res.status(400).json({ error: 'Tiola metni gerekli' });
  }
  const starNum = stars ? Number(stars) : null;
  if (starNum !== null && (starNum < 1 || starNum > 5)) {
    return res.status(400).json({ error: 'Yıldız 1-5 arası olmalı' });
  }

  const pid = placeId ? Number(placeId) : null;
  if (pid) {
    const place = db.prepare('SELECT id FROM places WHERE id = ?').get(pid);
    if (!place) return res.status(404).json({ error: 'Mekân bulunamadı' });
    if (starNum) {
      const existing = db.prepare(`
        SELECT id FROM tiolas
        WHERE user_id = ? AND place_id = ? AND stars IS NOT NULL AND stars > 0 AND status != 'rejected'
      `).get(req.user.id, pid);
      if (existing) {
        return res.status(409).json({ error: 'Bu mekânı zaten puanladınız' });
      }
    }
  }

  const initialStatus = looksLikeSpam(cleanText) ? 'spam' : 'pending';
  const photoPath = req.file ? req.file.filename : null;

  const info = db.prepare(`
    INSERT INTO tiolas (user_id, place_id, stars, category, text, photo_path, city_tag, country_tag, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.user.id,
    pid,
    starNum,
    category || null,
    cleanText,
    photoPath,
    cityTag ? sanitizeText(cityTag, 80) : null,
    countryTag ? sanitizeText(countryTag, 80) : null,
    initialStatus,
  );

  const row = db.prepare(`${tiolaSelect('WHERE t.id = ?')}`).get(info.lastInsertRowid);
  res.status(201).json({
    tiola: mapTiola(row),
    message: initialStatus === 'spam'
      ? 'Tiola spam olarak işaretlendi ve yayınlanmayacak.'
      : 'Tiola\'n alındı. Onay sonrası yayınlanacak.',
  });
});

router.get('/pending/count', authRequired, (req, res) => {
  if (!['admin', 'moderator'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Yetki yok' });
  }
  const count = db.prepare("SELECT COUNT(*) AS c FROM tiolas WHERE status = 'pending'").get().c;
  const spamCount = db.prepare("SELECT COUNT(*) AS c FROM tiolas WHERE status = 'spam'").get().c;
  const blogCount = db.prepare("SELECT COUNT(*) AS c FROM blogs WHERE status = 'pending'").get().c;
  res.json({ tiolas: count, spam: spamCount, blogs: blogCount });
});

module.exports = router;
