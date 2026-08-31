/**
 * [ORTA-3] Public list pagination: ?page=1&limit=20
 * offset is accepted for backward compatibility when page is omitted.
 */

const DEFAULT_LIMIT = 20;
const DEFAULT_MAX_LIMIT = 500;

function toPositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

function parseListPagination(query, { defaultLimit = DEFAULT_LIMIT, maxLimit = DEFAULT_MAX_LIMIT } = {}) {
  const q = query || {};
  const limit = Math.min(Math.max(toPositiveInt(q.limit, defaultLimit), 1), maxLimit);

  const pageRaw = q.page;
  const offsetRaw = q.offset;
  const hasPage = pageRaw != null && String(pageRaw).trim() !== '';
  const hasOffset = offsetRaw != null && String(offsetRaw).trim() !== '';

  let page;
  let offset;
  if (hasPage) {
    page = Math.max(toPositiveInt(pageRaw, 1), 1);
    offset = (page - 1) * limit;
  } else if (hasOffset) {
    offset = Math.max(toPositiveInt(offsetRaw, 0), 0);
    page = Math.floor(offset / limit) + 1;
  } else {
    page = 1;
    offset = 0;
  }

  return { page, limit, offset };
}

function paginationMeta({ total, page, limit, offset, count }) {
  const safeTotal = Math.max(0, Number(total) || 0);
  const safeLimit = Math.max(1, Number(limit) || DEFAULT_LIMIT);
  const safePage = Math.max(1, Number(page) || 1);
  const safeOffset = Math.max(0, Number(offset) || 0);
  const safeCount = Math.max(0, Number(count) || 0);
  const totalPages = Math.max(1, Math.ceil(safeTotal / safeLimit) || 1);
  return {
    total: safeTotal,
    page: safePage,
    limit: safeLimit,
    offset: safeOffset,
    count: safeCount,
    totalPages,
    hasMore: safeOffset + safeCount < safeTotal,
  };
}

function paginateItems(items, query, opts) {
  const parsed = parseListPagination(query, opts);
  const list = Array.isArray(items) ? items : [];
  const slice = list.slice(parsed.offset, parsed.offset + parsed.limit);
  return {
    items: slice,
    ...paginationMeta({
      total: list.length,
      page: parsed.page,
      limit: parsed.limit,
      offset: parsed.offset,
      count: slice.length,
    }),
  };
}

module.exports = {
  DEFAULT_LIMIT,
  DEFAULT_MAX_LIMIT,
  parseListPagination,
  paginationMeta,
  paginateItems,
};
