const crypto = require('crypto');
const { db } = require('../../db');
const { sessionCookieOptions } = require('../../lib/cookie-opts');

const VALID_EVENTS = new Set(['page_view', 'tab_click', 'heartbeat', 'session_end', 'web_vital']);
const VALID_TABS = new Set(['explore', 'places', 'blog', 'profile', 'detail']);
const VALID_VITALS = new Set(['CLS', 'INP', 'LCP', 'FCP', 'TTFB']);

const TAB_LABELS = {
  explore: 'Keşfet',
  places: 'Gezilecek Yerler',
  blog: 'Blog',
  profile: 'Profil',
  detail: 'Detay',
};

function ensureSessionId(req, res) {
  let sid = req.cookies?.tl_sid;
  if (!sid || typeof sid !== 'string' || sid.length < 16 || sid.length > 64) {
    sid = crypto.randomUUID();
    res.cookie('tl_sid', sid, sessionCookieOptions());
  }
  return sid;
}

async function upsertSession(sessionId, userId) {
  // Concurrent POST /track used to SELECT then INSERT; UNIQUE became an unhandledRejection and start-prod exited.
  await db.prepare(`
    INSERT INTO analytics_sessions (session_id, user_id, started_at, last_seen_at)
    VALUES (?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(session_id) DO UPDATE SET
      last_seen_at = datetime('now'),
      user_id = COALESCE(excluded.user_id, analytics_sessions.user_id)
  `).run(sessionId, userId);
}

async function updateSessionDuration(sessionId, endSession) {
  const row = await db.prepare(
    'SELECT started_at FROM analytics_sessions WHERE session_id = ?',
  ).get(sessionId);
  if (!row) return;

  const raw = String(row.started_at).trim();
  const iso = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const startedMs = Date.parse(iso.endsWith('Z') ? iso : `${iso}Z`);
  const durationSec = Number.isNaN(startedMs)
    ? 0
    : Math.max(0, Math.floor((Date.now() - startedMs) / 1000));

  if (endSession) {
    await db.prepare(`
      UPDATE analytics_sessions
      SET duration_sec = ?, last_seen_at = datetime('now'), ended_at = datetime('now')
      WHERE session_id = ?
    `).run(durationSec, sessionId);
    return;
  }

  await db.prepare(`
    UPDATE analytics_sessions
    SET duration_sec = ?, last_seen_at = datetime('now')
    WHERE session_id = ?
  `).run(durationSec, sessionId);
}

function hasAnalyticsConsent(req) {
  return req.cookies?.tl_cookie_ok === '1';
}

async function trackEvent(req, res, payload) {
  if (!hasAnalyticsConsent(req)) {
    return { ok: true, stored: false };
  }

  const type = String(payload?.type || '').trim();
  if (!VALID_EVENTS.has(type)) {
    const err = new Error('Geçersiz olay türü');
    err.status = 400;
    throw err;
  }

  const tab = payload?.tab ? String(payload.tab).trim() : null;
  if (type === 'web_vital') {
    if (!tab || !VALID_VITALS.has(tab)) {
      const err = new Error('Geçersiz web vital');
      err.status = 400;
      throw err;
    }
  } else if (tab && !VALID_TABS.has(tab)) {
    const err = new Error('Geçersiz sekme');
    err.status = 400;
    throw err;
  }

  const path = payload?.path ? String(payload.path).slice(0, 512) : null;
  const sessionId = ensureSessionId(req, res);
  const userId = req.user?.id || null;

  await upsertSession(sessionId, userId);

  if (type === 'heartbeat' || type === 'session_end') {
    await updateSessionDuration(sessionId, type === 'session_end');
  }

  if (type === 'page_view' || type === 'tab_click') {
    await db.prepare(
      'UPDATE analytics_sessions SET page_views = page_views + 1 WHERE session_id = ?',
    ).run(sessionId);
  }

  if (type !== 'heartbeat') {
    await db.prepare(`
      INSERT INTO analytics_events (session_id, user_id, event_type, tab, path)
      VALUES (?, ?, ?, ?, ?)
    `).run(sessionId, userId, type, tab, path);
  }

  return { ok: true, stored: true };
}

async function analyticsTablesReady() {
  const count = (await db.prepare(
    `SELECT COUNT(*) AS c FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name IN ('analytics_sessions', 'analytics_events')`,
  ).get()).c;
  return count === 2;
}

async function emptyVisitorDashboard() {
  const days = [];
  for (let i = 6; i >= 0; i -= 1) {
    days.push((await db.prepare(`SELECT date('now', '-' || ? || ' days') AS day`).get(i)).day);
  }
  return {
    onlineNow: 0,
    todayPageViews: 0,
    todayUniqueVisitors: 0,
    todayAvgDurationSec: 0,
    todayAvgDurationLabel: '0 sn',
    members: 0,
    guests: 0,
    memberPercent: 0,
    guestPercent: 0,
    topTabs: [],
    timeseries: { days, visits: days.map(() => 0), visitors: days.map(() => 0) },
    updatedAt: new Date().toISOString(),
  };
}

function formatDuration(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  if (s < 60) return `${s} sn`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m < 60) return r ? `${m} dk ${r} sn` : `${m} dk`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h} sa ${rm} dk` : `${h} sa`;
}

async function visitorDashboard() {
  if (!(await analyticsTablesReady())) return emptyVisitorDashboard();

  const onlineNow = (await db.prepare(`
    SELECT COUNT(*) AS c FROM analytics_sessions
    WHERE last_seen_at >= datetime('now', '-5 minutes')
      AND (ended_at IS NULL OR ended_at >= datetime('now', '-5 minutes'))
  `).get()).c;

  const todayPageViews = (await db.prepare(`
    SELECT COUNT(*) AS c FROM analytics_events
    WHERE event_type IN ('page_view', 'tab_click')
      AND date(created_at) = date('now')
  `).get()).c;

  const todayUniqueVisitors = (await db.prepare(`
    SELECT COUNT(DISTINCT session_id) AS c FROM analytics_events
    WHERE date(created_at) = date('now')
  `).get()).c;

  const avgRow = await db.prepare(`
    SELECT AVG(duration_sec) AS avgSec FROM analytics_sessions
    WHERE date(started_at) = date('now') AND duration_sec > 0
  `).get();
  const todayAvgDurationSec = Math.round(avgRow?.avgSec || 0);

  const memberGuest = await db.prepare(`
    SELECT
      SUM(CASE WHEN user_id IS NOT NULL THEN 1 ELSE 0 END) AS members,
      SUM(CASE WHEN user_id IS NULL THEN 1 ELSE 0 END) AS guests
    FROM analytics_sessions
    WHERE date(started_at) = date('now')
  `).get();

  const members = memberGuest?.members || 0;
  const guests = memberGuest?.guests || 0;
  const memberGuestTotal = members + guests;

  const topTabsRaw = await db.prepare(`
    SELECT tab, COUNT(*) AS c FROM analytics_events
    WHERE event_type = 'tab_click'
      AND tab IS NOT NULL
      AND date(created_at) >= date('now', '-7 days')
    GROUP BY tab
    ORDER BY c DESC
    LIMIT 8
  `).all();

  const topTabs = topTabsRaw.map((row) => ({
    tab: row.tab,
    label: TAB_LABELS[row.tab] || row.tab,
    count: row.c,
  }));

  const days = [];
  for (let i = 6; i >= 0; i -= 1) {
    days.push((await db.prepare(`SELECT date('now', '-' || ? || ' days') AS day`).get(i)).day);
  }

  const visitsByDay = await db.prepare(`
    SELECT date(created_at) AS day, COUNT(*) AS c FROM analytics_events
    WHERE event_type IN ('page_view', 'tab_click')
      AND date(created_at) >= date('now', '-6 days')
    GROUP BY date(created_at)
  `).all();
  const visitorsByDay = await db.prepare(`
    SELECT date(created_at) AS day, COUNT(DISTINCT session_id) AS c FROM analytics_events
    WHERE date(created_at) >= date('now', '-6 days')
    GROUP BY date(created_at)
  `).all();

  const visitMap = Object.fromEntries(visitsByDay.map((r) => [r.day, r.c]));
  const visitorMap = Object.fromEntries(visitorsByDay.map((r) => [r.day, r.c]));

  return {
    onlineNow,
    todayPageViews,
    todayUniqueVisitors,
    todayAvgDurationSec,
    todayAvgDurationLabel: formatDuration(todayAvgDurationSec),
    members,
    guests,
    memberPercent: memberGuestTotal ? Math.round((members / memberGuestTotal) * 100) : 0,
    guestPercent: memberGuestTotal ? Math.round((guests / memberGuestTotal) * 100) : 0,
    topTabs,
    timeseries: {
      days,
      visits: days.map((d) => visitMap[d] || 0),
      visitors: days.map((d) => visitorMap[d] || 0),
    },
    updatedAt: new Date().toISOString(),
  };
}

module.exports = { trackEvent, visitorDashboard, TAB_LABELS };
