const { db } = require('../../db');



function allRows() {

  return db.prepare('SELECT key, value FROM site_settings').all();

}



function upsert(key, value) {

  db.prepare(`

    INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))

    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')

  `).run(key, String(value));

}



module.exports = { allRows, upsert };

