const { sanitizeText } = require('./sanitize');

function parsePagination(query, defaultLimit = 20) {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || defaultLimit, 1), 100);
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

function buildTiolaListFilters(query, { approvedOnly = false, pendingOnly = false } = {}) {
  const params = [];
  let where = 'WHERE t.parent_id IS NULL';

  if (approvedOnly) {
    where += " AND t.status = 'approved'";
  } else if (pendingOnly) {
    where += " AND t.status IN ('pending', 'spam')";
  }

  const q = sanitizeText(query.q, 80);
  if (q) {
    where += ' AND (t.text LIKE ? OR u.name LIKE ? OR p.name LIKE ? OR t.city_tag LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }

  const placeId = Number(query.placeId);
  if (Number.isFinite(placeId) && placeId > 0) {
    where += ' AND t.place_id = ?';
    params.push(placeId);
  }

  const status = sanitizeText(query.status, 20);
  if (status && status !== 'all') {
    where += ' AND t.status = ?';
    params.push(status);
  }

  const from = sanitizeText(query.from, 30);
  if (from) {
    where += ' AND date(t.created_at) >= date(?)';
    params.push(from);
  }

  const to = sanitizeText(query.to, 30);
  if (to) {
    where += ' AND date(t.created_at) <= date(?)';
    params.push(to);
  }

  return { where, params };
}

function buildBlogListFilters(query, { approvedOnly = false, pendingOnly = false } = {}) {
  const params = [];
  let where = 'WHERE 1=1';

  if (approvedOnly) {
    where += " AND b.status = 'approved'";
  } else if (pendingOnly) {
    where += " AND b.status IN ('pending', 'spam')";
  }

  const q = sanitizeText(query.q, 80);
  if (q) {
    where += ' AND (b.title LIKE ? OR b.excerpt LIKE ? OR b.body LIKE ? OR u.name LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }

  const placeId = Number(query.placeId);
  if (Number.isFinite(placeId) && placeId > 0) {
    where += ' AND b.place_id = ?';
    params.push(placeId);
  }

  const status = sanitizeText(query.status, 20);
  if (status && status !== 'all') {
    where += ' AND b.status = ?';
    params.push(status);
  }

  const from = sanitizeText(query.from, 30);
  if (from) {
    where += ' AND date(b.created_at) >= date(?)';
    params.push(from);
  }

  const to = sanitizeText(query.to, 30);
  if (to) {
    where += ' AND date(b.created_at) <= date(?)';
    params.push(to);
  }

  return { where, params };
}

module.exports = {
  parsePagination,
  buildTiolaListFilters,
  buildBlogListFilters,
};
