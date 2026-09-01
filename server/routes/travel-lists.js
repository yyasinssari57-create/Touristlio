const crypto = require('crypto');
const express = require('express');
const { db } = require('../db');
const { authRequired } = require('../middleware/auth');
const { mapPlaceRow } = require('../lib/place-map');
const { placeStats } = require('../db');
const { parsePositiveInt } = require('../lib/sanitize');

const router = express.Router();

async function mapPlace(row) {
  return mapPlaceRow(row, await placeStats(row.id));
}

router.get('/visited/all', authRequired, async (req, res) => {
  const rows = await db.prepare(`
    SELECT p.*, vp.visited_at, vp.note FROM visited_places vp
    JOIN places p ON p.id = vp.place_id WHERE vp.user_id = ? ORDER BY vp.visited_at DESC
  `).all(req.user.id);
  const places = [];
  for (const r of rows) {
    places.push({ ...await mapPlace(r), visitedAt: r.visited_at, visitNote: r.note });
  }
  res.json({ places });
});

router.get('/visited/stats', authRequired, async (req, res) => {
  const total = (await db.prepare('SELECT COUNT(*) AS c FROM visited_places WHERE user_id = ?').get(req.user.id)).c;
  const countries = (await db.prepare(`
    SELECT COUNT(DISTINCT p.country) AS c FROM visited_places vp JOIN places p ON p.id = vp.place_id WHERE vp.user_id = ?
  `).get(req.user.id)).c;
  res.json({ totalVisited: total, countriesVisited: countries });
});

router.post('/visited', authRequired, async (req, res) => {
  const { placeId, visitedAt, note } = req.body || {};
  if (!placeId) return res.status(400).json({ error: 'placeId gerekli' });
  const pid = Number(placeId);
  if (!Number.isFinite(pid)) return res.status(400).json({ error: 'Geçersiz placeId' });
  await db.prepare(`
    INSERT OR REPLACE INTO visited_places (user_id, place_id, visited_at, note) VALUES (?, ?, ?, ?)
  `).run(req.user.id, pid, visitedAt || new Date().toISOString().slice(0, 10), note || null);
  res.json({ ok: true });
});

router.delete('/visited/:placeId', authRequired, async (req, res) => {
  const pid = Number(req.params.placeId);
  if (!Number.isFinite(pid)) return res.status(400).json({ error: 'Geçersiz placeId' });
  await db.prepare('DELETE FROM visited_places WHERE user_id = ? AND place_id = ?').run(req.user.id, pid);
  res.json({ ok: true });
});

router.get('/public/:shareToken', async (req, res) => {
  const token = String(req.params.shareToken || '').trim();
  if (!token || token.length < 16) return res.status(400).json({ error: 'Geçersiz paylaşım bağlantısı' });
  const list = await db.prepare(`
    SELECT * FROM travel_lists WHERE share_token = ? AND is_public = 1
  `).get(token);
  if (!list) return res.status(404).json({ error: 'Liste bulunamadı veya herkese açık değil' });
  const items = await db.prepare(`
    SELECT p.*, tli.note, tli.sort_order FROM travel_list_items tli
    JOIN places p ON p.id = tli.place_id WHERE tli.list_id = ? ORDER BY tli.sort_order, tli.added_at
  `).all(list.id);
  res.json({
    list: {
      id: list.id,
      name: list.name,
      description: list.description,
      isPublic: true,
      createdAt: list.created_at,
      updatedAt: list.updated_at,
    },
    places: await Promise.all(items.map((r) => mapPlace(r))),
  });
});

router.get('/', authRequired, async (req, res) => {
  const rows = await db.prepare(`
    SELECT tl.*, (SELECT COUNT(*) FROM travel_list_items WHERE list_id = tl.id) AS item_count
    FROM travel_lists tl WHERE user_id = ? ORDER BY updated_at DESC
  `).all(req.user.id);
  res.json({ lists: rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    isPublic: !!r.is_public,
    shareToken: r.share_token || null,
    itemCount: r.item_count,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  })) });
});

router.post('/', authRequired, async (req, res) => {
  const { name, description } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'Liste adı gerekli' });
  const info = await db.prepare(`
    INSERT INTO travel_lists (user_id, name, description) VALUES (?, ?, ?)
  `).run(req.user.id, name.trim(), description || null);
  res.status(201).json({ id: info.lastInsertRowid, name: name.trim() });
});

router.post('/:id/publish', authRequired, async (req, res) => {
  const listId = parsePositiveInt(req.params.id, res);
  if (!listId) return;
  const list = await db.prepare('SELECT * FROM travel_lists WHERE id = ? AND user_id = ?').get(listId, req.user.id);
  if (!list) return res.status(404).json({ error: 'Liste bulunamadı' });
  const shareToken = list.share_token || crypto.randomBytes(16).toString('hex');
  await db.prepare(`
    UPDATE travel_lists SET is_public = 1, share_token = ?, updated_at = datetime('now') WHERE id = ?
  `).run(shareToken, listId);
  const siteUrl = (process.env.SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
  res.json({
    ok: true,
    shareToken,
    publicUrl: `${siteUrl}/api/travel-lists/public/${shareToken}`,
  });
});

router.get('/:id', authRequired, async (req, res) => {
  const listId = parsePositiveInt(req.params.id, res);
  if (!listId) return;
  const list = await db.prepare('SELECT * FROM travel_lists WHERE id = ? AND user_id = ?').get(listId, req.user.id);
  if (!list) return res.status(404).json({ error: 'Liste bulunamadı' });
  const items = await db.prepare(`
    SELECT p.*, tli.note, tli.sort_order FROM travel_list_items tli
    JOIN places p ON p.id = tli.place_id WHERE tli.list_id = ? ORDER BY tli.sort_order, tli.added_at
  `).all(list.id);
  res.json({
    list: {
      id: list.id,
      name: list.name,
      description: list.description,
      isPublic: !!list.is_public,
      shareToken: list.share_token || null,
    },
    places: await Promise.all(items.map((r) => mapPlace(r))),
  });
});

router.post('/:id/items', authRequired, async (req, res) => {
  const listId = parsePositiveInt(req.params.id, res);
  if (!listId) return;
  const list = await db.prepare('SELECT id FROM travel_lists WHERE id = ? AND user_id = ?').get(listId, req.user.id);
  if (!list) return res.status(404).json({ error: 'Liste bulunamadı' });
  const { placeId, note } = req.body || {};
  const pid = Number(placeId);
  if (!Number.isFinite(pid)) return res.status(400).json({ error: 'Geçersiz placeId' });
  const max = (await db.prepare('SELECT COALESCE(MAX(sort_order),0) AS m FROM travel_list_items WHERE list_id = ?').get(list.id)).m;
  await db.prepare(`
    INSERT OR REPLACE INTO travel_list_items (list_id, place_id, note, sort_order) VALUES (?, ?, ?, ?)
  `).run(list.id, pid, note || null, max + 1);
  await db.prepare("UPDATE travel_lists SET updated_at = datetime('now') WHERE id = ?").run(list.id);
  res.json({ ok: true });
});

router.delete('/:id/items/:placeId', authRequired, async (req, res) => {
  const listId = parsePositiveInt(req.params.id, res);
  if (!listId) return;
  const pid = Number(req.params.placeId);
  if (!Number.isFinite(pid)) return res.status(400).json({ error: 'Geçersiz placeId' });
  const list = await db.prepare('SELECT id FROM travel_lists WHERE id = ? AND user_id = ?').get(listId, req.user.id);
  if (!list) return res.status(404).json({ error: 'Liste bulunamadı' });
  await db.prepare('DELETE FROM travel_list_items WHERE list_id = ? AND place_id = ?').run(list.id, pid);
  res.json({ ok: true });
});

router.delete('/:id', authRequired, async (req, res) => {
  const listId = parsePositiveInt(req.params.id, res);
  if (!listId) return;
  const list = await db.prepare('SELECT id FROM travel_lists WHERE id = ? AND user_id = ?').get(listId, req.user.id);
  if (!list) return res.status(404).json({ error: 'Liste bulunamadı' });
  await db.prepare('DELETE FROM travel_list_items WHERE list_id = ?').run(list.id);
  await db.prepare('DELETE FROM travel_lists WHERE id = ?').run(list.id);
  res.json({ ok: true });
});

module.exports = router;
