const { db } = require('../db');
const { normalizeSearch } = require('./search-normalize');
const { DISCOVER_GROUPS, FILTER_GROUPS } = require('./place-content');

function buildFtsQuery(q) {
  const qNorm = normalizeSearch(q);
  if (!qNorm) return null;
  const words = qNorm.split(' ').filter((w) => w.length >= 2);
  if (!words.length) return null;
  return words.map((w) => `"${w.replace(/"/g, '')}"*`).join(' AND ');
}

function likeNeedle(value) {
  return String(value || '').toLowerCase().replace(/[%_]/g, '');
}

function categoryTagLike(slug) {
  return `%"${String(slug).replace(/"/g, '')}"%`;
}

function pushCategorySlugs(where, params, slugs) {
  const list = [...new Set((slugs || []).map((s) => String(s).toLowerCase()).filter(Boolean))];
  if (!list.length) return;
  const parts = list.map(() => '(p.category = ? OR (p.categories IS NOT NULL AND p.categories LIKE ?))');
  where.push(`(${parts.join(' OR ')})`);
  for (const slug of list) {
    params.push(slug, categoryTagLike(slug));
  }
}

/**
 * WHERE for indexed place filters (country/city/category/status/score).
 * categoryMode: 'discover' (GET /api/places) | 'exact' (GET /api/search).
 */
function buildPlacesWhere(filters = {}) {
  const {
    q, country, city, category, group, district, localOnly, entry,
    minScore, minTiola, score, categoryMode,
  } = filters;
  const where = [];
  const params = [];
  const ftsQuery = q ? buildFtsQuery(q) : null;
  if (ftsQuery) {
    where.push('p.id IN (SELECT rowid FROM places_fts WHERE places_fts MATCH ?)');
    params.push(ftsQuery);
  }

  if (country) {
    const countryNeedle = likeNeedle(country).replace(/\s[\u{1F1E0}-\u{1F1FF}]{2}/gu, '').trim();
    if (countryNeedle) {
      const countryParts = ['LOWER(p.country) LIKE ?', 'LOWER(p.country) LIKE ?'];
      params.push(`${countryNeedle}%`, `%${countryNeedle}%`);
      if (countryNeedle === 'turkey') {
        countryParts.push('LOWER(p.country) LIKE ?', 'LOWER(p.country) LIKE ?');
        params.push('türkiye%', '%türkiye%');
      }
      where.push(`(${countryParts.join(' OR ')})`);
    }
  }

  if (city) {
    const cityNeedle = likeNeedle(city);
    if (cityNeedle) {
      where.push('(LOWER(p.city) LIKE ? OR LOWER(p.city) LIKE ?)');
      params.push(`${cityNeedle}%`, `%${cityNeedle}%`);
    }
  }

  if (group && group !== 'all') {
    const allowed = FILTER_GROUPS[group] || [group];
    pushCategorySlugs(where, params, [...allowed, group]);
  } else if (category && category !== 'all') {
    const cat = String(category).toLowerCase();
    if (categoryMode === 'discover') {
      const allowed = DISCOVER_GROUPS[cat] || [cat];
      pushCategorySlugs(where, params, allowed);
    } else {
      pushCategorySlugs(where, params, [cat]);
    }
  }

  if (district) {
    where.push('p.district = ?');
    params.push(String(district));
  }
  if (localOnly === '1' || localOnly === 1) {
    where.push('p.is_local = 1');
  }
  if (entry === 'free') {
    where.push("p.entry_fee IS NOT NULL AND p.entry_fee LIKE '%Ücretsiz%'");
  } else if (entry === 'paid') {
    where.push("p.entry_fee IS NOT NULL AND p.entry_fee NOT LIKE '%Ücretsiz%'");
  }

  const min = Number(minScore || minTiola || score);
  if (Number.isFinite(min) && min > 0) {
    where.push('p.tiola_rating IS NOT NULL AND p.tiola_rating >= ?');
    params.push(min);
  }

  return {
    whereSql: where.length ? ` WHERE ${where.join(' AND ')}` : '',
    params,
    qNorm: q ? normalizeSearch(q) : '',
    ftsQuery,
  };
}

function orderBySql(sort) {
  if (sort === 'reviewed') return ' ORDER BY COALESCE(p.tiola_count, 0) DESC, p.id DESC';
  if (sort === 'local') return ' ORDER BY p.is_local DESC, p.id DESC';
  if (sort === 'az') return ' ORDER BY p.name COLLATE NOCASE ASC, p.id ASC';
  if (sort === 'popularity') return ' ORDER BY COALESCE(p.popularity, 0) DESC, p.id DESC';
  return ' ORDER BY COALESCE(p.tiola_rating, 0) DESC, p.id DESC';
}

function runSelect(sql, params) {
  return db.prepare(sql).all(...params);
}

function runCount(sql, params) {
  return db.prepare(sql).get(...params).c;
}

/**
 * Indexed place query with SQL COUNT + LIMIT/OFFSET (ORTA-5 leftover from in-memory slice).
 */
function searchPlacesPage(filters = {}) {
  const built = buildPlacesWhere(filters);
  const order = filters.orderSql || orderBySql(filters.sort);
  const limit = filters.limit != null ? Number(filters.limit) : null;
  const offset = Math.max(0, Number(filters.offset) || 0);
  const hasLimit = limit != null && Number.isFinite(limit) && limit >= 0;

  const tryRun = (whereSql, params, qNorm, extra = {}) => {
    const total = runCount(`SELECT COUNT(*) AS c FROM places p${whereSql}`, params);
    const selectParams = [...params];
    let sql = `SELECT p.* FROM places p${whereSql}${order}`;
    if (hasLimit) {
      sql += ' LIMIT ? OFFSET ?';
      selectParams.push(limit, offset);
    }
    const rows = runSelect(sql, selectParams);
    return { rows, total, qNorm, ...extra };
  };

  try {
    return tryRun(built.whereSql, built.params, built.qNorm);
  } catch {
    if (built.ftsQuery) {
      const withoutFts = buildPlacesWhere({ ...filters, q: undefined });
      try {
        const total = runCount(`SELECT COUNT(*) AS c FROM places p${withoutFts.whereSql}`, withoutFts.params);
        const rows = runSelect(
          `SELECT p.* FROM places p${withoutFts.whereSql}${order}`,
          withoutFts.params,
        );
        return {
          rows,
          total,
          qNorm: built.qNorm,
          inMemoryFallback: true,
        };
      } catch {
        return {
          rows: runSelect('SELECT * FROM places', []),
          total: runCount('SELECT COUNT(*) AS c FROM places', []),
          qNorm: built.qNorm,
          inMemoryFallback: true,
        };
      }
    }
    return {
      rows: runSelect('SELECT * FROM places', []),
      total: runCount('SELECT COUNT(*) AS c FROM places', []),
      qNorm: built.qNorm,
      inMemoryFallback: true,
    };
  }
}

/**
 * FTS5-backed place row fetch with optional country/city/category SQL filters.
 * Pass limit/offset for SQL pagination; omit them to load the full match set.
 */
function searchPlacesRows(filters = {}) {
  const { rows } = searchPlacesPage(filters);
  return rows;
}

module.exports = {
  buildFtsQuery,
  buildPlacesWhere,
  orderBySql,
  searchPlacesPage,
  searchPlacesRows,
};
