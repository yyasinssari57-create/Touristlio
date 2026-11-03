/** Public place is status published. Empty status stays published. Draft and archived are off the site. */

function isPublishedPlaceStatus(status) {
  const s = String(status == null || status === '' ? 'published' : status).trim().toLowerCase();
  return s === 'published';
}

function publishedPlaceSql(column = 'status') {
  const col = String(column || 'status');
  if (!/^[A-Za-z_][A-Za-z0-9_.]*$/.test(col)) {
    throw new Error('Geçersiz durum sütunu');
  }
  return `COALESCE(NULLIF(TRIM(${col}), ''), 'published') = 'published'`;
}

module.exports = {
  isPublishedPlaceStatus,
  publishedPlaceSql,
};
