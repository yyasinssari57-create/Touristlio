/** Repair analytics indexes when 004 ensureIndex calls used wrong arguments. */

async function up(db, { tableExists, columnExists }) {
  async function ensureIndex(indexName, table, columns) {
    if (!(await tableExists(db, table))) return;
    const cols = Array.isArray(columns) ? columns : [columns];
    for (const col of cols) {
      if (!(await columnExists(db, table, col))) return;
    }
    await db.exec(`CREATE INDEX IF NOT EXISTS ${indexName} ON ${table}(${cols.join(', ')})`);
  }

  await ensureIndex('idx_analytics_sessions_last_seen', 'analytics_sessions', 'last_seen_at');
  await ensureIndex('idx_analytics_sessions_started', 'analytics_sessions', 'started_at');
  await ensureIndex('idx_analytics_events_created', 'analytics_events', 'created_at');
  await ensureIndex('idx_analytics_events_session', 'analytics_events', 'session_id');
  await ensureIndex('idx_analytics_events_tab', 'analytics_events', ['tab', 'created_at']);
}

module.exports = { id: '005_analytics_indexes', up };
