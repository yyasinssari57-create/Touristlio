const logger = require('./logger');
const { db } = require('../db');
const {
  seedPlaces,
  seedAdmin,
  syncLegacyAdminPassword,
  seedDemoBlogs,
} = require('../seed');

const MIN_PLACES = 10;
let seedPromise = null;

function getPlacesCount() {
  return db.prepare('SELECT COUNT(*) AS c FROM places').get().c;
}

function shouldSeedOnStart(count) {
  if (count >= MIN_PLACES) return false;
  if (count === 0) return true;
  if (process.env.SEED_ON_START === 'false') return false;
  if (process.env.SEED_ON_START === 'true') return true;
  return process.env.NODE_ENV === 'production';
}

function ensureAdminUser() {
  seedAdmin();
  syncLegacyAdminPassword(process.env.ADMIN_PASSWORD || 'ChangeMe123!');
}

function runStartupSeed() {
  const before = getPlacesCount();
  logger.info({ msg: 'Startup seed running', placesBefore: before });

  seedPlaces({ fatal: false });
  ensureAdminUser();
  seedDemoBlogs();

  const after = getPlacesCount();
  logger.info({ msg: 'Startup seed complete', placesBefore: before, placesAfter: after });
  return { before, after };
}

/**
 * On boot: always ensure admin; seed places/blogs when count < MIN_PLACES.
 * Non-blocking — safe to call from app.listen without awaiting.
 */
function maybeSeedOnStartup() {
  try {
    ensureAdminUser();
  } catch (err) {
    logger.error({ msg: 'Startup admin ensure failed', err: err.message });
  }

  const count = getPlacesCount();
  if (!shouldSeedOnStart(count)) {
    logger.info({ msg: 'Startup seed skipped', placesCount: count });
    return null;
  }

  if (seedPromise) return seedPromise;

  logger.info({ msg: 'Startup seed scheduled', placesCount: count, minPlaces: MIN_PLACES });

  seedPromise = Promise.resolve()
    .then(() => runStartupSeed())
    .catch((err) => {
      logger.error({ msg: 'Startup seed failed', err: err.message, stack: err.stack });
      seedPromise = null;
      throw err;
    });

  return seedPromise;
}

module.exports = { maybeSeedOnStartup, getPlacesCount, shouldSeedOnStart };
