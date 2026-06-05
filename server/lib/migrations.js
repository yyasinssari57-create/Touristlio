const logger = require('./logger');

const PLACE_COLUMNS = [
  'description_en', 'history_en', 'tips_en', 'entry_fee_en', 'best_time_en',
  'overview', 'overview_en', 'things_to_do', 'things_to_do_en',
  'culture_food', 'culture_food_en', 'travel_tips', 'travel_tips_en',
  'how_to_get_there', 'how_to_get_there_en', 'photos',
  'categories', 'lat', 'lng', 'popularity',
  'faq_tr', 'faq_en', 'affiliate_hotel_url', 'affiliate_booking_url', 'timezone',
];

const USER_COLUMNS = [
  ['email_verified', 'INTEGER DEFAULT 0'],
  ['failed_login_count', 'INTEGER DEFAULT 0'],
  ['locked_until', 'TEXT'],
  ['verification_token', 'TEXT'],
  ['risk_score', 'INTEGER DEFAULT 0'],
];

function columnExists(db, table, col) {
  try {
    db.prepare(`SELECT ${col} FROM ${table} LIMIT 1`).get();
    return true;
  } catch {
    return false;
  }
}

function addColumnIfMissing(db, table, col, type) {
  if (columnExists(db, table, col)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
  logger.info({ msg: 'Migration: column added', table, col });
}

function runMigrations(db) {
  if (!columnExists(db, 'places', 'search_aliases')) {
    db.exec('ALTER TABLE places ADD COLUMN search_aliases TEXT');
    logger.info({ msg: 'Migration: places.search_aliases' });
  }

  for (const col of PLACE_COLUMNS) {
    const type = ['lat', 'lng', 'popularity'].includes(col) ? 'REAL' : 'TEXT';
    addColumnIfMissing(db, 'places', col, type);
  }

  for (const [col, def] of USER_COLUMNS) {
    addColumnIfMissing(db, 'users', col, def);
  }

  addColumnIfMissing(db, 'travel_lists', 'share_token', 'TEXT');
}

module.exports = { runMigrations };
