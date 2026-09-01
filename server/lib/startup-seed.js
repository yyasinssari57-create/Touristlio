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

async function getPlacesCount() {
  const row = await db.prepare('SELECT COUNT(*) AS c FROM places').get();
  return row?.c || 0;
}

function shouldSeedOnStart(count) {
  if (count >= MIN_PLACES) return false;
  if (count === 0) return true;
  if (process.env.SEED_ON_START === 'false') return false;
  if (process.env.SEED_ON_START === 'true') return true;
  return process.env.NODE_ENV === 'production';
}

async function ensureAdminUser() {
  await seedAdmin();
  await syncLegacyAdminPassword(process.env.ADMIN_PASSWORD || 'ChangeMe123!');
}

async function runStartupSeed() {
  const before = await getPlacesCount();
  logger.info({ msg: 'Startup seed running', placesBefore: before });

  await seedPlaces({ fatal: false });
  await ensureAdminUser();
  await seedDemoBlogs();

  const after = await getPlacesCount();
  logger.info({ msg: 'Startup seed complete', placesBefore: before, placesAfter: after });
  return { before, after };
}

/**
 * On boot: always ensure admin; seed places/blogs when count < MIN_PLACES.
 */
async function maybeSeedOnStartup() {
  try {
    await ensureAdminUser();
  } catch (err) {
    logger.error({ msg: 'Startup admin ensure failed', err: err.message });
  }

  const count = await getPlacesCount();
  if (!shouldSeedOnStart(count)) {
    logger.info({ msg: 'Startup seed skipped', placesCount: count });
    return null;
  }

  if (seedPromise) return seedPromise;

  logger.info({ msg: 'Startup seed scheduled', placesCount: count, minPlaces: MIN_PLACES });

  seedPromise = runStartupSeed().catch((err) => {
    logger.error({ msg: 'Startup seed failed', err: err.message, stack: err.stack });
    seedPromise = null;
    throw err;
  });

  return seedPromise;
}

module.exports = { maybeSeedOnStartup, getPlacesCount, shouldSeedOnStart };
