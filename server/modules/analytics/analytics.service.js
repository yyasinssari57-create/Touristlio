const analyticsModel = require('./analytics.model');

const { db } = require('../../db');



function dashboard() {

  return {

    users: analyticsModel.count('users'),

    places: analyticsModel.count('places'),

    tiolasApproved: analyticsModel.count('tiolas', "status = 'approved'"),

    tiolasPending: analyticsModel.count('tiolas', "status = 'pending'"),

    blogsPending: analyticsModel.count('blogs', "status = 'pending'"),

    visitedRecords: analyticsModel.count('visited_places'),

    travelLists: analyticsModel.count('travel_lists'),

  };

}



function contentQuality() {

  const total = analyticsModel.count('places');

  const noPhoto = db.prepare("SELECT COUNT(*) AS c FROM places WHERE photos IS NULL OR photos = '[]' OR photos = ''").get().c;

  const noFaq = db.prepare("SELECT COUNT(*) AS c FROM places WHERE faq_tr IS NULL OR faq_tr = '[]'").get().c;

  const noCoords = db.prepare('SELECT COUNT(*) AS c FROM places WHERE lat IS NULL OR lng IS NULL').get().c;

  const shortDesc = db.prepare('SELECT COUNT(*) AS c FROM places WHERE length(description) < 80').get().c;

  return {

    total,

    issues: {
      noPhoto: { count: noPhoto, label: 'Fotoğraf eksik' },
      noFaq: { count: noFaq, label: 'FAQ eksik' },
      noCoords: { count: noCoords, label: 'Koordinat eksik' },
      shortDesc: { count: shortDesc, label: 'Kısa açıklama' },
    },

    score: Math.round(100 - ((noPhoto + noFaq + noCoords + shortDesc) / Math.max(total, 1)) * 25),

  };

}



function byCategory() {

  const rows = db.prepare(`

    SELECT category, COUNT(*) AS c FROM places GROUP BY category ORDER BY c DESC LIMIT 20

  `).all();

  return rows;

}

function timeseries() {
  const days = [];
  for (let i = 29; i >= 0; i -= 1) {
    const row = db.prepare(`SELECT date('now', '-' || ? || ' days') AS day`).get(i);
    days.push(row.day);
  }

  const usersByDay = db.prepare(`
    SELECT date(created_at) AS day, COUNT(*) AS c
    FROM users
    WHERE created_at >= datetime('now', '-30 days')
    GROUP BY date(created_at)
  `).all();
  const tiolasByDay = db.prepare(`
    SELECT date(created_at) AS day, COUNT(*) AS c
    FROM tiolas
    WHERE created_at >= datetime('now', '-30 days') AND parent_id IS NULL
    GROUP BY date(created_at)
  `).all();
  const blogsByDay = db.prepare(`
    SELECT date(created_at) AS day, COUNT(*) AS c
    FROM blogs
    WHERE created_at >= datetime('now', '-30 days')
    GROUP BY date(created_at)
  `).all();

  const mapCounts = (rows) => Object.fromEntries(rows.map((r) => [r.day, r.c]));
  const uMap = mapCounts(usersByDay);
  const tMap = mapCounts(tiolasByDay);
  const bMap = mapCounts(blogsByDay);

  return {
    days,
    users: days.map((d) => uMap[d] || 0),
    tiolas: days.map((d) => tMap[d] || 0),
    blogs: days.map((d) => bMap[d] || 0),
  };
}

function topPlaces() {
  const rows = db.prepare(`
    SELECT p.id, p.name, p.city, p.country,
      (SELECT COUNT(*) FROM tiolas t WHERE t.place_id = p.id AND t.status = 'approved' AND t.parent_id IS NULL) AS tiolaCount,
      (SELECT COUNT(*) FROM saved_places sp WHERE sp.place_id = p.id) AS saveCount
    FROM places p
    ORDER BY tiolaCount DESC, saveCount DESC
    LIMIT 10
  `).all();
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    city: r.city,
    country: r.country,
    tiolaCount: r.tiolaCount,
    saveCount: r.saveCount,
  }));
}

function topUsers() {
  const rows = db.prepare(`
    SELECT u.id, u.name, u.email,
      (SELECT COUNT(*) FROM tiolas t WHERE t.user_id = u.id AND t.status = 'approved' AND t.parent_id IS NULL) AS tiolaCount,
      (SELECT COUNT(*) FROM blogs b WHERE b.user_id = u.id AND b.status = 'approved') AS blogCount,
      (SELECT COUNT(*) FROM tiola_likes tl JOIN tiolas t ON t.id = tl.tiola_id WHERE t.user_id = u.id) AS likeCount
    FROM users u
    WHERE u.role = 'member'
    ORDER BY (tiolaCount + blogCount + likeCount) DESC
    LIMIT 10
  `).all();
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    tiolaCount: r.tiolaCount,
    blogCount: r.blogCount,
    likeCount: r.likeCount,
    activityScore: r.tiolaCount + r.blogCount + r.likeCount,
  }));
}

module.exports = { dashboard, contentQuality, byCategory, timeseries, topPlaces, topUsers };

