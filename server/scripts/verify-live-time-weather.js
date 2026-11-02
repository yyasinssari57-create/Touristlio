/**
 * Canlı saat dilimi ve hava: ülke tablosu yok, koordinat IANA,
 * Open-Meteo sıcaklık, Render 429 olursa MET Norveç yedeği.
 */
const fs = require('fs');
const path = require('path');
const { getWeather, clearWeatherCache, expireWeatherFreshness, metSymbolToWmo } = require('../services/weatherService');
const { resolvePlaceTimezone, applyResolvedTimezone, formatPlaceLocalTime } = require('../lib/timezone');

const ROOT = path.join(__dirname, '..', '..');
let failed = 0;
function ok(msg) { console.log('  ✓', msg); }
function fail(msg) {
  console.error('  ✗', msg);
  failed += 1;
}
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function jsonResponse(status, body) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
    json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
  };
}

console.log('verify-live-time-weather');

function offsetHours(zone) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type).value;
  const asUtc = Date.UTC(get('year'), Number(get('month')) - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - now.getTime()) / 3600000);
}

const istanbul = resolvePlaceTimezone({ lat: 41.0082, lng: 28.9784 });
if (istanbul !== 'Europe/Istanbul') fail(`İstanbul dilimi ${istanbul}`);
else if (offsetHours('Europe/Istanbul') !== 3) fail(`İstanbul farkı UTC+${offsetHours('Europe/Istanbul')}`);
else ok('İstanbul koordinatı Europe/Istanbul, UTC+3');

const ayasofya = resolvePlaceTimezone({ lat: 40.99842, lng: 28.98752 });
if (ayasofya !== 'Europe/Istanbul') fail(`Ayasofya dilimi ${ayasofya}`);
else ok('Ayasofya koordinatı Europe/Istanbul');

const berlin = resolvePlaceTimezone({ lat: 52.52, lng: 13.405 });
if (berlin !== 'Europe/Berlin') fail(`Berlin UTC/yanlış dilim: ${berlin}`);
else ok('Berlin koordinatı Europe/Berlin (ülke tablosu UTC değil)');

const nyc = resolvePlaceTimezone({ lat: 40.7128, lng: -74.006 });
if (nyc !== 'America/New_York') fail(`New York dilimi ${nyc}`);
else ok('New York koordinatı America/New_York');

const la = resolvePlaceTimezone({ lat: 34.0522, lng: -118.2437 });
if (la !== 'America/Los_Angeles') fail(`Los Angeles dilimi ${la}`);
else ok('Los Angeles koordinatı America/Los_Angeles');

const preferWeather = resolvePlaceTimezone({
  weatherTimezone: 'Europe/Istanbul',
  storedTimezone: 'America/New_York',
  lat: 52.52,
  lng: 13.405,
});
if (preferWeather !== 'Europe/Istanbul') fail(`Open-Meteo dilimi ezildi: ${preferWeather}`);
else ok('Open-Meteo dilimi kayıtlı dilimden ve koordinattan önce');

const preferStored = resolvePlaceTimezone({
  storedTimezone: 'Europe/Paris',
  lat: 52.52,
  lng: 13.405,
});
if (preferStored !== 'Europe/Paris') fail(`kayıtlı dilim yok sayıldı: ${preferStored}`);
else ok('kayıtlı dilim koordinattan önce');

const badStored = resolvePlaceTimezone({
  storedTimezone: 'GMT+3',
  lat: 52.52,
  lng: 13.405,
});
if (badStored !== 'Europe/Berlin') fail(`bozuk kayıtlı dilim koordinatı ezdi: ${badStored}`);
else ok('bozuk kayıtlı dilim yok sayılır');

if (resolvePlaceTimezone({ lat: 20, lng: 0 })) fail('[20,0] sentinel dilim üretmemeli');
else ok('[20,0] sentinel dilim yok');

const istClock = formatPlaceLocalTime('Europe/Istanbul', 'tr');
const utcClock = formatPlaceLocalTime('UTC', 'tr');
if (!istClock || !utcClock || istClock === utcClock) fail(`İstanbul saati UTC’den ayrılmıyor: ${istClock} / ${utcClock}`);
else if (offsetHours('Europe/Istanbul') !== 3) fail('İstanbul UTC+3 değil');
else ok(`Ayasofya saati Europe/Istanbul (${istClock}), UTC değil`);

if (metSymbolToWmo('clearsky_day') !== 0 || metSymbolToWmo('heavyrain') !== 63) {
  fail('MET sembol kodu WMO’ya dönmüyor');
} else ok('MET sembol kodu etikete döner');

async function main() {
clearWeatherCache();
let metCalls = 0;
const metOnly = await getWeather(41.01, 29.01, 'tr', {
  fetchImpl: async (url) => {
    if (String(url).includes('open-meteo')) return jsonResponse(429, 'Daily API request limit exceeded');
    metCalls += 1;
    return jsonResponse(200, {
      properties: {
        timeseries: [{
          data: {
            instant: { details: { air_temperature: 17.2, wind_speed: 3 } },
            next_1_hours: { summary: { symbol_code: 'fair_day' } },
          },
        }],
      },
    });
  },
});
if (metOnly.failed || metOnly.tempC !== 17.2 || metOnly.source !== 'met-no' || metOnly.label !== 'Az bulutlu') {
  fail(`Open-Meteo 429 yedeği bozuk: ${JSON.stringify(metOnly)}`);
} else if (metCalls !== 1) fail('MET Norveç bir kez çağrılmalı');
else ok('Open-Meteo 429 olunca sıcaklık MET Norveç’ten gelir');

const metLive = await getWeather(41.015, 28.98, 'tr', {
  fetchImpl: async (url, opts) => {
    if (String(url).includes('open-meteo')) return jsonResponse(429, 'limit');
    return fetch(url, opts);
  },
});
if (typeof metLive.tempC !== 'number' || metLive.source !== 'met-no') {
  fail(`MET canlı yedek yok: ${JSON.stringify(metLive)}`);
} else ok(`MET canlı yedek ${metLive.tempC}°C`);

const liveOpen = await getWeather('41,0082', '28,9784', 'tr', {
  fetchImpl: async (url) => {
    if (!String(url).includes('open-meteo')) throw new Error('MET çağrılmamalı');
    return jsonResponse(200, {
      timezone: 'Europe/Istanbul',
      utc_offset_seconds: 10800,
      current: { temperature_2m: 16.4, weather_code: 2, wind_speed_10m: 5 },
    });
  },
});
if (liveOpen.tempC !== 16.4 || liveOpen.timezone !== 'Europe/Istanbul' || liveOpen.label !== 'Parçalı bulutlu') {
  fail(`Open-Meteo yanıtı bozuk: ${JSON.stringify(liveOpen)}`);
} else if (liveOpen.adminOverride) fail('canlı hava yönetici bayrağı taşıyor');
else ok('virgüllü koordinat ve Open-Meteo sıcaklığı');

const noCoords = await getWeather(20, 0, 'tr', {
  fetchImpl: async () => { throw new Error('sentinel istek atmamalı'); },
});
if (!noCoords.failed || noCoords.tempC != null) fail(`[20,0] hava: ${JSON.stringify(noCoords)}`);
else ok('[20,0] hava anlamlı şekilde alınamaz');

const stringLat = await getWeather('40.7128', '-74.0060', 'en', {
  fetchImpl: async () => jsonResponse(200, {
    timezone: 'America/New_York',
    utc_offset_seconds: -18000,
    current: { temperature_2m: 11, weather_code: 0, wind_speed_10m: 8 },
  }),
});
if (stringLat.failed || stringLat.tempC !== 11) fail(`string koordinat patladı: ${JSON.stringify(stringLat)}`);
else ok('string enlem/boylam toFixed ile kırılmaz');

function metBody(temp, symbol) {
  return jsonResponse(200, {
    properties: {
      timeseries: [{
        data: {
          instant: { details: { air_temperature: temp, wind_speed: 2 } },
          next_1_hours: { summary: { symbol_code: symbol || 'cloudy' } },
        },
      }],
    },
  });
}

clearWeatherCache();
let cooledOpen = 0;
const cooled = await getWeather(10.55, 10.55, 'tr', {
  cache: true,
  fetchImpl: async (url) => {
    if (String(url).includes('open-meteo')) return jsonResponse(429, 'Daily API request limit exceeded');
    if (String(url).includes('met.no')) return metBody(12.5, 'cloudy');
    throw new Error(`429 sonrası başka sağlayıcı gerekmedi: ${url}`);
  },
});
if (cooled.failed || cooled.tempC !== 12.5 || cooled.source !== 'met-no') {
  fail(`429 soğuma öncesi bozuk: ${JSON.stringify(cooled)}`);
} else ok('Open-Meteo 429 belleğe yazılıyor');

const cooledNext = await getWeather(11.66, 11.66, 'tr', {
  cache: true,
  fetchImpl: async (url) => {
    if (String(url).includes('open-meteo')) {
      cooledOpen += 1;
      return jsonResponse(429, 'limit');
    }
    if (String(url).includes('met.no')) return metBody(13.1, 'clearsky_day');
    throw new Error(`soğuma sırasında fazla çağrı: ${url}`);
  },
});
if (cooledOpen !== 0) fail('Open-Meteo 429 sonrası yine çağrıldı');
else if (cooledNext.tempC !== 13.1 || cooledNext.source !== 'met-no') fail(`soğuma yedeği bozuk: ${JSON.stringify(cooledNext)}`);
else ok('Open-Meteo 429 olunca bir sonraki yer doğrudan MET Norveç');

clearWeatherCache();
const seeded = await getWeather(12.34, 12.34, 'tr', {
  cache: true,
  fetchImpl: async () => jsonResponse(200, {
    timezone: 'Europe/Istanbul',
    utc_offset_seconds: 10800,
    current: { temperature_2m: 19.4, weather_code: 1, wind_speed_10m: 4 },
  }),
});
if (seeded.tempC !== 19.4 || seeded.failed) fail(`önbellek tohumu bozuk: ${JSON.stringify(seeded)}`);
expireWeatherFreshness();
let staleCalls = 0;
const stale = await getWeather(12.34, 12.34, 'tr', {
  cache: true,
  fetchImpl: async () => {
    staleCalls += 1;
    return jsonResponse(503, 'down');
  },
});
if (!stale || stale.failed || stale.tempC !== 19.4 || !stale.stale || !stale.fallback) {
  fail(`eski hava dönmedi: ${JSON.stringify(stale)}`);
} else if (staleCalls < 1) fail('sağlayıcılar yeniden denenmedi');
else ok('sağlayıcılar düşünce son başarılı sıcaklık duruyor');

const again = await getWeather(12.34, 12.34, 'tr', {
  cache: true,
  fetchImpl: async () => {
    fail('bayat hava iki dakika içinde yeniden istenmemeli');
    return jsonResponse(503, 'down');
  },
});
if (again.tempC !== 19.4 || again.failed) fail(`bayat tekrar bozuk: ${JSON.stringify(again)}`);
else ok('bayat hava kısa süre yeniden istenmez');

clearWeatherCache();
let thirdCalls = 0;
const third = await getWeather(13.21, 13.21, 'tr', {
  fetchImpl: async (url) => {
    const u = String(url);
    if (u.includes('open-meteo')) return jsonResponse(429, 'limit');
    if (u.includes('met.no')) return jsonResponse(503, 'met down');
    if (u.includes('7timer')) {
      thirdCalls += 1;
      return jsonResponse(200, {
        init: '2026110212',
        dataseries: [{ timepoint: 9, temp2m: 14, weather: 'lightrainnight' }],
      });
    }
    throw new Error(`7timer yetmeli: ${u}`);
  },
});
if (third.failed || third.tempC !== 14 || third.source !== '7timer' || third.label !== 'Hafif yağmur') {
  fail(`7timer yedeği bozuk: ${JSON.stringify(third)}`);
} else if (thirdCalls !== 1) fail('7timer bir kez çağrılmalı');
else ok('Open-Meteo ve MET düşünce 7Timer sıcaklık verir');

clearWeatherCache();
console.log('  … canlı Open-Meteo / MET');
const istanbulLive = await getWeather(41.0082, 28.9784, 'tr');
const istanbulTz = applyResolvedTimezone(istanbulLive, { lat: 41.0082, lng: 28.9784 }).timezone;
if (typeof istanbulLive.tempC !== 'number') fail(`İstanbul sıcaklık yok: ${JSON.stringify(istanbulLive)}`);
else if (istanbulTz !== 'Europe/Istanbul') fail(`İstanbul saat dilimi ${istanbulTz}`);
else ok(`İstanbul canlı ${istanbulLive.tempC}°C ${istanbulLive.source} ${istanbulTz}`);

const nycLive = await getWeather(40.7128, -74.006, 'en');
const nycTz = applyResolvedTimezone(nycLive, { lat: 40.7128, lng: -74.006 }).timezone;
if (typeof nycLive.tempC !== 'number') fail(`New York sıcaklık yok: ${JSON.stringify(nycLive)}`);
else if (nycTz !== 'America/New_York') fail(`New York saat dilimi ${nycTz}`);
else ok(`New York canlı ${nycLive.tempC}°C ${nycLive.source} ${nycTz}`);

const legacyJs = read('server/routes/places-legacy.js');
const appJs = read('public/js/app.js');
const weatherJs = read('server/services/weatherService.js');
const liveJs = read('server/routes/live-data.js');
if (legacyJs.includes('timezoneForCountry')) fail('places-legacy ülke saat tablosu kullanıyor');
else if (!legacyJs.includes('applyResolvedTimezone')) fail('places-legacy dilim seçmiyor');
else ok('yer ucu ülke tablosu kullanmıyor');
if (!liveJs.includes('getWeather') || !liveJs.includes('timezone')) fail('live-data hava ve dilim döndürmüyor');
else ok('live-data sıcaklık ve saat dilimi taşır');
if (!appJs.includes('data.weather?.timezone || li.timezone')) fail('saat Open-Meteo dilimini tercih etmiyor');
else ok('sayfa saati önce hava dilimini kullanır');
if (/timeZone \? \{ \.\.\.base, timeZone \} : base/.test(appJs)) fail('saat dilimi boşsa tarayıcı saati gösteriliyor');
else ok('boş dilimde ziyaretçinin saati yazılmaz');
if (!appJs.includes('hour12: false') || !appJs.includes('timeZone,')) {
  fail('saat dilimi hourCycle hata verince düşmüyor');
} else ok('hourCycle olmazsa saat yine yerin diliminde');
if (!appJs.includes('function weatherHasReading') || !appJs.includes('weatherHasReading(w)')) {
  fail('sıcaklık varken veri alınamadı gizlenmiyor');
} else ok('sıcaklık varsa veri alınamadı yazılmaz');
if (/if \(w\.failed && !w\.adminOverride\)/.test(appJs)) fail('failed bayrağı sıcaklığı eziyor');
else ok('failed bayrağı tek başına kutuyu kapatmıyor');
if (!appJs.includes("/weather?lang=")) fail('hava ayrı uçtan yeniden denenmiyor');
else ok('yer gövdesi boşa düşerse /weather bir kez daha istenir');
if (!weatherJs.includes('api.met.no') || !weatherJs.includes('api.open-meteo.com') || !weatherJs.includes('7timer.info') || !weatherJs.includes('wttr.in')) {
  fail('hava yedeği eksik');
} else ok('hava Open-Meteo, MET Norveç, 7Timer, wttr.in');

if (failed) {
  console.error(`\n${failed} kontrol başarısız`);
  process.exit(1);
}
console.log('\nlive time weather OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
