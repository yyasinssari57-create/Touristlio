/**
 * V4 Adım 7 — görsel doğrulama alanları.
 * Mevcut kayıtlar doğrulanmamış kalır (image_verified false). Silme yok.
 */

async function up(db, { addColumnIfMissing }) {
  await addColumnIfMissing(db, 'places', 'image_credit', 'TEXT');
  await addColumnIfMissing(db, 'places', 'image_source_url', 'TEXT');
  await addColumnIfMissing(db, 'places', 'image_verified', 'BOOLEAN NOT NULL DEFAULT false');
  await addColumnIfMissing(db, 'places', 'image_verified_at', 'TEXT');

  // Admin'in daha önce yüklediği dosya havuz görseli değildir. Unsplash adresi doğrulanmış sayılmaz.
  await db.exec(`
    UPDATE places
    SET image_verified = true,
        image_verified_at = COALESCE(
          NULLIF(image_verified_at, ''),
          to_char(timezone('utc', now()), 'YYYY-MM-DD HH24:MI:SS')
        ),
        image_source_url = COALESCE(NULLIF(btrim(image_source_url), ''), image_url)
    WHERE image_verified IS NOT TRUE
      AND (
        image_url ILIKE '%/uploads/%'
        OR image_url ILIKE '%supabase.co/storage/%'
      )
      AND COALESCE(photos, '') NOT ILIKE '%unsplash.com%'
  `);
}

module.exports = { id: '019_v4_adim7_image_verify', up };
