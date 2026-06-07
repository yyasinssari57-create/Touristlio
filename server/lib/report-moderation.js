const { db } = require('../db');
const notifications = require('./notifications');
const { sendTiolaRejectionEmail, sendBlogRejectionEmail } = require('./mailer');

const REPORT_STATUSES = {
  PENDING: 'pending',
  REVIEWED: 'reviewed',
  RESOLVED_DISMISSED: 'resolved_dismissed',
  RESOLVED_REMOVED: 'resolved_removed',
};

const RESOLVED_STATUSES = [
  REPORT_STATUSES.RESOLVED_DISMISSED,
  REPORT_STATUSES.RESOLVED_REMOVED,
  'dismissed',
  'actioned',
];

function normalizeReportStatus(status) {
  if (status === 'dismissed') return REPORT_STATUSES.RESOLVED_DISMISSED;
  if (status === 'actioned') return REPORT_STATUSES.RESOLVED_REMOVED;
  return status;
}

function isResolvedStatus(status) {
  return RESOLVED_STATUSES.includes(status);
}

function getTargetContent(targetType, targetId) {
  if (targetType === 'profile') {
    const u = db.prepare('SELECT id, name, email, is_blocked FROM users WHERE id = ?').get(targetId);
    if (!u) return null;
    return {
      type: 'profile',
      id: u.id,
      status: u.is_blocked ? 'blocked' : 'active',
      userId: u.id,
      userEmail: u.email,
      userName: u.name,
      label: u.name,
      preview: `Profil: ${u.name}`,
    };
  }
  if (targetType === 'tiola') {
    const t = db.prepare(`
      SELECT t.id, t.text, t.status, t.user_id, t.city_tag, u.email AS user_email, u.name AS user_name,
             p.name AS place_name
      FROM tiolas t
      JOIN users u ON u.id = t.user_id
      LEFT JOIN places p ON p.id = t.place_id
      WHERE t.id = ?
    `).get(targetId);
    if (!t) return null;
    const placeLabel = t.place_name || t.city_tag || 'Genel Tiola';
    return {
      type: 'tiola',
      id: t.id,
      status: t.status,
      userId: t.user_id,
      userEmail: t.user_email,
      userName: t.user_name,
      label: (t.text || '').slice(0, 60) + ((t.text || '').length > 60 ? '…' : ''),
      preview: t.text || '',
      placeLabel,
    };
  }
  if (targetType === 'blog') {
    const b = db.prepare(`
      SELECT b.id, b.title, b.excerpt, b.status, b.user_id, u.email AS user_email, u.name AS user_name
      FROM blogs b
      JOIN users u ON u.id = b.user_id
      WHERE b.id = ?
    `).get(targetId);
    if (!b) return null;
    return {
      type: 'blog',
      id: b.id,
      status: b.status,
      userId: b.user_id,
      userEmail: b.user_email,
      userName: b.user_name,
      label: b.title || `#${b.id}`,
      preview: b.excerpt || b.title || '',
    };
  }
  return null;
}

async function notifyContentOwnerRemoved(content, reason) {
  const siteUrl = (process.env.SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
  const reportSuffix = ' Şikayet incelemesi sonucunda kaldırıldı.';

  if (content.type === 'tiola') {
    const placeLabel = content.placeLabel || 'Genel Tiola';
    notifications.createNotification({
      userId: content.userId,
      type: 'tiola_removed',
      title: 'Tiola kaldırıldı',
      body: `${placeLabel}: ${reason}${reportSuffix}`,
      link: '/profile',
    });
    try {
      await sendTiolaRejectionEmail(content.userEmail, {
        userName: content.userName,
        placeName: placeLabel,
        reason: `${reason} (şikayet incelemesi)`,
        profileUrl: `${siteUrl}/profile`,
      });
    } catch {
      /* e-posta isteğe bağlı */
    }
    return;
  }

  if (content.type === 'blog') {
    notifications.createNotification({
      userId: content.userId,
      type: 'blog_removed',
      title: 'Blog kaldırıldı',
      body: `${content.label}: ${reason}${reportSuffix}`,
      link: '/profile',
    });
    try {
      await sendBlogRejectionEmail(content.userEmail, {
        userName: content.userName,
        title: content.label,
        reason: `${reason} (şikayet incelemesi)`,
        profileUrl: `${siteUrl}/profile`,
      });
    } catch {
      /* e-posta isteğe bağlı */
    }
  }
}

function removeReportedContent(content, adminId, reason) {
  if (content.type === 'profile') {
    return { ok: false, error: 'Profil şikayetleri için içerik kaldırma uygulanamaz. Kullanıcılar sekmesinden işlem yapın.' };
  }

  const prevStatus = content.status;

  if (content.type === 'tiola') {
    if (content.status === 'approved') {
      db.prepare(`
        UPDATE tiolas SET status = 'rejected', moderated_by = ?, moderated_at = datetime('now'), rejection_reason = ?
        WHERE id = ? AND status = 'approved'
      `).run(adminId, reason, content.id);
    } else if (['pending', 'spam'].includes(content.status)) {
      db.prepare(`
        UPDATE tiolas SET status = 'rejected', moderated_by = ?, moderated_at = datetime('now'), rejection_reason = ?
        WHERE id = ? AND status IN ('pending', 'spam')
      `).run(adminId, reason, content.id);
    } else if (content.status === 'rejected') {
      return { ok: true, prevStatus, alreadyRemoved: true };
    } else {
      return { ok: false, error: 'Bu Tiola kaldırılamaz (durum: ' + content.status + ')' };
    }
    return { ok: true, prevStatus };
  }

  if (content.type === 'blog') {
    if (content.status === 'approved') {
      db.prepare(`
        UPDATE blogs SET status = 'rejected', moderated_by = ?, moderated_at = datetime('now'),
          rejection_reason = ?, published_at = NULL
        WHERE id = ? AND status = 'approved'
      `).run(adminId, reason, content.id);
    } else if (content.status === 'pending') {
      db.prepare(`
        UPDATE blogs SET status = 'rejected', moderated_by = ?, moderated_at = datetime('now'), rejection_reason = ?
        WHERE id = ? AND status = 'pending'
      `).run(adminId, reason, content.id);
    } else if (content.status === 'rejected') {
      return { ok: true, prevStatus, alreadyRemoved: true };
    } else {
      return { ok: false, error: 'Bu blog kaldırılamaz (durum: ' + content.status + ')' };
    }
    return { ok: true, prevStatus };
  }

  return { ok: false, error: 'Geçersiz hedef türü' };
}

function restoreReportedContent(report) {
  if (!report.content_prev_status || report.action_taken !== 'content_removed') {
    return { ok: true, restored: false };
  }
  const content = getTargetContent(report.target_type, report.target_id);
  if (!content || content.type === 'profile') {
    return { ok: true, restored: false };
  }

  if (content.status !== 'rejected') {
    return { ok: true, restored: false };
  }

  const prev = report.content_prev_status;
  if (content.type === 'tiola') {
    if (prev === 'approved') {
      db.prepare(`
        UPDATE tiolas SET status = 'approved', moderated_by = NULL, moderated_at = NULL, rejection_reason = NULL
        WHERE id = ? AND status = 'rejected'
      `).run(content.id);
      return { ok: true, restored: true };
    }
    if (['pending', 'spam'].includes(prev)) {
      db.prepare(`
        UPDATE tiolas SET status = ?, moderated_by = NULL, moderated_at = NULL, rejection_reason = NULL
        WHERE id = ? AND status = 'rejected'
      `).run(prev, content.id);
      return { ok: true, restored: true };
    }
  }

  if (content.type === 'blog') {
    if (prev === 'approved') {
      db.prepare(`
        UPDATE blogs SET status = 'approved', moderated_by = NULL, moderated_at = NULL, rejection_reason = NULL,
          published_at = COALESCE(published_at, datetime('now'))
        WHERE id = ? AND status = 'rejected'
      `).run(content.id);
      return { ok: true, restored: true };
    }
    if (prev === 'pending') {
      db.prepare(`
        UPDATE blogs SET status = 'pending', moderated_by = NULL, moderated_at = NULL, rejection_reason = NULL
        WHERE id = ? AND status = 'rejected'
      `).run(content.id);
      return { ok: true, restored: true };
    }
  }

  return { ok: true, restored: false };
}

function clearReportResolution(id) {
  db.prepare(`
    UPDATE reports
    SET status = ?, resolved_by = NULL, resolved_at = NULL,
        resolution_reason = NULL, action_taken = NULL, content_prev_status = NULL
    WHERE id = ?
  `).run(REPORT_STATUSES.PENDING, id);
}

function setReportDismissed(id, adminId, note) {
  db.prepare(`
    UPDATE reports
    SET status = ?, action_taken = 'dismissed', resolution_reason = ?,
        resolved_by = ?, resolved_at = datetime('now'), content_prev_status = NULL
    WHERE id = ?
  `).run(REPORT_STATUSES.RESOLVED_DISMISSED, note || null, adminId, id);
}

function setReportRemoved(id, adminId, reason, prevStatus) {
  db.prepare(`
    UPDATE reports
    SET status = ?, action_taken = 'content_removed', resolution_reason = ?,
        resolved_by = ?, resolved_at = datetime('now'), content_prev_status = ?
    WHERE id = ?
  `).run(REPORT_STATUSES.RESOLVED_REMOVED, reason, adminId, prevStatus, id);
}

module.exports = {
  REPORT_STATUSES,
  RESOLVED_STATUSES,
  normalizeReportStatus,
  isResolvedStatus,
  getTargetContent,
  removeReportedContent,
  restoreReportedContent,
  notifyContentOwnerRemoved,
  clearReportResolution,
  setReportDismissed,
  setReportRemoved,
};
