/**
 * [FAZ3-3] Veritabanı index'leri.
 *
 * Master PRD SQL'i bu şemada yok: tiola, blog_posts, favorites,
 * verification_status, deleted_at, city_slug, category_slug, avg_score,
 * name_tr, description_tr, city_tr, is_published.
 *
 * Karşılıkları zaten duruyor (slug, status, ülke/şehir/puan, kategori,
 * Tiola place+user, kısmi tekil oy, blog slug, users.email UNIQUE,
 * saved_places PK, search_tsv GIN). Bu dosya yalnızca canlı sorgunun
 * hâlâ kullanamadığı üç şekli ekler. Boot'ta schema_migrations ile çalışır;
 * Supabase SQL editöründe elle çalıştırılmaz.
 *
 * Bilinçli olarak eklenmeyenler:
 * - tiolas(user_id, place_id) tam UNIQUE — yanıt ve birden fazla metin
 *   Tiola'sı serbest. Yıldız oyu zaten kısmi unique
 *   idx_tiolas_unique_user_place_vote (007).
 * - turkish tsvector / description — arama sonuçlarını değiştirir.
 *   GIN idx_places_search_tsv (002) duruyor.
 * - (city, category) btree — liste filtresi LOWER(city) LIKE '%…%' OR
 *   kullanıyor; bu btree seçilmez. Ülke/şehir ve kategori index'leri (008) duruyor.
 */

async function up(db, { tableExists, columnExists }) {
  async function has(table, cols) {
    if (!(await tableExists(db, table))) return false;
    for (const col of cols) {
      if (!(await columnExists(db, table, col))) return false;
    }
    return true;
  }

  // Varsayılan liste: ORDER BY COALESCE(tiola_rating, 0) DESC, id DESC
  if (await has('places', ['tiola_rating'])) {
    await db.exec(`
      CREATE INDEX IF NOT EXISTS idx_places_score
        ON places ((COALESCE(tiola_rating, 0)) DESC, id DESC)
    `);
  }

  // Mekân sayfası: onaylı, üst seviye Tiola, yeniden eskiye
  if (await has('tiolas', ['place_id', 'created_at', 'status', 'parent_id'])) {
    await db.exec(`
      CREATE INDEX IF NOT EXISTS idx_tiolas_place_approved
        ON tiolas (place_id, created_at DESC)
        WHERE status = 'approved' AND parent_id IS NULL
    `);
  }

  // Blog listesi: status = approved, featured, COALESCE(published_at, created_at)
  if (await has('blogs', ['featured', 'published_at', 'created_at', 'status'])) {
    await db.exec(`
      CREATE INDEX IF NOT EXISTS idx_blogs_published
        ON blogs (featured DESC, (COALESCE(published_at, created_at)) DESC)
        WHERE status = 'approved'
    `);
  }
}

module.exports = { id: '012_faz3_3_indexes', up };
