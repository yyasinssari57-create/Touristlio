const crypto = require('crypto');
const { db } = require('../../db');

const VALID_EVENTS = new Set(['page_view', 'tab_click', 'heartbeat', 'session_end']);
const VALID_TABS = new Set(['explore', 'places', 'blog', 'profile', 'detail']);

const TAB_LABELS = {
  explore: 'Keşfet',
  places: 'Gezilecek Yerler',
  blog: 'Blog',
  profile: 'Profil',
  detail: 'Detay',
};

function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000,
    secure: process.env.NODE_ENV === 'production',
  };
}

function ensureSessionId(req, res) {
  let sid = req.cookies?.tl_sid;
  if (!sid || typeof sid !== 'string' || sid.length < 16 || sid.length > 64) {
    sid = crypto.randomUUID();
    res.cookie('tl_sid', sid, sessionCookieOptions());
  }
  return sid;
}

function upsertSession(sessionId, userId) {
  const existing = db.prepare(
    'SELECT id FROM analytics_sessions WHERE session_id = ?',
  ).get(sessionId);

  if (!existing) {
    db.prepare(`
      INSERT INTO analytics_sessions (session_id, user_id, started_at, last_seen_at)
      VALUES (?, ?, datetime('now'), datetime('now'))
    `).run(sessionId, userId);
    return;
  }

  db.prepare(`
    UPDATE analytics_sessions
    SET last_seen_at = datetime('now'),
        user_id = COALESCE(?, user_id)
    WHERE session_id = ?
  `).run(userId, sessionId);
}

function updateSessionDuration(sessionId, endSession) {
  const row = db.prepare(
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
    db.prepare(`
      UPDATE analytics_sessions
      SET duration_sec = ?, last_seen_at = datetime('now'), ended_at = datetime('now')
      WHERE session_id = ?
    `).run(durationSec, sessionId);
    return;
  }

  db.prepare(`
    UPDATE analytics_sessions
    SET duration_sec = ?, last_seen_at = datetime('now')
    WHERE session_id = ?
  `).run(durationSec, sessionId);
}

function trackEvent(req, res, payload) {
  const type = String(payload?.type || '').trim();
  if (!VALID_EVENTS.has(type)) {
    const err = new Error('Geçersiz olay türü');
    err.status = 400;
    throw err;
  }

  const tab = payload?.tab ? String(payload.tab).trim() : null;
  if (tab && !VALID_TABS.has(tab)) {
    const err = new Error('Geçersiz sekme');
    err.status = 400;
    throw err;
  }

  const path = payload?.path ? String(payload.path).slice(0, 512) : null;
  const sessionId = ensureSessionId(req, res);
  const userId = req.user?.id || null;

  upsertSession(sessionId, userId);

  if (type === 'heartbeat' || type === 'session_end') {
    updateSessionDuration(sessionId, type === 'session_end');
  }

  if (type === 'page_view' || type === 'tab_click') {
    db.prepare(
      'UPDATE analytics_sessions SET page_views = page_views + 1 WHERE session_id = ?',
    ).run(sessionId);
  }

  if (type !== 'heartbeat') {
    db.prepare(`
      INSERT INTO analytics_events (session_id, user_id, event_type, tab, path)
      VALUES (?, ?, ?, ?, ?)
    `).run(sessionId, userId, type, tab, path);
  }

  return { ok: true };
}

function analyticsTablesReady() {
  const count = db.prepare(
    "SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name IN ('analytics_sessions', 'analytics_events')",
  ).get().c;
  return count === 2;
}

function emptyVisitorDashboard() {
  const days = [];
  for (let i = 6; i >= 0; i -= 1) {
    days.push(db.prepare(`SELECT date('now', '-' || ? || ' days') AS day`).get(i).day);
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

function visitorDashboard() {
  if (!analyticsTablesReady()) return emptyVisitorDashboard();

  const onlineNow = db.prepare(`
    SELECT COUNT(*) AS c FROM analytics_sessions
    WHERE datetime(last_seen_at) >= datetime('now', '-5 minutes')
      AND (ended_at IS NULL OR datetime(ended_at) >= datetime('now', '-5 minutes'))
  `).get().c;

  const todayPageViews = db.prepare(`
    SELECT COUNT(*) AS c FROM analytics_events
    WHERE event_type IN ('page_view', 'tab_click')
      AND date(created_at) = date('now')
  `).get().c;

  const todayUniqueVisitors = db.prepare(`
    SELECT COUNT(DISTINCT session_id) AS c FROM analytics_events
    WHERE date(created_at) = date('now')
  `).get().c;

  const avgRow = db.prepare(`
    SELECT AVG(duration_sec) AS avgSec FROM analytics_sessions
    WHERE date(started_at) = date('now') AND duration_sec > 0
  `).get();
  const todayAvgDurationSec = Math.round(avgRow?.avgSec || 0);

  const memberGuest = db.prepare(`
    SELECT
      SUM(CASE WHEN user_id IS NOT NULL THEN 1 ELSE 0 END) AS members,
      SUM(CASE WHEN user_id IS NULL THEN 1 ELSE 0 END) AS guests
    FROM analytics_sessions
    WHERE date(started_at) = date('now')
  `).get();

  const members = memberGuest?.members || 0;
  const guests = memberGuest?.guests || 0;
  const memberGuestTotal = members + guests;

  const topTabsRaw = db.prepare(`
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
    days.push(db.prepare(`SELECT date('now', '-' || ? || ' days') AS day`).get(i).day);
  }

  const visitsByDay = db.prepare(`
    SELECT date(created_at) AS day, COUNT(*) AS c FROM analytics_events
    WHERE event_type IN ('page_view', 'tab_click')
      AND date(created_at) >= date('now', '-6 days')
    GROUP BY date(created_at)
  `).all();
  const visitorsByDay = db.prepare(`
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
