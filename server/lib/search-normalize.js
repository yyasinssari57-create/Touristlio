/** TR/EN friendly search: İstanbul ↔ Istanbul, accents stripped */
function normalizeSearch(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchesQuery(place, qNorm) {
  if (!qNorm) return true;
  const hay = [
    place.name,
    place.location,
    place.country,
    place.city,
    place.district,
    ...(place.searchAliases || []),
  ]
    .filter(Boolean)
    .map(normalizeSearch)
    .join(' ');
  return hay.includes(qNorm) || qNorm.split(' ').every((w) => w.length < 2 || hay.includes(w));
}

module.exports = { normalizeSearch, matchesQuery };
