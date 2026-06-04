const { db } = require('../../db');

function findAll() {
  return db.prepare('SELECT * FROM places').all();
}

function findById(id) {
  return db.prepare('SELECT * FROM places WHERE id = ?').get(id);
}

module.exports = { findAll, findById };
