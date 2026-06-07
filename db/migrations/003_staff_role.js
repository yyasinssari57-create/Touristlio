/** Add staff role (İçerik Yöneticisi) with combined editor + moderator permissions. */
function up(db) {
  db.prepare('INSERT OR IGNORE INTO roles (slug, name) VALUES (?, ?)').run('staff', 'Content Manager');
  const perms = [
    'admin.dashboard', 'admin.moderate', 'admin.places', 'admin.cities',
    'admin.categories', 'admin.content',
  ];
  for (const p of perms) {
    db.prepare('INSERT OR IGNORE INTO role_permissions (role_slug, permission_slug) VALUES (?, ?)').run('staff', p);
  }
}

module.exports = { id: '003_staff_role', up };
