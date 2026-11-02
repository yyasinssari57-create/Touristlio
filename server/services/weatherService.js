const logger = require('../lib/logger');
const { isUnresolvedSentinel } = require('../lib/timezone');

const TTL = Number(process.env.WEATHER_CACHE_MS) || 30 * 60 * 1000;
const asyncStore = new Map();
const USER_AGENT = 'Touristlio/2.0 (+https://www.touristlio.com; touristlio.info@gmail.com)';

function parseCoords(lat, lng) {
  const la = typeof lat === 'string' ? Number(lat.trim().replace(',', '.')) : Number(lat);
  const ln = typeof lng === 'string' ? Number(lng.trim().replace(',', '.')) : Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
  if (Math.abs(la) > 90 || Math.abs(ln) > 180) return null;
  if (isUnresolvedSentinel(la, ln)) return null;
  return { lat: la, lng: ln };
}

async function requestJson(url, fetchImpl) {
  const res = await fetchImpl(url, {
    signal: AbortSignal.timeout(8000),
    headers: {
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    err.body = String(body || '').slice(0, 200);
    throw err;
  }
  return res.json();
}

function fromOpenMeteo(data) {
  const c = data && data.current;
  return {
    tempC: c?.temperature_2m ?? null,
    windKmh: c?.wind_speed_10m ?? null,
    code: c?.weather_code ?? null,
    timezone: data?.timezone || null,
    utcOffsetSeconds: data?.utc_offset_seconds ?? null,
    source: 'open-meteo',
    fetchedAt: new Date().toISOString(),
  };
}

/** MET Norway symbol_code → nearest WMO code used by weatherLabel. */
function metSymbolToWmo(symbol) {
  const base = String(symbol || '')
    .toLowerCase()
    .replace(/_(day|night|polartwilight)$/, '');
  if (!base) return null;
  if (base.includes('thunder')) return 95;
  if (base.includes('snow') || base.includes('sleet')) return 73;
  if (base.includes('showers')) return 80;
  if (base.includes('heavyrain') || base === 'rain') return 63;
  if (base.includes('lightrain')) return 61;
  if (base.includes('fog')) return 45;
  if (base === 'cloudy') return 3;
  if (base === 'partlycloudy') return 2;
  if (base === 'fair') return 1;
  if (base === 'clearsky') return 0;
  return null;
}

function fromMetNo(data) {
  const first = data?.properties?.timeseries?.[0];
  const details = first?.data?.instant?.details || {};
  const symbol = first?.data?.next_1_hours?.summary?.symbol_code
    || first?.data?.next_6_hours?.summary?.symbol_code
    || null;
  const windMs = details.wind_speed;
  return {
    tempC: details.air_temperature ?? null,
    windKmh: windMs == null ? null : Math.round(windMs * 3.6 * 10) / 10,
    code: metSymbolToWmo(symbol),
    timezone: null,
    utcOffsetSeconds: null,
    source: 'met-no',
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchOpenMeteo(lat, lng, fetchImpl) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lng)}&current=temperature_2m,weather_code,wind_speed_10m&timezone=auto`;
  return fromOpenMeteo(await requestJson(url, fetchImpl));
}

async function fetchMetNo(lat, lng, fetchImpl) {
  const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${encodeURIComponent(Number(lat).toFixed(4))}&lon=${encodeURIComponent(Number(lng).toFixed(4))}`;
  return fromMetNo(await requestJson(url, fetchImpl));
}

const WMO_LABELS = {
  tr: {
    0: 'Açık', 1: 'Az bulutlu', 2: 'Parçalı bulutlu', 3: 'Kapalı',
    45: 'Sis', 61: 'Hafif yağmur', 63: 'Yağmur', 73: 'Kar',
    80: 'Sağanak', 95: 'Fırtına',
  },
  en: {
    0: 'Clear', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
    45: 'Fog', 61: 'Light rain', 63: 'Rain', 73: 'Snow',
    80: 'Showers', 95: 'Thunderstorm',
  },
};

function weatherLabel(code, lang) {
  const map = WMO_LABELS[lang === 'en' ? 'en' : 'tr'];
  if (code == null || map[code] == null) return lang === 'en' ? 'Variable' : 'Değişken';
  return map[code];
}

function failedWeather(source) {
  return {
    tempC: null,
    windKmh: null,
    label: null,
    timezone: null,
    failed: true,
    fallback: true,
    source,
  };
}

function withLabel(w, lang) {
  return { ...w, label: weatherLabel(w.code, lang), fallback: false, failed: false };
}

async function loadLiveWeather(lat, lng, fetchImpl) {
  let openTimezone = null;
  let openOffset = null;
  try {
    const w = await fetchOpenMeteo(lat, lng, fetchImpl);
    if (w.tempC != null) return w;
    openTimezone = w.timezone;
    openOffset = w.utcOffsetSeconds;
  } catch (err) {
    // Render shares an IP pool. Open-Meteo answers 429 for that pool, which
    // used to become "veri alınamadı" with the error discarded.
    logger.warn({
      msg: 'Open-Meteo weather failed',
      status: err.status || null,
      err: err.message,
      detail: err.body || undefined,
    });
  }
  const met = await fetchMetNo(lat, lng, fetchImpl);
  if (met.tempC == null) throw new Error('met.no empty');
  return {
    ...met,
    timezone: openTimezone,
    utcOffsetSeconds: openOffset,
  };
}

async function getWeather(lat, lng, lang = 'tr', opts = {}) {
  const fetchImpl = opts.fetchImpl || fetch;
  const coords = parseCoords(lat, lng);
  if (!coords) return failedWeather('none');
  const key = `${coords.lat.toFixed(2)},${coords.lng.toFixed(2)}`;
  const cached = asyncStore.get(key);
  if (cached && Date.now() < cached.expires && !opts.fetchImpl) {
    return withLabel(cached.value, lang);
  }
  try {
    const w = await loadLiveWeather(coords.lat, coords.lng, fetchImpl);
    if (!opts.fetchImpl) asyncStore.set(key, { value: w, expires: Date.now() + TTL });
    return withLabel(w, lang);
  } catch (err) {
    logger.warn({ msg: 'Live weather failed', err: err.message, status: err.status || null });
    return failedWeather('error');
  }
}

function clearWeatherCache() {
  asyncStore.clear();
}

module.exports = {
  getWeather,
  weatherLabel,
  clearWeatherCache,
  metSymbolToWmo,
  parseCoords,
};
