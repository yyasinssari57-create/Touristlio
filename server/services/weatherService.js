const logger = require('../lib/logger');
const { isUnresolvedSentinel } = require('../lib/timezone');

const TTL = Number(process.env.WEATHER_CACHE_MS) || 20 * 60 * 1000;
const STALE_MS = Number(process.env.WEATHER_STALE_MS) || 6 * 60 * 60 * 1000;
const STALE_RETRY_MS = 2 * 60 * 1000;
const FAIL_TTL = 20 * 1000;
const OPEN_METEO_COOLDOWN_MS = Number(process.env.WEATHER_OPEN_METEO_COOLDOWN_MS) || 20 * 60 * 1000;
const PROVIDER_TIMEOUT_MS = 5000;
const asyncStore = new Map();
const inflight = new Map();
let openMeteoBlockedUntil = 0;

const USER_AGENT = 'Touristlio/2.0 (+https://www.touristlio.com; touristlio.info@gmail.com)';

function parseCoords(lat, lng) {
  const la = typeof lat === 'string' ? Number(lat.trim().replace(',', '.')) : Number(lat);
  const ln = typeof lng === 'string' ? Number(lng.trim().replace(',', '.')) : Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
  if (Math.abs(la) > 90 || Math.abs(ln) > 180) return null;
  if (isUnresolvedSentinel(la, ln)) return null;
  return { lat: la, lng: ln };
}

function cacheKey(coords) {
  return `${coords.lat.toFixed(2)},${coords.lng.toFixed(2)}`;
}

function useMemoryCache(opts) {
  return !opts.fetchImpl || opts.cache === true;
}

async function requestJson(url, fetchImpl) {
  const res = await fetchImpl(url, {
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    headers: {
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    },
  });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
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

function sevenTimerToWmo(weather) {
  const base = String(weather || '').toLowerCase().replace(/(day|night)$/, '');
  if (!base) return null;
  if (base === 'clear') return 0;
  if (base === 'pcloudy' || base === 'mcloudy') return 2;
  if (base === 'cloudy' || base === 'humid') return 3;
  if (base === 'oshower' || base === 'ishower') return 80;
  if (base === 'lightsnow' || base === 'rainsnow' || base === 'snow') return 73;
  if (base.includes('ts')) return 95;
  return metSymbolToWmo(base);
}

function parse7TimerInit(init) {
  const s = String(init || '');
  if (!/^\d{10}$/.test(s)) return null;
  const t = Date.UTC(
    Number(s.slice(0, 4)),
    Number(s.slice(4, 6)) - 1,
    Number(s.slice(6, 8)),
    Number(s.slice(8, 10)),
  );
  return Number.isFinite(t) ? t : null;
}

function from7Timer(data) {
  const series = Array.isArray(data?.dataseries) ? data.dataseries : [];
  if (!series.length) {
    return {
      tempC: null, windKmh: null, code: null, timezone: null, utcOffsetSeconds: null, source: '7timer', fetchedAt: new Date().toISOString(),
    };
  }
  const init = parse7TimerInit(data.init);
  let best = series[0];
  if (init != null) {
    const now = Date.now();
    let bestDiff = Infinity;
    for (const row of series) {
      const hours = Number(row?.timepoint);
      if (!Number.isFinite(hours)) continue;
      const diff = Math.abs(init + hours * 3600000 - now);
      if (diff < bestDiff) {
        best = row;
        bestDiff = diff;
      }
    }
  }
  const temp = Number(best?.temp2m);
  return {
    tempC: Number.isFinite(temp) ? temp : null,
    windKmh: null,
    code: sevenTimerToWmo(best?.weather),
    timezone: null,
    utcOffsetSeconds: null,
    source: '7timer',
    fetchedAt: new Date().toISOString(),
  };
}

/** wttr.in weather codes are not WMO. Map the common ones; unknown stays unlabeled. */
function wttrCodeToWmo(code) {
  const n = Number(code);
  if (n === 113) return 0;
  if (n === 116) return 2;
  if (n === 119 || n === 122) return 3;
  if (n === 143 || n === 248 || n === 260) return 45;
  if (n === 176 || n === 263 || n === 353) return 80;
  if (n === 266 || n === 293 || n === 296) return 61;
  if (n === 299 || n === 302 || n === 305 || n === 308 || n === 356) return 63;
  if (n === 179 || n === 227 || n === 230 || n === 323 || n === 326 || n === 329 || n === 332 || n === 338) return 73;
  if (n === 200 || n === 386 || n === 389 || n === 392 || n === 395) return 95;
  return null;
}

function fromWttr(data) {
  const cur = data?.current_condition?.[0];
  const temp = Number(cur?.temp_C);
  const wind = Number(cur?.windspeedKmph);
  return {
    tempC: Number.isFinite(temp) ? temp : null,
    windKmh: Number.isFinite(wind) ? wind : null,
    code: wttrCodeToWmo(cur?.weatherCode),
    timezone: null,
    utcOffsetSeconds: null,
    source: 'wttr',
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

async function fetch7Timer(lat, lng, fetchImpl) {
  const url = `https://www.7timer.info/bin/api.pl?lon=${encodeURIComponent(Number(lng).toFixed(2))}&lat=${encodeURIComponent(Number(lat).toFixed(2))}&product=civil&output=json`;
  return from7Timer(await requestJson(url, fetchImpl));
}

async function fetchWttr(lat, lng, fetchImpl) {
  const url = `https://wttr.in/${encodeURIComponent(`${Number(lat).toFixed(4)},${Number(lng).toFixed(4)}`)}?format=j1`;
  return fromWttr(await requestJson(url, fetchImpl));
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
  const stale = !!w.stale;
  const out = {
    ...w,
    label: weatherLabel(w.code, lang),
    fallback: stale || !!w.fallback,
    failed: false,
  };
  if (stale) out.stale = true;
  else delete out.stale;
  return out;
}

function hasTemp(w) {
  return !!w && w.tempC != null && Number.isFinite(Number(w.tempC));
}

async function tryProvider(name, fn, note429) {
  try {
    const w = await fn();
    if (hasTemp(w)) return w;
    logger.warn({ msg: 'weather provider empty', provider: name });
    return null;
  } catch (err) {
    if (name === 'open-meteo' && err.status === 429 && note429) {
      openMeteoBlockedUntil = Date.now() + OPEN_METEO_COOLDOWN_MS;
      logger.warn({
        msg: 'Open-Meteo rate limited; skipping it until cooldown ends',
        cooldownMin: Math.round(OPEN_METEO_COOLDOWN_MS / 60000),
      });
    } else {
      logger.warn({
        msg: 'weather provider failed',
        provider: name,
        status: err.status || null,
        err: err.message,
      });
    }
    return null;
  }
}

async function loadLiveWeather(lat, lng, fetchImpl, opts) {
  const honorCooldown = useMemoryCache(opts);
  if (!(honorCooldown && Date.now() < openMeteoBlockedUntil)) {
    const open = await tryProvider('open-meteo', () => fetchOpenMeteo(lat, lng, fetchImpl), honorCooldown);
    if (open) return open;
  }
  const met = await tryProvider('met-no', () => fetchMetNo(lat, lng, fetchImpl), false);
  if (met) {
    return met;
  }
  const seven = await tryProvider('7timer', () => fetch7Timer(lat, lng, fetchImpl), false);
  if (seven) return seven;
  const wttr = await tryProvider('wttr', () => fetchWttr(lat, lng, fetchImpl), false);
  if (wttr) return wttr;
  throw new Error('all weather providers failed');
}

function remember(key, w) {
  const now = Date.now();
  asyncStore.set(key, { value: w, expires: now + TTL, staleUntil: now + STALE_MS });
}

function freshCached(key) {
  const cached = asyncStore.get(key);
  if (!cached || Date.now() >= cached.expires) return null;
  return cached;
}

function staleCached(key) {
  const cached = asyncStore.get(key);
  if (!cached || cached.failed || !cached.value) return null;
  if (Date.now() < cached.staleUntil) return cached;
  return null;
}

async function getWeather(lat, lng, lang = 'tr', opts = {}) {
  const fetchImpl = opts.fetchImpl || fetch;
  const coords = parseCoords(lat, lng);
  if (!coords) return failedWeather('none');
  const key = cacheKey(coords);
  const memory = useMemoryCache(opts);
  if (memory && !opts.force) {
    const cached = freshCached(key);
    if (cached) return cached.failed ? failedWeather('error') : withLabel(cached.value, lang);
    const pending = inflight.get(key);
    if (pending) {
      const raw = await pending;
      return raw ? withLabel(raw, lang) : failedWeather('error');
    }
  }

  const job = (async () => {
    try {
      const w = await loadLiveWeather(coords.lat, coords.lng, fetchImpl, opts);
      if (memory) remember(key, w);
      return w;
    } catch (err) {
      logger.warn({ msg: 'Live weather failed', err: err.message, status: err.status || null });
      if (memory) {
        const stale = staleCached(key);
        if (stale) {
          stale.value = { ...stale.value, stale: true };
          stale.expires = Date.now() + STALE_RETRY_MS;
          logger.warn({ msg: 'serving stale weather', key, source: stale.value.source || null });
          return stale.value;
        }
        asyncStore.set(key, {
          value: null,
          failed: true,
          expires: Date.now() + FAIL_TTL,
          staleUntil: 0,
        });
      }
      return null;
    }
  })();

  if (memory) inflight.set(key, job);
  try {
    const raw = await job;
    return raw ? withLabel(raw, lang) : failedWeather('error');
  } finally {
    if (inflight.get(key) === job) inflight.delete(key);
  }
}

function clearWeatherCache() {
  asyncStore.clear();
  inflight.clear();
  openMeteoBlockedUntil = 0;
}

/** Test hook: keep the last reading but force the next call through the providers. */
function expireWeatherFreshness() {
  for (const entry of asyncStore.values()) entry.expires = 0;
}

module.exports = {
  getWeather,
  weatherLabel,
  clearWeatherCache,
  expireWeatherFreshness,
  metSymbolToWmo,
  parseCoords,
};
