/**
 * Place trash helpers: soft-delete (deleted_at), restore, 15-day purge.
 */
const TRASH_RETENTION_DAYS = 15;

/** SQL fragment: row is not in the trash. */
function notDeletedPlaceSql(column = 'deleted_at') {
  const col = String(column || 'deleted_at');
  if (!/^[A-Za-z_][A-Za-z0-9_.]*$/.test(col)) {
    throw new Error('Geçersiz deleted_at sütunu');
  }
  return `${col} IS NULL`;
}

function normalizeIds(ids) {
  return [...new Set((ids || [])
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id) && id > 0))];
}

module.exports = {
  TRASH_RETENTION_DAYS,
  notDeletedPlaceSql,
  normalizeIds,
};
