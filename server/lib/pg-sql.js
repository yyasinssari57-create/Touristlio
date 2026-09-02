/** Convert SQLite-style SQL (?, datetime, OR IGNORE/REPLACE, LIKE) to PostgreSQL. */

const CONFLICT_TARGETS = {
  visited_places: ['user_id', 'place_id'],
  travel_list_items: ['list_id', 'place_id'],
  saved_places: ['user_id', 'place_id'],
  role_permissions: ['role_slug', 'permission_slug'],
  site_settings: ['key'],
  tiola_likes: ['user_id', 'tiola_id'],
  blog_likes: ['user_id', 'blog_id'],
  place_live_data: ['place_id'],
  cities: ['country', 'slug'],
  places: ['id'],
  users: ['email'],
  permissions: ['slug'],
  roles: ['slug'],
  banned_words: ['word'],
};

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

/** Replace sqlite FUNC(inner) calls, including nested parentheses. */
function replaceFuncCalls(sql, funcName, replacer) {
  const re = new RegExp(`\\b${funcName}\\s*\\(`, 'gi');
  let s = sql;
  let searchFrom = 0;
  while (searchFrom < s.length) {
    re.lastIndex = searchFrom;
    const m = re.exec(s);
    if (!m) break;
    const start = m.index;
    const open = start + m[0].length - 1;
    let depth = 1;
    let quote = null;
    let j = open + 1;
    for (; j < s.length; j += 1) {
      const c = s[j];
      if (quote) {
        if (c === quote && s[j - 1] !== '\\') quote = null;
        continue;
      }
      if (c === "'" || c === '"') {
        quote = c;
        continue;
      }
      if (c === '(') depth += 1;
      else if (c === ')') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    if (depth !== 0) break;
    const replacement = replacer(s.slice(open + 1, j));
    s = s.slice(0, start) + replacement + s.slice(j + 1);
    searchFrom = start + replacement.length;
  }
  return s;
}

function convertDialect(sql) {
  let s = String(sql);
  const orIgnore = /\bINSERT\s+OR\s+IGNORE\s+INTO\b/i.test(s);
  const orReplace = /\bINSERT\s+OR\s+REPLACE\s+INTO\b/i.test(s);

  s = s.replace(/\bINSERT\s+OR\s+IGNORE\s+INTO\b/gi, 'INSERT INTO');
  s = s.replace(/\bINSERT\s+OR\s+REPLACE\s+INTO\b/gi, 'INSERT INTO');
  s = s.replace(
    /\bdatetime\s*\(\s*'now'\s*,\s*'start of month'\s*\)/gi,
    "to_char(date_trunc('month', timezone('utc', now())), 'YYYY-MM-DD HH24:MI:SS')",
  );
  s = s.replace(
    /\bdatetime\s*\(\s*'now'\s*,\s*'-(\d+)\s+minutes'\s*\)/gi,
    "to_char(timezone('utc', now()) - INTERVAL '$1 minutes', 'YYYY-MM-DD HH24:MI:SS')",
  );
  s = s.replace(
    /\bdatetime\s*\(\s*'now'\s*,\s*'-(\d+)\s+days'\s*\)/gi,
    "to_char(timezone('utc', now()) - INTERVAL '$1 days', 'YYYY-MM-DD HH24:MI:SS')",
  );
  s = s.replace(/\bdatetime\s*\(\s*'now'\s*\)/gi, "to_char(timezone('utc', now()), 'YYYY-MM-DD HH24:MI:SS')");
  s = s.replace(/\bIFNULL\s*\(/gi, 'COALESCE(');
  s = s.replace(/\bGLOB\b/gi, 'LIKE');
  s = s.replace(
    /\bdate\s*\(\s*'now'\s*,\s*'-'\s*\|\|\s*\?\s*\|\|\s*'\s*days'\s*\)/gi,
    "(CURRENT_DATE - CAST(? AS integer) * INTERVAL '1 day')::text",
  );
  s = s.replace(
    /\bdate\s*\(\s*'now'\s*,\s*'-(\d+)\s+days'\s*\)/gi,
    "((CURRENT_DATE - INTERVAL '$1 days')::text)",
  );
  s = s.replace(/\bdate\s*\(\s*'now'\s*\)/gi, 'CURRENT_DATE::text');
  s = s.replace(/\bdate\s*\(\s*\?\s*\)/gi, 'LEFT(?::text, 10)');
  s = s.replace(/\bdate\s*\(\s*([a-zA-Z_][\w.]*)\s*\)/gi, 'LEFT($1, 10)');
  s = s.replace(/\s+COLLATE\s+NOCASE/gi, '');
  s = s.replace(/\bdatetime\s*\(\s*([a-zA-Z_][\w.]*)\s*\)/gi, '$1');
  // leftover datetime(COALESCE(...)) / date(expr) that the identifier regex misses
  s = replaceFuncCalls(s, 'datetime', (inner) => `(${inner.trim()})`);
  s = replaceFuncCalls(s, 'date', (inner) => {
    const t = inner.trim();
    if (t === '?') return 'LEFT(?::text, 10)';
    if (/^[a-zA-Z_][\w.]*$/.test(t)) return `LEFT(${t}, 10)`;
    return `LEFT((${t}), 10)`;
  });
  s = s.replace(/\bNOT\s+LIKE\b/gi, 'NOT ILIKE');
  s = s.replace(/\bLIKE\b/gi, 'ILIKE');
  // pg lowercases unquoted aliases; keep camelCase names (skip ALL-CAPS types like INTEGER)
  s = s.replace(/\bAS\s+([a-zA-Z_][a-zA-Z0-9_]*[A-Z][a-zA-Z0-9_]*)\b/g, (full, name) => (
    name === name.toUpperCase() ? full : `AS "${name}"`
  ));

  if (orIgnore && !/\bON CONFLICT\b/i.test(s)) {
    s = s.replace(/;?\s*$/, ' ON CONFLICT DO NOTHING');
  }

  if (orReplace && !/\bON CONFLICT\b/i.test(s)) {
    const m = s.match(/INSERT INTO\s+([a-zA-Z_][\w.]*)\s*\(([^)]+)\)\s*VALUES/i);
    if (m) {
      const table = m[1];
      const cols = m[2].split(',').map((c) => c.trim().replace(/^"|"$/g, '')).filter(Boolean);
      const pk = CONFLICT_TARGETS[table] || [cols[0]];
      const pkSet = new Set(pk.map((c) => c.toLowerCase()));
      const rest = cols.filter((c) => !pkSet.has(c.toLowerCase()));
      const sets = rest.map((c) => `${c} = EXCLUDED.${c}`).join(', ');
      const conflict = sets
        ? ` ON CONFLICT (${pk.join(', ')}) DO UPDATE SET ${sets}`
        : ` ON CONFLICT (${pk.join(', ')}) DO NOTHING`;
      s = s.replace(/;?\s*$/, conflict);
    }
  }

  return s;
}

function bindParams(sql, params) {
  const raw = params.length === 1 && params[0] === undefined ? [] : params;

  if (raw.length === 1 && raw[0] && typeof raw[0] === 'object' && !Array.isArray(raw[0]) && !(raw[0] instanceof Date)) {
    const obj = raw[0];
    const values = [];
    const pgSql = sql.replace(/@([a-zA-Z_]\w*)/g, (_, name) => {
      values.push(obj[name] === undefined ? null : obj[name]);
      return `$${values.length}`;
    });
    return { text: pgSql, values };
  }

  let i = 0;
  const text = sql.replace(/\?/g, () => `$${++i}`);
  return { text, values: raw.map((v) => (v === undefined ? null : v)) };
}

function maybeReturning(sql) {
  if (!/^\s*INSERT\b/i.test(sql)) return sql;
  if (/\bRETURNING\b/i.test(sql)) return sql;
  return `${sql.replace(/;?\s*$/, '')} RETURNING *`;
}

/** Split SQL on semicolons that are not inside quotes or parentheses. */
function splitStatements(sql) {
  const text = String(sql);
  const parts = [];
  let buf = '';
  let depth = 0;
  let quote = null;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quote) {
      buf += c;
      if (c === quote && text[i - 1] !== '\\') quote = null;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      buf += c;
      continue;
    }
    if (c === '(') depth += 1;
    else if (c === ')') depth = Math.max(0, depth - 1);
    if (c === ';' && depth === 0) {
      const stmt = buf.trim();
      if (stmt) parts.push(stmt);
      buf = '';
      continue;
    }
    buf += c;
  }
  const last = buf.trim();
  if (last) parts.push(last);
  return parts;
}

module.exports = {
  quoteIdent,
  convertDialect,
  bindParams,
  maybeReturning,
  splitStatements,
  replaceFuncCalls,
  CONFLICT_TARGETS,
};
