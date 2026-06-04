const { db } = require('../../db');



function count(table, where = '') {

  const sql = where

    ? `SELECT COUNT(*) AS c FROM ${table} WHERE ${where}`

    : `SELECT COUNT(*) AS c FROM ${table}`;

  return db.prepare(sql).get().c;

}



module.exports = { count, db };

