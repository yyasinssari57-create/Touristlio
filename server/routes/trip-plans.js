const express = require('express');
const crypto = require('crypto');
const { db, placeStats } = require('../db');
const { authRequired, authOptional } = require('../middleware/auth');
const { parsePositiveInt } = require('../lib/sanitize');
const { mapPlaceRow } = require('../lib/place-map');
const { findNearbyPlaces } = require('../lib/geo');
const { findNearbyPlacesSql } = require('../lib/place-geom');

const router = express.Router();

async function loadTripFull(tripId) {
  const trip = await db.prepare('SELECT * FROM trip_plans WHERE id = ?').get(tripId);
  if (!trip) return null;
  const days = await db.prepare('SELECT * FROM trip_plan_days WHERE trip_id = ? ORDER BY day_number').all(tripId);
  const daysFull = [];
  for (const d of days) {
    const items = await db.prepare(`
      SELECT tpi.*, p.name, p.city, p.country, p.category, p.lat, p.lng, p.image_url
      FROM trip_plan_items tpi LEFT JOIN places p ON p.id = tpi.place_id
      WHERE tpi.day_id = ? ORDER BY tpi.sort_order
    `).all(d.id);
    daysFull.push({ ...d, items });
  }
  let meta = {};
  try { meta = JSON.parse(trip.meta || '{}'); } catch { /* ignore */ }
  return { ...trip, meta, days: daysFull };
}

function canViewTrip(trip, user) {
  if (!trip) return false;
  if (user && trip.user_id === user.id) return true;
  if (trip.visibility === 'public') return true;
  if (trip.visibility === 'link') return true;
  return false;
}

async function mapPlace(row) {
  return mapPlaceRow(row, await placeStats(row.id));
}

router.get('/mine', authRequired, async (req, res) => {
  const rows = await db.prepare(`
    SELECT id, name, city, country, start_date, end_date, status, visibility, updated_at
    FROM trip_plans WHERE user_id = ? ORDER BY updated_at DESC
  `).all(req.user.id);
  res.json({ trips: rows });
});

router.post('/', authRequired, async (req, res) => {
  const b = req.body || {};
  if (!b.name?.trim()) return res.status(400).json({ error: 'Plan adı gerekli' });
  const shareToken = crypto.randomBytes(16).toString('hex');
  const info = await db.prepare(`
    INSERT INTO trip_plans (user_id, name, country, city, start_date, end_date, travelers, trip_type, budget, transport, visibility, share_token, meta)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.user.id, b.name.trim(), b.country || null, b.city || null,
    b.startDate || null, b.endDate || null, b.travelers || 1,
    b.tripType || null, b.budget || null, b.transport || null,
    b.visibility || 'private', shareToken, JSON.stringify(b.meta || {}),
  );
  const dayCount = Math.max(1, Number(b.days) || 1);
  for (let i = 1; i <= dayCount; i++) {
    await db.prepare('INSERT INTO trip_plan_days (trip_id, day_number, title) VALUES (?, ?, ?)').run(info.lastInsertRowid, i, `Gün ${i}`);
  }
  res.status(201).json({ id: info.lastInsertRowid, shareToken });
});

router.get('/suggest/nearby', authOptional, async (req, res) => {
  const { placeId, city, limit } = req.query;
  const all = await db.prepare('SELECT * FROM places').all();
  let origin = placeId ? await db.prepare('SELECT * FROM places WHERE id = ?').get(placeId) : null;
  if (!origin && city) origin = all.find((r) => r.city?.toLowerCase().includes(String(city).toLowerCase()));
  if (!origin) return res.json({ places: all.slice(0, Number(limit) || 6).map(mapPlace) });
  const nearby = (await findNearbyPlacesSql(origin, mapPlace, Number(limit) || 6))
    || findNearbyPlaces(all, origin, mapPlace, Number(limit) || 6);
  res.json({ places: nearby });
});

router.post('/auto-generate', authRequired, async (req, res) => {
  const { city, days, budget, interest } = req.body || {};
  if (!city) return res.status(400).json({ error: 'Şehir gerekli' });
  const dayCount = Math.max(1, Math.min(14, Number(days) || 3));
  const all = await db.prepare('SELECT * FROM places').all();
  const cityNorm = String(city).toLowerCase();
  let pool = all.filter((r) => r.city?.toLowerCase().includes(cityNorm));
  if (interest && interest !== 'all') {
    pool = pool.filter((r) => r.category === interest || JSON.parse(r.categories || '[]').includes(interest));
  }
  pool.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
  const perDay = budget === 'low' ? 3 : budget === 'high' ? 5 : 4;
  const daysArr = [];
  let idx = 0;
  for (let d = 1; d <= dayCount; d++) {
    const items = [];
    for (let i = 0; i < perDay && idx < pool.length; i++, idx++) {
      items.push({ placeId: pool[idx].id, sortOrder: i });
    }
    daysArr.push({ dayNumber: d, title: `Gün ${d}`, items });
  }
  res.json({ city, days: daysArr, placeCount: idx });
});

router.get('/share/:token', authOptional, async (req, res) => {
  const trip = await db.prepare('SELECT * FROM trip_plans WHERE share_token = ?').get(req.params.token);
  if (!canViewTrip(trip, req.user)) return res.status(404).json({ error: 'Plan bulunamadı' });
  res.json({ trip: loadTripFull(trip.id) });
});

router.get('/:id', authOptional, async (req, res) => {
  const tripId = parsePositiveInt(req.params.id, res);
  if (!tripId) return;
  const trip = await db.prepare('SELECT * FROM trip_plans WHERE id = ?').get(tripId);
  if (!canViewTrip(trip, req.user)) return res.status(404).json({ error: 'Plan bulunamadı' });
  res.json({ trip: loadTripFull(trip.id) });
});

router.put('/:id', authRequired, async (req, res) => {
  const tripId = parsePositiveInt(req.params.id, res);
  if (!tripId) return;
  const trip = await db.prepare('SELECT * FROM trip_plans WHERE id = ? AND user_id = ?').get(tripId, req.user.id);
  if (!trip) return res.status(404).json({ error: 'Plan bulunamadı' });
  const b = req.body || {};
  await db.prepare(`
    UPDATE trip_plans SET name=?, country=?, city=?, start_date=?, end_date=?, travelers=?, trip_type=?, budget=?, transport=?, visibility=?, meta=?, updated_at=datetime('now')
    WHERE id=?
  `).run(
    b.name || trip.name, b.country ?? trip.country, b.city ?? trip.city,
    b.startDate ?? trip.start_date, b.endDate ?? trip.end_date,
    b.travelers ?? trip.travelers, b.tripType ?? trip.trip_type,
    b.budget ?? trip.budget, b.transport ?? trip.transport,
    b.visibility ?? trip.visibility, JSON.stringify(b.meta || JSON.parse(trip.meta || '{}')),
    trip.id,
  );
  if (Array.isArray(b.days)) {
    await db.prepare('DELETE FROM trip_plan_items WHERE day_id IN (SELECT id FROM trip_plan_days WHERE trip_id = ?)').run(trip.id);
    await db.prepare('DELETE FROM trip_plan_days WHERE trip_id = ?').run(trip.id);
    for (const [idx, day] of b.days.entries()) {
      const dInfo = await db.prepare('INSERT INTO trip_plan_days (trip_id, day_number, title, date) VALUES (?, ?, ?, ?)').run(
        trip.id, idx + 1, day.title || `Gün ${idx + 1}`, day.date || null,
      );
      for (const [si, item] of (day.items || []).entries()) {
        await db.prepare('INSERT INTO trip_plan_items (day_id, place_id, sort_order, start_time, note) VALUES (?, ?, ?, ?, ?)').run(
          dInfo.lastInsertRowid, item.placeId || null, si, item.startTime || null, item.note || null,
        );
      }
    }
  }
  res.json({ ok: true, trip: await loadTripFull(trip.id) });
});

router.delete('/:id', authRequired, async (req, res) => {
  const tripId = parsePositiveInt(req.params.id, res);
  if (!tripId) return;
  const trip = await db.prepare('SELECT id FROM trip_plans WHERE id = ? AND user_id = ?').get(tripId, req.user.id);
  if (!trip) return res.status(404).json({ error: 'Plan bulunamadı' });
  await db.prepare('DELETE FROM trip_plan_items WHERE day_id IN (SELECT id FROM trip_plan_days WHERE trip_id = ?)').run(trip.id);
  await db.prepare('DELETE FROM trip_plan_days WHERE trip_id = ?').run(trip.id);
  await db.prepare('DELETE FROM trip_plans WHERE id = ?').run(trip.id);
  res.json({ ok: true });
});

module.exports = router;
