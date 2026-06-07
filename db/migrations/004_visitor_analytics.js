/** Visitor analytics: sessions, events, role permissions. */
function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS analytics_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL UNIQUE,
      user_id INTEGER,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      ended_at TEXT,
      duration_sec INTEGER NOT NULL DEFAULT 0,
      page_views INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS analytics_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      user_id INTEGER,
      event_type TEXT NOT NULL,
      tab TEXT,
      path TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_analytics_sessions_last_seen
      ON analytics_sessions(last_seen_at);
    CREATE INDEX IF NOT EXISTS idx_analytics_sessions_started
      ON analytics_sessions(started_at);
    CREATE INDEX IF NOT EXISTS idx_analytics_events_created
      ON analytics_events(created_at);
    CREATE INDEX IF NOT EXISTS idx_analytics_events_session
      ON analytics_events(session_id);
    CREATE INDEX IF NOT EXISTS idx_analytics_events_tab
      ON analytics_events(tab, created_at);
  `);

  db.prepare('INSERT OR IGNORE INTO permissions (slug, name) VALUES (?, ?)').run(
    'admin.analytics',
    'View analytics',
  );

  for (const role of ['admin', 'moderator', 'editor', 'staff']) {
    db.prepare(
      'INSERT OR IGNORE INTO role_permissions (role_slug, permission_slug) VALUES (?, ?)',
    ).run(role, 'admin.analytics');
  }
}

module.exports = { id: '004_visitor_analytics', up };
