/**
 * V6 Adım 6 — şehir düzeyinde konaklama ortalaması (₺/gece).
 * Yer sayfasında «Konaklama (şehir ortalaması)» kutusunun kaynağı.
 */

async function up(db, { addColumnIfMissing }) {
  await addColumnIfMissing(db, 'cities', 'hotel_avg_try', 'INTEGER');
}

module.exports = { id: '024_city_hotel_avg', up };
