const moderationModel = require('./moderation.model');
const { computeUserRiskScore } = require('../../middleware/rbac');
const { db } = require('../../db');
const { publicImageUrl } = require('../../lib/media-url');
const { refreshPlaceStatsForTiola } = require('../../lib/tiola-stats');

function mapPendingTiola(row) {
  return {
    id: row.id,
    userName: row.user_name,
    placeName: row.place_name || '(Genel Tiola)',
    stars: row.stars,
    text: row.text,
    photoUrl: publicImageUrl(row.photo_path),
    cityTag: row.city_tag,
    status: row.status,
    createdAt: row.created_at,
  };
}

async function listPendingTiolas() {
  const rows = await moderationModel.pendingTiolas();
  return rows.map(mapPendingTiola);
}

async function listPendingBlogs() {
  const rows = await moderationModel.pendingBlogs();
  return rows.map((r) => ({
    id: r.id,
    userName: r.user_name,
    title: r.title,
    excerpt: r.excerpt,
    createdAt: r.created_at,
  }));
}

async function approveTiola(id, moderatorId) {
  await moderationModel.approveTiola(id, moderatorId);
  await refreshPlaceStatsForTiola(id);
  return { ok: true };
}

async function rejectTiola(id, moderatorId) {
  await moderationModel.rejectTiola(id, moderatorId);
  await refreshPlaceStatsForTiola(id);
  return { ok: true };
}

async function approveBlog(id, moderatorId) {
  await moderationModel.approveBlog(id, moderatorId);
  return { ok: true };
}

async function rejectBlog(id, moderatorId) {
  await moderationModel.rejectBlog(id, moderatorId);
  return { ok: true };
}

async function riskQueue() {
  const pendingUsers = await db.prepare(`
    SELECT DISTINCT u.id, u.name, u.email, u.created_at, u.risk_score
    FROM users u JOIN tiolas t ON t.user_id = u.id WHERE t.status = 'pending'
    LIMIT 50
  `).all();
  const scored = [];
  for (const u of pendingUsers) {
    scored.push({
      ...u,
      riskScore: await computeUserRiskScore(u.id),
    });
  }
  scored.sort((a, b) => b.riskScore - a.riskScore);
  return scored;
}

module.exports = {
  listPendingTiolas,
  listPendingBlogs,
  approveTiola,
  rejectTiola,
  approveBlog,
  rejectBlog,
  riskQueue,
};
