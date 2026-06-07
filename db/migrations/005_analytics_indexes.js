/** Repair analytics indexes when 004 ensureIndex calls used wrong arguments. */

function up(db, { tableExists, columnExists }) {
  function ensureIndex(indexName, table, columns) {
    if (!tableExists(db, table)) return;
    const cols = Array.isArray(columns) ? columns : [columns];
    if (!cols.every((col) => columnExists(db, table, col))) return;
    db.exec(`CREATE INDEX IF NOT EXISTS ${indexName} ON ${table}(${cols.join(', ')})`);
  }

  ensureIndex('idx_analytics_sessions_last_seen', 'analytics_sessions', 'last_seen_at');
  ensureIndex('idx_analytics_sessions_started', 'analytics_sessions', 'started_at');
  ensureIndex('idx_analytics_events_created', 'analytics_events', 'created_at');
  ensureIndex('idx_analytics_events_session', 'analytics_events', 'session_id');
  ensureIndex('idx_analytics_events_tab', 'analytics_events', ['tab', 'created_at']);
}

module.exports = { id: '005_analytics_indexes', up };
