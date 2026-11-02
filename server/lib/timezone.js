const tzlookup = require('tz-lookup');

/** Unknown city/country backfill pin. Not a real place. */
function isUnresolvedSentinel(lat, lng) {
  return Number(lat) === 20 && Number(lng) === 0;
}

function isValidIana(zone) {
  const z = String(zone || '').trim();
  if (!z) return '';
  try {
    Intl.DateTimeFormat('en-US', { timeZone: z });
    return z;
  } catch {
    return '';
  }
}

/** IANA zone for a real coordinate. Ocean and the [20,0] sentinel return ''. */
function timezoneFromCoords(lat, lng) {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return '';
  if (Math.abs(la) > 90 || Math.abs(ln) > 180) return '';
  if (isUnresolvedSentinel(la, ln)) return '';
  try {
    return isValidIana(tzlookup(la, ln));
  } catch {
    return '';
  }
}

/**
 * Clock zone: Open-Meteo timezone, then the stored place zone, then lat/lng.
 * Country name → one zone is not used (USA is not all New York; missing
 * countries used to fall through to UTC).
 */
function resolvePlaceTimezone({ weatherTimezone, storedTimezone, lat, lng } = {}) {
  return isValidIana(weatherTimezone)
    || isValidIana(storedTimezone)
    || timezoneFromCoords(lat, lng)
    || '';
}

function applyResolvedTimezone(weather, { storedTimezone, lat, lng } = {}) {
  const timezone = resolvePlaceTimezone({
    weatherTimezone: weather && weather.timezone,
    storedTimezone,
    lat,
    lng,
  });
  if (weather && timezone && !weather.timezone) weather.timezone = timezone;
  return { weather, timezone: timezone || null };
}

function formatPlaceLocalTime(timeZone, lang) {
  if (!timeZone) return '';
  try {
    return new Date().toLocaleString(lang === 'en' ? 'en-GB' : 'tr-TR', {
      timeZone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
  } catch {
    return '';
  }
}

module.exports = {
  isUnresolvedSentinel,
  isValidIana,
  timezoneFromCoords,
  resolvePlaceTimezone,
  applyResolvedTimezone,
  formatPlaceLocalTime,
};
