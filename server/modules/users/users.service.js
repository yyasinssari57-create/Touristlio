const usersModel = require('./users.model');



function listUsers() {

  return usersModel.listAll().map((r) => ({

    id: r.id,

    name: r.name,

    email: r.email,

    role: r.role,

    createdAt: r.created_at,

    riskScore: r.risk_score || 0,

  }));

}



function setUserRole(userId, role) {

  if (!usersModel.updateRole(userId, role)) {

    return { error: 'Geçersiz rol', status: 400 };

  }

  return { ok: true };

}



module.exports = { listUsers, setUserRole };

