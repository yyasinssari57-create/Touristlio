/** Visitor analytics: sessions, events, role permissions. */

async function up(db, { tableExists, columnExists, addColumnIfMissing }) {
  async function ensureIndex(indexName, table, columns) {
    if (!(await tableExists(db, table))) return;
    const cols = Array.isArray(columns) ? columns : [columns];
    for (const col of cols) {
      if (!(await columnExists(db, table, col))) return;
    }
    await db.exec(`CREATE INDEX IF NOT EXISTS ${indexName} ON ${table}(${cols.join(', ')})`);
  }

  if (!(await tableExists(db, 'analytics_sessions'))) {
    await db.exec(`
      CREATE TABLE analytics_sessions (
        id SERIAL PRIMARY KEY,
        session_id TEXT NOT NULL,
        user_id INTEGER REFERENCES users(id),
        started_at TEXT NOT NULL DEFAULT (to_char(timezone('utc', now()), 'YYYY-MM-DD HH24:MI:SS')),
        last_seen_at TEXT NOT NULL DEFAULT (to_char(timezone('utc', now()), 'YYYY-MM-DD HH24:MI:SS')),
        ended_at TEXT,
        duration_sec INTEGER NOT NULL DEFAULT 0,
        page_views INTEGER NOT NULL DEFAULT 0
      )
    `);
  } else {
    await addColumnIfMissing(db, 'analytics_sessions', 'session_id', 'TEXT');
    await addColumnIfMissing(db, 'analytics_sessions', 'user_id', 'INTEGER');
    await addColumnIfMissing(db, 'analytics_sessions', 'started_at', 'TEXT');
    await addColumnIfMissing(db, 'analytics_sessions', 'last_seen_at', 'TEXT');
    await addColumnIfMissing(db, 'analytics_sessions', 'ended_at', 'TEXT');
    await addColumnIfMissing(db, 'analytics_sessions', 'duration_sec', 'INTEGER DEFAULT 0');
    await addColumnIfMissing(db, 'analytics_sessions', 'page_views', 'INTEGER DEFAULT 0');
  }

  if (!(await tableExists(db, 'analytics_events'))) {
    await db.exec(`
      CREATE TABLE analytics_events (
        id SERIAL PRIMARY KEY,
        session_id TEXT NOT NULL,
        user_id INTEGER REFERENCES users(id),
        event_type TEXT NOT NULL,
        tab TEXT,
        path TEXT,
        created_at TEXT NOT NULL DEFAULT (to_char(timezone('utc', now()), 'YYYY-MM-DD HH24:MI:SS'))
      )
    `);
  } else {
    await addColumnIfMissing(db, 'analytics_events', 'session_id', 'TEXT');
    await addColumnIfMissing(db, 'analytics_events', 'user_id', 'INTEGER');
    await addColumnIfMissing(db, 'analytics_events', 'event_type', 'TEXT');
    await addColumnIfMissing(db, 'analytics_events', 'tab', 'TEXT');
    await addColumnIfMissing(db, 'analytics_events', 'path', 'TEXT');
    await addColumnIfMissing(db, 'analytics_events', 'created_at', 'TEXT');
  }

  if (await columnExists(db, 'analytics_sessions', 'session_id')) {
    await db.exec(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_analytics_sessions_session_id ON analytics_sessions(session_id)',
    );
  }

  await ensureIndex('idx_analytics_sessions_last_seen', 'analytics_sessions', 'last_seen_at');
  await ensureIndex('idx_analytics_sessions_started', 'analytics_sessions', 'started_at');
  await ensureIndex('idx_analytics_events_created', 'analytics_events', 'created_at');
  await ensureIndex('idx_analytics_events_session', 'analytics_events', 'session_id');
  await ensureIndex('idx_analytics_events_tab', 'analytics_events', ['tab', 'created_at']);

  await db.prepare('INSERT OR IGNORE INTO permissions (slug, name) VALUES (?, ?)').run(
    'admin.analytics',
    'View analytics',
  );

  for (const role of ['admin', 'moderator', 'editor', 'staff']) {
    await db.prepare(
      'INSERT OR IGNORE INTO role_permissions (role_slug, permission_slug) VALUES (?, ?)',
    ).run(role, 'admin.analytics');
  }
}

module.exports = { id: '004_visitor_analytics', up };
