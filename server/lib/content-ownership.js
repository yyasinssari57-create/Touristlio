function canModifyOwnContent(user, ownerId) {
  if (!user || ownerId == null) return false;
  if (user.id === ownerId) return true;
  return ['admin', 'moderator', 'staff'].includes(user.role);
}

module.exports = { canModifyOwnContent };
