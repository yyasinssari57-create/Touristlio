const express = require('express');
const { db } = require('../db');
const { authRequired } = require('../middleware/auth');
const { mapPlaceRow } = require('../lib/place-map');
const { placeStats } = require('../db');

const router = express.Router();

function mapPlace(row) {
  return mapPlaceRow(row, placeStats(row.id));
}

router.get('/visited/all', authRequired, (req, res) => {
  const rows = db.prepare(`
    SELECT p.*, vp.visited_at, vp.note FROM visited_places vp
    JOIN places p ON p.id = vp.place_id WHERE vp.user_id = ? ORDER BY vp.visited_at DESC
  `).all(req.user.id);
  res.json({ places: rows.map((r) => ({ ...mapPlace(r), visitedAt: r.visited_at, visitNote: r.note })) });
});

router.get('/visited/stats', authRequired, (req, res) => {
  const total = db.prepare('SELECT COUNT(*) AS c FROM visited_places WHERE user_id = ?').get(req.user.id).c;
  const countries = db.prepare(`
    SELECT COUNT(DISTINCT p.country) AS c FROM visited_places vp JOIN places p ON p.id = vp.place_id WHERE vp.user_id = ?
  `).get(req.user.id).c;
  res.json({ totalVisited: total, countriesVisited: countries });
});

router.post('/visited', authRequired, (req, res) => {
  const { placeId, visitedAt, note } = req.body || {};
  if (!placeId) return res.status(400).json({ error: 'placeId gerekli' });
  db.prepare(`
    INSERT OR REPLACE INTO visited_places (user_id, place_id, visited_at, note) VALUES (?, ?, ?, ?)
  `).run(req.user.id, placeId, visitedAt || new Date().toISOString().slice(0, 10), note || null);
  res.json({ ok: true });
});

router.delete('/visited/:placeId', authRequired, (req, res) => {
  db.prepare('DELETE FROM visited_places WHERE user_id = ? AND place_id = ?').run(req.user.id, req.params.placeId);
  res.json({ ok: true });
});

router.get('/', authRequired, (req, res) => {
  const rows = db.prepare(`
    SELECT tl.*, (SELECT COUNT(*) FROM travel_list_items WHERE list_id = tl.id) AS item_count
    FROM travel_lists tl WHERE user_id = ? ORDER BY updated_at DESC
  `).all(req.user.id);
  res.json({ lists: rows.map((r) => ({
    id: r.id, name: r.name, description: r.description, isPublic: !!r.is_public,
    itemCount: r.item_count, createdAt: r.created_at, updatedAt: r.updated_at,
  })) });
});

router.post('/', authRequired, (req, res) => {
  const { name, description } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'Liste adı gerekli' });
  const info = db.prepare(`
    INSERT INTO travel_lists (user_id, name, description) VALUES (?, ?, ?)
  `).run(req.user.id, name.trim(), description || null);
  res.status(201).json({ id: info.lastInsertRowid, name: name.trim() });
});

router.get('/:id', authRequired, (req, res) => {
  const list = db.prepare('SELECT * FROM travel_lists WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!list) return res.status(404).json({ error: 'Liste bulunamadı' });
  const items = db.prepare(`
    SELECT p.*, tli.note, tli.sort_order FROM travel_list_items tli
    JOIN places p ON p.id = tli.place_id WHERE tli.list_id = ? ORDER BY tli.sort_order, tli.added_at
  `).all(list.id);
  res.json({
    list: { id: list.id, name: list.name, description: list.description },
    places: items.map(mapPlace),
  });
});

router.post('/:id/items', authRequired, (req, res) => {
  const list = db.prepare('SELECT id FROM travel_lists WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!list) return res.status(404).json({ error: 'Liste bulunamadı' });
  const { placeId, note } = req.body || {};
  if (!placeId) return res.status(400).json({ error: 'placeId gerekli' });
  const max = db.prepare('SELECT COALESCE(MAX(sort_order),0) AS m FROM travel_list_items WHERE list_id = ?').get(list.id).m;
  db.prepare(`
    INSERT OR REPLACE INTO travel_list_items (list_id, place_id, note, sort_order) VALUES (?, ?, ?, ?)
  `).run(list.id, placeId, note || null, max + 1);
  db.prepare("UPDATE travel_lists SET updated_at = datetime('now') WHERE id = ?").run(list.id);
  res.json({ ok: true });
});

router.delete('/:id/items/:placeId', authRequired, (req, res) => {
  const list = db.prepare('SELECT id FROM travel_lists WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!list) return res.status(404).json({ error: 'Liste bulunamadı' });
  db.prepare('DELETE FROM travel_list_items WHERE list_id = ? AND place_id = ?').run(list.id, req.params.placeId);
  res.json({ ok: true });
});

router.delete('/:id', authRequired, (req, res) => {
  const list = db.prepare('SELECT id FROM travel_lists WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!list) return res.status(404).json({ error: 'Liste bulunamadı' });
  db.prepare('DELETE FROM travel_list_items WHERE list_id = ?').run(list.id);
  db.prepare('DELETE FROM travel_lists WHERE id = ?').run(list.id);
  res.json({ ok: true });
});

module.exports = router;
