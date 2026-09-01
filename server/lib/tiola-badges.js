/**
 * Community badges earned from approved top-level Tiola count (user-generated reviews).
 * No Google ratings.
 */
const { db } = require('../db');

const TIOLA_BADGES = [
  { id: 'first-tiola', min: 1, icon: '✨', nameTr: 'İlk Tiola', nameEn: 'First Tiola' },
  { id: 'gezgin', min: 5, icon: '🎒', nameTr: 'Gezgin', nameEn: 'Traveler' },
  { id: 'rehber', min: 10, icon: '🗺️', nameTr: 'Yerel Rehber', nameEn: 'Local Guide' },
  { id: 'usta', min: 25, icon: '⭐', nameTr: 'Tiola Ustası', nameEn: 'Tiola Master' },
  { id: 'elci', min: 50, icon: '🌍', nameTr: 'Elçi', nameEn: 'Ambassador' },
];

async function approvedTiolaCount(userId) {
  const id = Number(userId);
  if (!Number.isFinite(id) || id < 1) return 0;
  const row = await db.prepare(`
    SELECT COUNT(*) AS c FROM tiolas
    WHERE user_id = ? AND status = 'approved' AND parent_id IS NULL
  `).get(id);
  return row?.c || 0;
}

function badgesForCount(count, lang = 'tr') {
  const n = Number(count) || 0;
  const en = lang === 'en';
  const badges = TIOLA_BADGES.map((b) => ({
    id: b.id,
    icon: b.icon,
    min: b.min,
    name: en ? b.nameEn : b.nameTr,
    nameTr: b.nameTr,
    nameEn: b.nameEn,
    earned: n >= b.min,
  }));
  const earned = badges.filter((b) => b.earned);
  const next = badges.find((b) => !b.earned) || null;
  return {
    tiolaCount: n,
    badges,
    earned,
    next: next
      ? { id: next.id, icon: next.icon, name: next.name, min: next.min, remaining: Math.max(0, next.min - n) }
      : null,
  };
}

async function badgesForUser(userId, lang = 'tr') {
  return badgesForCount(await approvedTiolaCount(userId), lang);
}

module.exports = {
  TIOLA_BADGES,
  approvedTiolaCount,
  badgesForCount,
  badgesForUser,
};
