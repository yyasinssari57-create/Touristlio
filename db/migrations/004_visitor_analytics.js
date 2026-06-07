/** Visitor analytics: sessions, events, role permissions. */

function up(db, { tableExists, columnExists, addColumnIfMissing }) {
  function ensureIndex(indexName, table, columns) {
    if (!tableExists(db, table)) return;
    const cols = Array.isArray(columns) ? columns : [columns];
    if (!cols.every((col) => columnExists(db, table, col))) return;
    db.exec(`CREATE INDEX IF NOT EXISTS ${indexName} ON ${table}(${cols.join(', ')})`);
  }

  if (!tableExists(db, 'analytics_sessions')) {
    db.exec(`
      CREATE TABLE analytics_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        user_id INTEGER,
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
        ended_at TEXT,
        duration_sec INTEGER NOT NULL DEFAULT 0,
        page_views INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `);
  } else {
    addColumnIfMissing(db, 'analytics_sessions', 'session_id', 'TEXT');
    addColumnIfMissing(db, 'analytics_sessions', 'user_id', 'INTEGER');
    addColumnIfMissing(db, 'analytics_sessions', 'started_at', 'TEXT');
    addColumnIfMissing(db, 'analytics_sessions', 'last_seen_at', 'TEXT');
    addColumnIfMissing(db, 'analytics_sessions', 'ended_at', 'TEXT');
    addColumnIfMissing(db, 'analytics_sessions', 'duration_sec', 'INTEGER DEFAULT 0');
    addColumnIfMissing(db, 'analytics_sessions', 'page_views', 'INTEGER DEFAULT 0');
  }

  if (!tableExists(db, 'analytics_events')) {
    db.exec(`
      CREATE TABLE analytics_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        user_id INTEGER,
        event_type TEXT NOT NULL,
        tab TEXT,
        path TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `);
  } else {
    addColumnIfMissing(db, 'analytics_events', 'session_id', 'TEXT');
    addColumnIfMissing(db, 'analytics_events', 'user_id', 'INTEGER');
    addColumnIfMissing(db, 'analytics_events', 'event_type', 'TEXT');
    addColumnIfMissing(db, 'analytics_events', 'tab', 'TEXT');
    addColumnIfMissing(db, 'analytics_events', 'path', 'TEXT');
    addColumnIfMissing(db, 'analytics_events', 'created_at', 'TEXT');
  }

  if (columnExists(db, 'analytics_sessions', 'session_id')) {
    db.exec(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_analytics_sessions_session_id ON analytics_sessions(session_id)',
    );
  }

  ensureIndex('idx_analytics_sessions_last_seen', 'analytics_sessions', 'last_seen_at');
  ensureIndex('idx_analytics_sessions_started', 'analytics_sessions', 'started_at');
  ensureIndex('idx_analytics_events_created', 'analytics_events', 'created_at');
  ensureIndex('idx_analytics_events_session', 'analytics_events', 'session_id');
  ensureIndex('idx_analytics_events_tab', 'analytics_events', ['tab', 'created_at']);

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
