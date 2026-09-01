const { db } = require('../../db');



async function count(table, where = '') {

  const sql = where

    ? `SELECT COUNT(*) AS c FROM ${table} WHERE ${where}`

    : `SELECT COUNT(*) AS c FROM ${table}`;

  return (await db.prepare(sql).get()).c;

}



module.exports = { count, db };

