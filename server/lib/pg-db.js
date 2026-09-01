const { AsyncLocalStorage } = require('async_hooks');
const { Pool, types } = require('pg');
const { convertDialect, bindParams, maybeReturning, splitStatements } = require('./pg-sql');

types.setTypeParser(20, (val) => parseInt(val, 10)); // int8 / COUNT(*)
types.setTypeParser(1700, (val) => parseFloat(val)); // numeric

const als = new AsyncLocalStorage();
let pool = null;

function wrapPgError(err) {
  if (!err) return err;
  if (err.code === '23505') {
    const wrapped = new Error(`UNIQUE constraint failed: ${err.detail || err.message}`);
    wrapped.code = 'SQLITE_CONSTRAINT_UNIQUE';
    wrapped.pgCode = '23505';
    wrapped.cause = err;
    return wrapped;
  }
  if (err.code === '23503') {
    const wrapped = new Error(`FOREIGN KEY constraint failed: ${err.detail || err.message}`);
    wrapped.code = 'SQLITE_CONSTRAINT_FOREIGNKEY';
    wrapped.pgCode = '23503';
    wrapped.cause = err;
    return wrapped;
  }
  return err;
}

function getRunner() {
  const store = als.getStore();
  if (store && store.client) return store.client;
  if (!pool) throw new Error('Database not initialized — call initDb() first');
  return pool;
}

function createPool(connectionString) {
  const url = String(connectionString || '').trim();
  if (!url) {
    throw new Error('DATABASE_URL is required (postgresql://...)');
  }
  const needsSsl = /supabase\.(co|com)|sslmode=require/i.test(url) || process.env.PGSSL === 'true';
  pool = new Pool({
    connectionString: url,
    max: Number(process.env.PG_POOL_MAX || 10),
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  });
  return pool;
}

class Statement {
  constructor(sql) {
    this._sql = convertDialect(sql);
  }

  async get(...params) {
    const { text, values } = bindParams(this._sql, params);
    try {
      const r = await getRunner().query(text, values);
      return r.rows[0];
    } catch (err) {
      throw wrapPgError(err);
    }
  }

  async all(...params) {
    const { text, values } = bindParams(this._sql, params);
    try {
      const r = await getRunner().query(text, values);
      return r.rows;
    } catch (err) {
      throw wrapPgError(err);
    }
  }

  async run(...params) {
    let sql = this._sql;
    const isInsert = /^\s*INSERT\b/i.test(sql);
    if (isInsert) sql = maybeReturning(sql);
    const { text, values } = bindParams(sql, params);
    try {
      const r = await getRunner().query(text, values);
      const row = r.rows[0] || {};
      return {
        changes: r.rowCount || 0,
        lastInsertRowid: row.id != null ? Number(row.id) : undefined,
      };
    } catch (err) {
      throw wrapPgError(err);
    }
  }
}

const db = {
  prepare(sql) {
    return new Statement(sql);
  },

  async exec(sql) {
    const text = convertDialect(sql);
    const runner = getRunner();
    const parts = splitStatements(text);
    try {
      for (const part of parts) {
        await runner.query(part);
      }
    } catch (err) {
      throw wrapPgError(err);
    }
  },

  transaction(fn) {
    return async (...args) => {
      if (!pool) throw new Error('Database not initialized — call initDb() first');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await als.run({ client }, () => fn(...args));
        await client.query('COMMIT');
        return result;
      } catch (err) {
        try { await client.query('ROLLBACK'); } catch { /* ignore */ }
        throw wrapPgError(err);
      } finally {
        client.release();
      }
    };
  },

  async close() {
    await closePool();
  },
};

async function query(text, values) {
  try {
    return await getRunner().query(text, values);
  } catch (err) {
    throw wrapPgError(err);
  }
}

async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

function getPool() {
  return pool;
}

module.exports = { createPool, db, query, closePool, getPool, Statement };
