const usersModel = require('./users.model');
const { ASSIGNABLE_ROLES, isProtectedUserRole } = require('../../middleware/rbac');
const auditLog = require('../../lib/auditLog');

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

// Role değişikliği, en hassas RBAC işlemidir: aynı kurallar admin.js
// (PATCH /api/admin/users/:id/role) ile birebir uygulanır — kendi rolünü
// değiştirme yok, yalnızca ASSIGNABLE_ROLES (admin hariç) atanabilir,
// mevcut admin hesapları buradan değiştirilemez, her değişiklik audit log'a yazılır.
async function setUserRole(actor, userId, role) {
  if (userId === actor.id) {
    return { error: 'Kendi rolünüzü değiştiremezsiniz', status: 400 };
  }
  if (!ASSIGNABLE_ROLES.includes(role)) {
    return { error: 'Geçersiz rol (member, editor, moderator, staff)', status: 400 };
  }

  const target = await usersModel.findById(userId);
  if (!target) return { error: 'Kullanıcı bulunamadı', status: 404 };
  if (isProtectedUserRole(target.role)) {
    return { error: 'Yönetici hesapları üzerinde işlem yapılamaz', status: 403 };
  }

  const prevRole = target.role;
  await usersModel.updateRole(userId, role, ASSIGNABLE_ROLES);

  await auditLog.log({
    adminId: actor.id,
    adminName: actor.name,
    action: 'user.role_change',
    targetType: 'user',
    targetId: userId,
    detail: `${prevRole} → ${role}`,
  });

  return { id: userId, role, previousRole: prevRole };
}

module.exports = { listUsers, setUserRole };
