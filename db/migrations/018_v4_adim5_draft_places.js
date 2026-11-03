/**
 * V4 Adım 5 — şablon üretim kayıtları ve adres-benzeri kopyalar taslak.
 * Silmez. Arşivi ve 16 gözden geçir eski şehri değiştirmez.
 * Kopyanın eski slug'ı, yayında kalan kayda 301 için saklanır.
 */

const path = require('path');
const logger = require('../../server/lib/logger');

const PLAN_PATH = path.join(__dirname, '..', '..', 'server', 'data', 'v4-adim5-unpublish.json');

function isPublished(status) {
  const s = String(status == null || status === '' ? 'published' : status).trim().toLowerCase();
  return s === 'published';
}

async function findPlace(db, id, slug) {
  if (id != null && id !== '') {
    const byId = await db.prepare('SELECT id, slug, status FROM places WHERE id = ?').get(id);
    if (byId) return byId;
  }
  if (slug) {
    return await db.prepare('SELECT id, slug, status FROM places WHERE slug = ?').get(slug);
  }
  return null;
}

async function up(db, { tableExists }) {
  if (!(await tableExists(db, 'places'))) return;
  const plan = require(PLAN_PATH);
  const protectedIds = new Set((plan.protected || []).map((row) => Number(row.id)));
  const protectedSlugs = new Set((plan.protected || []).map((row) => row.slug));

  await db.exec(`
    CREATE TABLE IF NOT EXISTS place_slug_redirects (
      from_slug TEXT PRIMARY KEY,
      to_slug TEXT NOT NULL
    )
  `);

  const update = await db.prepare(`
    UPDATE places
    SET status = 'draft'
    WHERE id = ?
      AND COALESCE(NULLIF(TRIM(status), ''), 'published') = 'published'
  `);
  const insertRedirect = await db.prepare(`
    INSERT INTO place_slug_redirects (from_slug, to_slug) VALUES (?, ?)
    ON CONFLICT (from_slug) DO UPDATE SET to_slug = EXCLUDED.to_slug
  `);

  const tx = db.transaction(async () => {
    let drafted = 0;
    for (const item of plan.drafts || []) {
      if (protectedIds.has(Number(item.id)) || protectedSlugs.has(item.slug)) continue;
      const row = await findPlace(db, item.id, item.slug);
      if (!row) continue;
      if (protectedIds.has(Number(row.id)) || protectedSlugs.has(row.slug)) continue;
      const result = await update.run(row.id);
      drafted += result && result.changes ? result.changes : 0;
    }

    let redirects = 0;
    for (const item of plan.redirects || []) {
      const from = await findPlace(db, item.fromId, item.fromSlug);
      const to = await findPlace(db, item.toId, item.toSlug);
      if (from && String(from.status || '').toLowerCase() === 'archived') continue;
      if (to && !isPublished(to.status)) continue;
      const fromSlug = (from && from.slug) || item.fromSlug;
      const toSlug = (to && to.slug) || item.toSlug;
      if (!fromSlug || !toSlug || fromSlug === toSlug) continue;
      if (protectedSlugs.has(fromSlug)) continue;
      await insertRedirect.run(fromSlug, toSlug);
      redirects += 1;
    }
    return { drafted, redirects };
  });

  const result = await tx();
  logger.info({
    msg: 'v4 adim5 drafts applied',
    drafted: result.drafted,
    redirects: result.redirects,
    planned: (plan.drafts || []).length,
  });
}

module.exports = { id: '018_v4_adim5_draft_places', up };
