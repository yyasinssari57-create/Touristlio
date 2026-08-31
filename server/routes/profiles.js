const express = require('express');
const { db } = require('../db');
const { authOptional } = require('../middleware/auth');
const { getUserTiolaLikeCount } = require('../lib/likes');
const { badgesForCount } = require('../lib/tiola-badges');

const router = express.Router();

router.get('/:id', authOptional, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id < 1) {
    return res.status(400).json({ error: 'Geçersiz kullanıcı' });
  }
  const row = db.prepare(`
    SELECT id, name, role, avatar_color, avatar_url, avatar_preset, created_at, is_blocked
    FROM users WHERE id = ?
  `).get(id);
  if (!row || row.is_blocked) {
    return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
  }

  const lang = req.query.lang === 'en' ? 'en' : 'tr';
  const tiolaCount = db.prepare(`
    SELECT COUNT(*) AS c FROM tiolas
    WHERE user_id = ? AND status = 'approved' AND parent_id IS NULL
  `).get(id).c;
  const badgePayload = badgesForCount(tiolaCount, lang);
  const blogCount = db.prepare(`
    SELECT COUNT(*) AS c FROM blogs WHERE user_id = ? AND status = 'approved'
  `).get(id).c;
  const likeCount = getUserTiolaLikeCount(id);
  const recentTiolas = db.prepare(`
    SELECT t.id, t.text, t.stars, t.place_id, t.created_at, t.status,
           p.name AS place_name
    FROM tiolas t
    LEFT JOIN places p ON p.id = t.place_id
    WHERE t.user_id = ? AND t.status = 'approved' AND t.parent_id IS NULL
    ORDER BY t.created_at DESC LIMIT 10
  `).all(id);

  res.json({
    profile: {
      id: row.id,
      name: row.name,
      avatarColor: row.avatar_color,
      avatarUrl: row.avatar_url || null,
      avatarPreset: row.avatar_preset || null,
      memberSince: row.created_at,
      tiolaCount,
      badges: badgePayload.badges,
      earnedBadges: badgePayload.earned,
      nextBadge: badgePayload.next,
      blogCount,
      likeCount,
      recentTiolas: recentTiolas.map((t) => ({
        id: t.id,
        text: t.text,
        stars: t.stars,
        placeId: t.place_id,
        placeName: t.place_name,
        createdAt: t.created_at,
      })),
      isSelf: req.user?.id === id,
    },
  });
});

module.exports = router;
