/** Add password_changed_at for JWT invalidation after credential changes. */
async function up(db, { addColumnIfMissing }) {
  await addColumnIfMissing(db, 'users', 'password_changed_at', 'TEXT');
}

module.exports = { id: '001_password_changed_at', up };
