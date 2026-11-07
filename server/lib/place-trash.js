/**
 * Place trash helpers: soft-delete (deleted_at), restore, 15-day purge.
 */
const TRASH_RETENTION_DAYS = 15;

/**
 * places.created_at / updated_at are TEXT. COALESCE(text, NOW()) fails with
 * "COALESCE types text and timestamp with time zone cannot be matched".
 */
const SQL_TEXT_UTC_NOW = "to_char(timezone('utc', now()), 'YYYY-MM-DD HH24:MI:SS')";

/** Fill empty TEXT created_at without mixing TEXT + timestamptz in COALESCE. */
const SQL_TOUCH_CREATED_AT = `created_at = COALESCE(NULLIF(btrim(created_at), ''), ${SQL_TEXT_UTC_NOW})`;

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
  SQL_TEXT_UTC_NOW,
  SQL_TOUCH_CREATED_AT,
  notDeletedPlaceSql,
  normalizeIds,
};
