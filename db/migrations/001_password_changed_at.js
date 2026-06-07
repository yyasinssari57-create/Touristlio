/** Add password_changed_at for JWT invalidation after credential changes. */
function up(db, { columnExists, addColumnIfMissing }) {
  addColumnIfMissing(db, 'users', 'password_changed_at', 'TEXT');
}

module.exports = { id: '001_password_changed_at', up };
