const TTL = Number(process.env.WEATHER_CACHE_MS) || 30 * 60 * 1000;
const asyncStore = new Map();

async function fetchOpenMeteo(lat, lng) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code,wind_speed_10m&timezone=auto`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error('Weather API error');
  const data = await res.json();
  const c = data.current;
  return {
    tempC: c?.temperature_2m ?? null,
    windKmh: c?.wind_speed_10m ?? null,
    code: c?.weather_code ?? null,
    source: 'open-meteo',
    fetchedAt: new Date().toISOString(),
  };
}

const WMO_LABELS = {
  tr: { 0: 'Açık', 1: 'Az bulutlu', 2: 'Parçalı bulutlu', 3: 'Kapalı', 45: 'Sis', 61: 'Hafif yağmur', 63: 'Yağmur', 80: 'Sağanak', 95: 'Fırtına' },
  en: { 0: 'Clear', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 61: 'Light rain', 63: 'Rain', 80: 'Showers', 95: 'Thunderstorm' },
};

function weatherLabel(code, lang) {
  const map = WMO_LABELS[lang === 'en' ? 'en' : 'tr'];
  return map[code] || (lang === 'en' ? 'Variable' : 'Değişken');
}

async function getWeather(lat, lng, lang = 'tr') {
  if (lat == null || lng == null) {
    return { tempC: null, label: lang === 'en' ? 'Unavailable' : 'Mevcut değil', fallback: true, source: 'none' };
  }
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const cached = asyncStore.get(key);
  if (cached && Date.now() < cached.expires) {
    return { ...cached.value, label: weatherLabel(cached.value.code, lang), fallback: false };
  }
  try {
    const w = await fetchOpenMeteo(lat, lng);
    asyncStore.set(key, { value: w, expires: Date.now() + TTL });
    return { ...w, label: weatherLabel(w.code, lang), fallback: false };
  } catch {
    return {
      tempC: 18,
      windKmh: 8,
      label: lang === 'en' ? 'Estimated mild' : 'Tahmini ılıman',
      fallback: true,
      source: 'estimate',
    };
  }
}

module.exports = { getWeather, weatherLabel };
