const express = require('express');

const { db } = require('../db');

const { authOptional, authRequired } = require('../middleware/auth');

const { sanitizeText } = require('../lib/sanitize');
const { honeypotGuard } = require('../middleware/honeypot');
const { csrfTokenRequired } = require('../middleware/csrf');
const { tiolaVoteLimiter } = require('../middleware/tiolaVoteLimit');
const { tiolaFormLimiter } = require('../middleware/rateLimit');
const { recaptchaGuard } = require('../middleware/recaptcha');
const { logAbnormal } = require('../lib/anti-bot-log');

const { enrichTiolaLikes, toggleTiolaLike } = require('../lib/likes');
const { canModifyOwnContent } = require('../lib/content-ownership');
const { validateUploadedImage } = require('../lib/image-mime');
const { processImageUpload } = require('../middleware/process-image-upload');
const { imageUploader } = require('../lib/image-uploader');
const { publicImageUrl } = require('../lib/media-url');
const { containsBannedWord } = require('../lib/contentFilter');
const { refreshPlaceStatsForTiola } = require('../lib/tiola-stats');



const router = express.Router();



const MONTHLY_COMMENT_LIMIT = 5;

const TIOLA_OK = {
  ok: true,
  message: 'Tiola\'n alındı. Onay sonrası yayınlanacak.',
};



const upload = imageUploader({ fileSize: 5 * 1024 * 1024, files: 1 });



const SPAM_WORDS = [

  'http://', 'https://', 'www.', 'bit.ly', 't.me/',

  'casino', 'viagra', 'kumar', 'bahis', 'forex', 'crypto scam',

  'click here', 'free money', 'whatsapp', 'telegram.me',

  'buy now', 'limited offer', 'earn $', 'work from home',

];



async function mapTiola(row, userId) {

  const likes = await enrichTiolaLikes(row, userId);

  const replyCount = row.reply_count != null

    ? row.reply_count

    : (await db.prepare("SELECT COUNT(*) AS c FROM tiolas WHERE parent_id = ? AND status = 'approved'").get(row.id)).c;

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

    photoUrl: publicImageUrl(row.photo_path),

    cityTag: row.city_tag,

    countryTag: row.country_tag,

    status: row.status,

    rejectionReason: row.rejection_reason || null,

    parentId: row.parent_id || null,

    replyCount,

    likeCount: likes.likeCount,

    likedByMe: likes.likedByMe,

    createdAt: row.created_at,

  };

}



function tiolaSelect(extra = '') {

  return `

    SELECT t.*, u.name AS user_name, u.avatar_color, u.avatar_url, u.avatar_preset,

           p.name AS place_name, p.image_url AS place_image,

           (SELECT COUNT(*) FROM tiolas r WHERE r.parent_id = t.id AND r.status = 'approved') AS reply_count

    FROM tiolas t

    JOIN users u ON u.id = t.user_id

    LEFT JOIN places p ON p.id = t.place_id

    ${extra}

  `;

}



async function looksLikeSpam(text) {

  const lower = text.toLowerCase();

  if (await containsBannedWord(text)) return true;

  if (SPAM_WORDS.some((w) => lower.includes(w))) return true;

  const linkCount = (lower.match(/https?:\/\//g) || []).length;

  if (linkCount >= 2) return true;

  if (/(.)\1{8,}/.test(lower)) return true;

  return false;

}



async function countMonthlyPlaceComments(userId, placeId) {

  return (await db.prepare(`

    SELECT COUNT(*) AS c FROM tiolas

    WHERE user_id = ? AND place_id = ? AND parent_id IS NULL

      AND created_at >= datetime('now', 'start of month')

      AND status NOT IN ('rejected', 'deleted')

  `).get(userId, placeId)).c;

}



router.get('/', authOptional, async (req, res) => {

  const { placeId, general, status, mine, parentId, limit = 50 } = req.query;

  const params = [];

  let where = 'WHERE 1=1';



  if (mine === '1') {

    if (!req.user) return res.status(401).json({ error: 'Giriş gerekli' });

    where += ' AND t.user_id = ? AND t.status != ?';

    params.push(req.user.id, 'deleted');

  } else {

    where += ' AND t.status = ?';

    params.push(status || 'approved');

  }



  if (parentId) {

    const pid = Number(parentId);

    if (!Number.isFinite(pid)) return res.status(400).json({ error: 'Geçersiz parentId' });

    where += ' AND t.parent_id = ?';

    params.push(pid);

  } else if (mine !== '1') {

    where += ' AND t.parent_id IS NULL';

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



  const rows = await db.prepare(`

    ${tiolaSelect(where)}

    ORDER BY t.created_at DESC

    LIMIT ?

  `).all(...params, Math.min(Number(limit) || 50, 100));



  res.json({ tiolas: await Promise.all(rows.map((r) => mapTiola(r, req.user?.id))) });

});



router.post('/', authRequired, csrfTokenRequired, tiolaFormLimiter, upload.single('photo'), honeypotGuard(TIOLA_OK), recaptchaGuard('tiola'), validateUploadedImage(), processImageUpload({ destRel: 'tiolas' }), async (req, res) => {

  const { text, stars, category, placeId, cityTag, countryTag, parentId } = req.body || {};

  const cleanText = sanitizeText(text, 2000);

  if (!cleanText) {

    return res.status(400).json({ error: 'Tiola metni gerekli' });

  }

  const starNum = stars ? Number(stars) : null;

  if (starNum !== null && (starNum < 1 || starNum > 5)) {

    return res.status(400).json({ error: 'Yıldız 1-5 arası olmalı' });

  }



  const parent = parentId ? Number(parentId) : null;

  if (parent) {

    const parentRow = await db.prepare('SELECT id, place_id, status FROM tiolas WHERE id = ?').get(parent);

    if (!parentRow) return res.status(404).json({ error: 'Yanıtlanan Tiola bulunamadı' });

    if (parentRow.status !== 'approved') return res.status(400).json({ error: 'Yalnızca onaylı Tiola\'lara yanıt verilebilir' });

  }



  const pid = placeId ? Number(placeId) : (parent ? (await db.prepare('SELECT place_id FROM tiolas WHERE id = ?').get(parent))?.place_id : null);

  if (pid) {

    const place = await db.prepare('SELECT id FROM places WHERE id = ?').get(pid);

    if (!place) return res.status(404).json({ error: 'Mekân bulunamadı' });

    if (!parent) {

      const monthly = await countMonthlyPlaceComments(req.user.id, pid);

      if (monthly >= MONTHLY_COMMENT_LIMIT) {

        return res.status(429).json({

          error: 'Bu mekâna bu ay en fazla 5 yorum yapabilirsiniz. Limitiniz doldu — gelecek ay tekrar deneyebilirsiniz.',

        });

      }

    }

    if (starNum && !parent) {

      const existing = await db.prepare(`

        SELECT id FROM tiolas

        WHERE user_id = ? AND place_id = ? AND stars IS NOT NULL AND stars > 0 AND status NOT IN ('rejected', 'deleted') AND parent_id IS NULL

      `).get(req.user.id, pid);

      if (existing) {
        logAbnormal({
          kind: 'duplicate_vote',
          req,
          userId: req.user.id,
          extra: { placeId: pid, existingId: existing.id },
        });
        return res.status(409).json({ error: 'Bu mekânı zaten puanladınız' });
      }

    }

  }



  const initialStatus = looksLikeSpam(cleanText) ? 'spam' : 'pending';

  if (initialStatus === 'spam') {
    logAbnormal({
      kind: 'spam_tiola',
      req,
      userId: req.user.id,
      extra: { placeId: pid || null },
    });
  }

  const photoPath = req.file ? (req.file.storageKey || req.file.publicUrl || req.file.filename) : null;

  let info;
  try {
    info = await db.prepare(`
      INSERT INTO tiolas (user_id, place_id, stars, category, text, photo_path, city_tag, country_tag, status, parent_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.id,
      pid,
      parent ? null : starNum,
      category ? sanitizeText(category, 60) || null : null,
      cleanText,
      photoPath,
      cityTag ? sanitizeText(cityTag, 80) : null,
      countryTag ? sanitizeText(countryTag, 80) : null,
      initialStatus,
      parent,
    );
  } catch (err) {
    const unique = err && (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || String(err.message || '').includes('UNIQUE'));
    if (unique && starNum && !parent && pid) {
      logAbnormal({
        kind: 'duplicate_vote',
        req,
        userId: req.user.id,
        extra: { placeId: pid, constraint: true },
      });
      return res.status(409).json({ error: 'Bu mekânı zaten puanladınız' });
    }
    throw err;
  }



  const row = await db.prepare(`${tiolaSelect('WHERE t.id = ?')}`).get(info.lastInsertRowid);

  res.status(201).json({

    tiola: await mapTiola(row, req.user.id),

    message: initialStatus === 'spam'

      ? 'Tiola spam olarak işaretlendi ve yayınlanmayacak.'

      : parent

        ? 'Yanıtınız alındı. Onay sonrası yayınlanacak.'

        : 'Tiola\'n alındı. Onay sonrası yayınlanacak.',

  });

});



router.post('/:id/like', authRequired, csrfTokenRequired, tiolaVoteLimiter, async (req, res) => {

  const id = Number(req.params.id);

  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Geçersiz id' });

  const row = await db.prepare("SELECT id, user_id, status FROM tiolas WHERE id = ? AND status = 'approved'").get(id);

  if (!row) return res.status(404).json({ error: 'Tiola bulunamadı' });

  if (row.user_id === req.user.id) return res.status(400).json({ error: 'Kendi Tiola\'nızı beğenemezsiniz' });

  const result = await toggleTiolaLike(req.user.id, id);

  res.json(result);

});



router.delete('/:id', authRequired, csrfTokenRequired, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Geçersiz id' });

  const row = await db.prepare('SELECT id, user_id, status, parent_id FROM tiolas WHERE id = ?').get(id);
  if (!row || row.status === 'deleted') {
    return res.status(404).json({ error: 'Tiola bulunamadı' });
  }
  if (!canModifyOwnContent(req.user, row.user_id)) {
    return res.status(403).json({ error: 'Bu içeriği silme yetkiniz yok' });
  }

  if (row.parent_id) {
    await db.prepare(`
      UPDATE tiolas SET status = 'deleted', moderated_at = datetime('now') WHERE id = ?
    `).run(id);
  } else {
    await db.prepare(`
      UPDATE tiolas SET status = 'deleted', moderated_at = datetime('now')
      WHERE id = ? OR parent_id = ?
    `).run(id, id);
  }

  await refreshPlaceStatsForTiola(id);
  res.json({ deleted: true, message: 'Paylaşımınız silindi' });
});

router.get('/pending/count', authRequired, async (req, res) => {

  if (!['admin', 'moderator', 'staff'].includes(req.user.role)) {

    return res.status(403).json({ error: 'Yetki yok' });

  }

  const count = (await db.prepare("SELECT COUNT(*) AS c FROM tiolas WHERE status = 'pending'").get()).c;

  const spamCount = (await db.prepare("SELECT COUNT(*) AS c FROM tiolas WHERE status = 'spam'").get()).c;

  const blogCount = (await db.prepare("SELECT COUNT(*) AS c FROM blogs WHERE status = 'pending'").get()).c;

  res.json({ tiolas: count, spam: spamCount, blogs: blogCount });

});



module.exports = router;

