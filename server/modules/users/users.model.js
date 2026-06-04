const { db } = require('../../db');

const { sanitizeUser } = require('../../auth');



function listAll() {

  return db.prepare('SELECT id, name, email, role, created_at, risk_score FROM users ORDER BY created_at DESC').all();

}



function updateRole(userId, role) {

  const allowed = ['member', 'editor', 'moderator', 'admin'];

  if (!allowed.includes(role)) return false;

  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId);

  return true;

}



function mapUser(row) {

  return sanitizeUser(row);

}



module.exports = { listAll, updateRole, mapUser };

