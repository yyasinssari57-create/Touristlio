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

    issues: { noPhoto, noFaq, noCoords, shortDesc },

    score: Math.round(100 - ((noPhoto + noFaq + noCoords + shortDesc) / Math.max(total, 1)) * 25),

  };

}



function byCategory() {

  const rows = db.prepare(`

    SELECT category, COUNT(*) AS c FROM places GROUP BY category ORDER BY c DESC LIMIT 20

  `).all();

  return rows;

}



module.exports = { dashboard, contentQuality, byCategory };

