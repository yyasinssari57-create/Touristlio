const { db } = require('../../db');
const { findPlaceRow } = require('../../lib/place-lookup');

async function findAll() {
  return await db.prepare('SELECT * FROM places').all();
}

async function findById(id) {
  return await db.prepare('SELECT * FROM places WHERE id = ?').get(id);
}

async function findByIdOrSlug(idOrSlug) {
  return findPlaceRow(idOrSlug, db);
}

module.exports = { findAll, findById, findByIdOrSlug };
