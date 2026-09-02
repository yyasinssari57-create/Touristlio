const usersModel = require('./users.model');

async function listUsers() {
  const rows = await usersModel.listAll();
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role,
    createdAt: r.created_at,
    riskScore: r.risk_score || 0,
  }));
}

async function setUserRole(userId, role) {
  if (!await usersModel.updateRole(userId, role)) {
    return { error: 'Geçersiz rol', status: 400 };
  }
  return { ok: true };
}

module.exports = { listUsers, setUserRole };
