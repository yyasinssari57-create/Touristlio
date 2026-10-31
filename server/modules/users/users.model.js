const { db } = require('../../db');

const { sanitizeUser } = require('../../auth');



async function listAll() {

  return await db.prepare('SELECT id, name, email, role, created_at, risk_score FROM users ORDER BY created_at DESC').all();

}

async function findById(userId) {
  return await db.prepare('SELECT id, name, email, role, created_at, risk_score FROM users WHERE id = ?').get(userId);
}

async function updateRole(userId, role, allowedRoles) {

  if (!allowedRoles.includes(role)) return false;

  await db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId);

  return true;

}



async function mapUser(row) {
  return await sanitizeUser(row);
}



module.exports = { listAll, findById, updateRole, mapUser };

