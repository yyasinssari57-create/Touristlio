/**
 * V5 Adım 11 — single place-indexability gate.
 *
 * A place page stays open to visitors. Google only sees it when:
 * published + valid coords + enough Turkish blurb + imageVerified=true.
 * English pages also need a complete EN translation (V4 Adım 8).
 */

const { isPublishedPlaceStatus } = require('./place-status');
const { isImageVerifiedFlag } = require('./place-image');

/** FAZ3-5 / sitemap: Turkish blurb must be longer than this many chars. */
const PLACE_DESCRIPTION_MIN_CHARS = 50;

/** Longer of the Turkish blurbs. English columns do not count. */
function turkishPlaceBlurbLength(row) {
  const overview = String(row?.overview ?? '').trim().length;
  const description = String(row?.description ?? '').trim().length;
  return Math.max(overview, description);
}

function isQualityPlaceDescription(row) {
  return turkishPlaceBlurbLength(row) > PLACE_DESCRIPTION_MIN_CHARS;
}

/** lat/lng present, finite, in range, and not 0. (0,0 is Null Island.) */
function isValidPlaceCoord(lat, lng) {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return false;
  if (la === 0 || ln === 0) return false;
  if (Math.abs(la) > 90 || Math.abs(ln) > 180) return false;
  return true;
}

function placeImageVerified(row) {
  if (!row) return false;
  return isImageVerifiedFlag(row.image_verified ?? row.imageVerified);
}

/**
 * Lang-independent quality bar for sitemap + robots.
 * Visitor pages stay up even when this is false.
 */
function meetsIndexablePlaceBase(row) {
  if (!row) return false;
  if (!isPublishedPlaceStatus(row.status)) return false;
  if (!isValidPlaceCoord(row.lat, row.lng)) return false;
  if (!isQualityPlaceDescription(row)) return false;
  if (!placeImageVerified(row)) return false;
  return true;
}

module.exports = {
  PLACE_DESCRIPTION_MIN_CHARS,
  turkishPlaceBlurbLength,
  isQualityPlaceDescription,
  isValidPlaceCoord,
  placeImageVerified,
  meetsIndexablePlaceBase,
};
