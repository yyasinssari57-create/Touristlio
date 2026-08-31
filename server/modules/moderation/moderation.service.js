const moderationModel = require('./moderation.model');

const { computeUserRiskScore } = require('../../middleware/rbac');

const { db } = require('../../db');
const { refreshPlaceStatsForTiola } = require('../../lib/tiola-stats');



function mapPendingTiola(row) {

  return {

    id: row.id,

    userName: row.user_name,

    placeName: row.place_name || '(Genel Tiola)',

    stars: row.stars,

    text: row.text,

    photoUrl: row.photo_path ? `/uploads/${row.photo_path}` : null,

    cityTag: row.city_tag,

    status: row.status,

    createdAt: row.created_at,

  };

}



function listPendingTiolas() {

  return moderationModel.pendingTiolas().map(mapPendingTiola);

}



function listPendingBlogs() {

  return moderationModel.pendingBlogs().map((r) => ({

    id: r.id,

    userName: r.user_name,

    title: r.title,

    excerpt: r.excerpt,

    createdAt: r.created_at,

  }));

}



function approveTiola(id, moderatorId) {

  moderationModel.approveTiola(id, moderatorId);
  refreshPlaceStatsForTiola(id);

  return { ok: true };

}



function rejectTiola(id, moderatorId) {

  moderationModel.rejectTiola(id, moderatorId);
  refreshPlaceStatsForTiola(id);

  return { ok: true };

}



function approveBlog(id, moderatorId) {

  moderationModel.approveBlog(id, moderatorId);

  return { ok: true };

}



function rejectBlog(id, moderatorId) {

  moderationModel.rejectBlog(id, moderatorId);

  return { ok: true };

}



function riskQueue() {

  const pendingUsers = db.prepare(`

    SELECT DISTINCT u.id, u.name, u.email, u.created_at, u.risk_score

    FROM users u JOIN tiolas t ON t.user_id = u.id WHERE t.status = 'pending'

    LIMIT 50

  `).all();

  return pendingUsers.map((u) => ({

    ...u,

    riskScore: computeUserRiskScore(u.id),

  })).sort((a, b) => b.riskScore - a.riskScore);

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

