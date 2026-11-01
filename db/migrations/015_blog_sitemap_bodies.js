/**
 * FAZ3-5 left approved blogs out of the sitemap when body length was 200
 * or below. Demo seed copied the excerpt into the body (about 70–140
 * characters). Verify:faz2-4 also left approved rows titled
 * "FAZ2-4 verify blog…" with the body "Gövde".
 *
 * Real short posts grow from their own title and excerpt.
 * Test leftovers are rejected and their published_at is cleared. A pending
 * row with a past published_at is published again on boot, which would put
 * the short test post back on the public list. No new posts are inserted.
 */

const logger = require('../../server/lib/logger');
const { planSitemapBlog, BLOG_BODY_MIN_CHARS } = require('../../server/lib/blog-sitemap-body');

async function up(db, { tableExists }) {
  if (!(await tableExists(db, 'blogs'))) return;

  const rows = await db.prepare(`
    SELECT id, title, excerpt, body, status, published_at
    FROM blogs
    WHERE (
        status = 'approved'
        AND (body IS NULL OR char_length(btrim(body)) <= ?)
      )
      OR title ILIKE 'FAZ2-4 verify blog%'
      OR title ILIKE 'ORTA-6 Pending%'
      OR (
        btrim(COALESCE(excerpt, '')) = 'Özet'
        AND btrim(COALESCE(body, '')) = 'Gövde'
      )
      OR (
        btrim(COALESCE(excerpt, '')) = 'hidden excerpt'
        AND btrim(COALESCE(body, '')) = 'hidden body'
      )
  `).all(BLOG_BODY_MIN_CHARS);

  const expand = await db.prepare('UPDATE blogs SET body = ? WHERE id = ?');
  const unpublish = await db.prepare(`
    UPDATE blogs SET
      status = 'rejected',
      published_at = NULL,
      rejection_reason = CASE
        WHEN rejection_reason IS NULL OR btrim(rejection_reason) = '' THEN 'Doğrulama kalıntısı'
        ELSE rejection_reason
      END
    WHERE id = ?
  `);

  let expanded = 0;
  let unpublished = 0;
  const tx = db.transaction(async (list) => {
    for (const row of list) {
      const plan = planSitemapBlog(row);
      if (plan.action === 'unpublish') {
        await unpublish.run(row.id);
        unpublished += 1;
        continue;
      }
      if (plan.action !== 'expand') continue;
      const next = String(plan.body || '').trim();
      if (!next || next.length <= BLOG_BODY_MIN_CHARS) {
        throw new Error(`Blog gövdesi sitemap eşiğinin altında kaldı (id ${row.id})`);
      }
      if (next === String(row.body || '').trim()) continue;
      await expand.run(next, row.id);
      expanded += 1;
    }
  });
  await tx(rows);

  logger.info({
    msg: 'blog sitemap bodies',
    scanned: rows.length,
    expanded,
    unpublished,
  });
}

module.exports = { id: '015_blog_sitemap_bodies', up };
