const { db } = require('../../db');
const { findPlaceRow } = require('../../lib/place-lookup');

function findAll() {
  return db.prepare('SELECT * FROM places').all();
}

function findById(id) {
  return db.prepare('SELECT * FROM places WHERE id = ?').get(id);
}

function findByIdOrSlug(idOrSlug) {
  return findPlaceRow(idOrSlug, db);
}

module.exports = { findAll, findById, findByIdOrSlug };
