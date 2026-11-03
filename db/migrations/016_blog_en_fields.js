/**
 * V4 Adım 2 — blogs İngilizce sütunları.
 * title_en, excerpt_en, body_en, slug_en boş kalabilir.
 * Mevcut yazılara dokunulmaz; çeviri sonradan admin formundan yazılır.
 */

async function up(db, { addColumnIfMissing }) {
  await addColumnIfMissing(db, 'blogs', 'title_en', 'TEXT');
  await addColumnIfMissing(db, 'blogs', 'excerpt_en', 'TEXT');
  await addColumnIfMissing(db, 'blogs', 'body_en', 'TEXT');
  await addColumnIfMissing(db, 'blogs', 'slug_en', 'TEXT');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_blogs_slug_en ON blogs(slug_en)');
}

module.exports = { id: '016_blog_en_fields', up };
