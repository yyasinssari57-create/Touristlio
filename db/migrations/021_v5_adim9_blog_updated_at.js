/** V5 Adım 9 — blogs.updated_at for real sitemap lastmod on edits. */
async function up(db, { addColumnIfMissing }) {
  await addColumnIfMissing(db, 'blogs', 'updated_at', 'TEXT');
}

module.exports = { id: '021_v5_adim9_blog_updated_at', up };
