const { db } = require('../../db');



async function allRows() {

  return await db.prepare('SELECT key, value FROM site_settings').all();

}



async function upsert(key, value) {

  await db.prepare(`

    INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, NOW())

    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = NOW()

  `).run(key, String(value));

}



module.exports = { allRows, upsert };

