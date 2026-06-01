/** Haversine distance in km */
function haversineKm(lat1, lng1, lat2, lng2) {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return Infinity;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function findNearbyPlaces(allRows, originRow, mapPlace, limit = 6) {
  const origin = mapPlace(originRow);
  const scored = allRows
    .filter((r) => r.id !== originRow.id)
    .map((r) => {
      const p = mapPlace(r);
      const dist = haversineKm(origin.lat, origin.lng, p.lat, p.lng);
      const sameCountry = r.country === originRow.country ? 0 : 10000;
      return { place: p, score: dist + sameCountry };
    })
    .sort((a, b) => a.score - b.score);
  return scored.slice(0, limit).map((x) => ({ ...x.place, distanceKm: Math.round(haversineKm(origin.lat, origin.lng, x.place.lat, x.place.lng) * 10) / 10 }));
}

function findSimilarPlaces(allRows, originRow, mapPlace, limit = 6) {
  const origin = mapPlace(originRow);
  const cats = new Set([originRow.category, ...(origin.categories || [])]);
  return allRows
    .filter((r) => r.id !== originRow.id && (cats.has(r.category) || JSON.parse(r.categories || '[]').some((c) => cats.has(c))))
    .map((r) => mapPlace(r))
    .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
    .slice(0, limit);
}

module.exports = { haversineKm, findNearbyPlaces, findSimilarPlaces };
