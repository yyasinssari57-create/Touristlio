/** FTS5 full-text index for places search. */
function up(db) {
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS places_fts USING fts5(
      name,
      location,
      country,
      city,
      district,
      search_aliases,
      content='places',
      content_rowid='id',
      tokenize='unicode61 remove_diacritics 2'
    );
  `);

  const ftsCount = db.prepare('SELECT COUNT(*) AS c FROM places_fts').get().c;
  const placeCount = db.prepare('SELECT COUNT(*) AS c FROM places').get().c;
  if (placeCount > 0 && ftsCount === 0) {
    db.exec(`INSERT INTO places_fts(places_fts) VALUES('rebuild')`);
  }

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS places_fts_ai AFTER INSERT ON places BEGIN
      INSERT INTO places_fts(rowid, name, location, country, city, district, search_aliases)
      VALUES (new.id, new.name, new.location, new.country, new.city, new.district, new.search_aliases);
    END;

    CREATE TRIGGER IF NOT EXISTS places_fts_ad AFTER DELETE ON places BEGIN
      INSERT INTO places_fts(places_fts, rowid, name, location, country, city, district, search_aliases)
      VALUES('delete', old.id, old.name, old.location, old.country, old.city, old.district, old.search_aliases);
    END;

    CREATE TRIGGER IF NOT EXISTS places_fts_au AFTER UPDATE ON places BEGIN
      INSERT INTO places_fts(places_fts, rowid, name, location, country, city, district, search_aliases)
      VALUES('delete', old.id, old.name, old.location, old.country, old.city, old.district, old.search_aliases);
      INSERT INTO places_fts(rowid, name, location, country, city, district, search_aliases)
      VALUES (new.id, new.name, new.location, new.country, new.city, new.district, new.search_aliases);
    END;
  `);
}

module.exports = { id: '002_places_fts', up };
