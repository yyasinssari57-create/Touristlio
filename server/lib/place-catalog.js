/**
 * V6 Adım 10 — Admin katalog sayaçları + satır «yayına hazır değil» nedenleri.
 * İçerik üretmez; sadece görünürlük / filtre.
 */
const { db } = require('../db');
const {
  missingPublishFields,
  fieldLabels,
  hasPublishCoords,
} = require('./publish-quality');
const {
  isQualityPlaceDescription,
  placeImageVerified,
  isValidPlaceCoord,
} = require('./place-indexable');
const { PLACE_EN_MISSING_SQL } = require('./place-i18n');
const { TRASH_RETENTION_DAYS, notDeletedPlaceSql } = require('./place-trash');

/** SQL: enlem/boylam yok, 0 veya aralık dışı (Null Island dahil). */
const INVALID_COORDS_SQL = `(
  lat IS NULL OR lng IS NULL
  OR lat = 0 OR lng = 0
  OR ABS(lat) > 90 OR ABS(lng) > 180
)`;

/** Kaynak URL yok ve doğrulama tarihi yok. */
const MISSING_SOURCE_SQL = `(
  btrim(COALESCE(info_source_url, '')) = ''
  AND info_verified_at IS NULL
)`;

const UNVERIFIED_IMAGE_SQL = 'image_verified IS NOT TRUE';

/**
 * Liste filtreleri (issue=…). Status ayrı query param.
 * Eski noCoords anahtarı geçersiz koordinat ile aynı SQL'e bağlanır.
 */
const CATALOG_ISSUE_FILTERS = {
  unverifiedImage: UNVERIFIED_IMAGE_SQL,
  missingSource: MISSING_SOURCE_SQL,
  invalidCoords: INVALID_COORDS_SQL,
  noCoords: INVALID_COORDS_SQL,
  enMissing: PLACE_EN_MISSING_SQL,
  noPhoto: "photos IS NULL OR photos = '[]' OR photos = ''",
  noFaq: "faq_tr IS NULL OR faq_tr = '[]'",
  shortDesc: 'length(COALESCE(description, \'\')) < 80',
};

const CATALOG_ISSUE_LABELS = {
  unverifiedImage: 'Görseli doğrulanmamış',
  missingSource: 'Kaynak/doğrulama eksik',
  invalidCoords: 'Koordinat geçersiz',
  enMissing: 'İngilizce eksik',
  noCoords: 'Koordinat geçersiz',
  noPhoto: 'Fotoğraf eksik',
  noFaq: 'FAQ eksik',
  shortDesc: 'Kısa açıklama',
};

const STATUS_COUNT_KEYS = ['published', 'draft', 'archived', 'trash'];

async function countWhere(whereSql) {
  const row = await db.prepare(`SELECT COUNT(*) AS c FROM places WHERE ${whereSql}`).get();
  return Number(row?.c) || 0;
}

/**
 * Admin strip sayaçları: durum + Adım 10 kalite filtreleri.
 * Çöp hariç kalite sayıları (aktif katalog).
 */
async function getCatalogCounts() {
  const alive = notDeletedPlaceSql('deleted_at');
  const published = await countWhere(`${alive} AND COALESCE(status, 'published') = 'published'`);
  const draft = await countWhere(`${alive} AND COALESCE(status, 'published') = 'draft'`);
  const archived = await countWhere(`${alive} AND COALESCE(status, 'published') = 'archived'`);
  const trash = await countWhere(`NOT (${alive})`);

  const issueBase = alive;
  const unverifiedImage = await countWhere(`${issueBase} AND (${UNVERIFIED_IMAGE_SQL})`);
  const missingSource = await countWhere(`${issueBase} AND (${MISSING_SOURCE_SQL})`);
  const invalidCoords = await countWhere(`${issueBase} AND (${INVALID_COORDS_SQL})`);
  const enMissing = await countWhere(`${issueBase} AND (${PLACE_EN_MISSING_SQL})`);

  return {
    status: { published, draft, archived, trash },
    issues: {
      unverifiedImage: { count: unverifiedImage, label: CATALOG_ISSUE_LABELS.unverifiedImage },
      missingSource: { count: missingSource, label: CATALOG_ISSUE_LABELS.missingSource },
      invalidCoords: { count: invalidCoords, label: CATALOG_ISSUE_LABELS.invalidCoords },
      enMissing: { count: enMissing, label: CATALOG_ISSUE_LABELS.enMissing },
    },
    trashRetentionDays: TRASH_RETENTION_DAYS,
  };
}

/** Çöpte kalan tam gün (0 = bugün/süresi dolmuş). */
function trashDaysLeft(deletedAt, retentionDays = TRASH_RETENTION_DAYS) {
  if (!deletedAt) return null;
  const deleted = deletedAt instanceof Date ? deletedAt : new Date(deletedAt);
  if (Number.isNaN(deleted.getTime())) return null;
  const days = Number(retentionDays);
  const retention = Number.isFinite(days) && days > 0 ? Math.floor(days) : TRASH_RETENTION_DAYS;
  const purgeAt = deleted.getTime() + retention * 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((purgeAt - Date.now()) / (24 * 60 * 60 * 1000)));
}

/**
 * publish-quality + place-indexable eksikleri (TR etiketleri).
 * İçerik uydurmaz; sadece mevcut kuralları listeler.
 */
function notReadyReasons(placeLike) {
  const src = placeLike || {};
  const labels = fieldLabels(missingPublishFields(src));
  const reasons = [...labels];

  // Index kapısı: TR blurb >50 (publish yalnızca «dolu» ister)
  if (isQualityPlaceDescription(src) === false) {
    const hasAny = String(src.description || src.overview || '').trim().length > 0;
    if (hasAny && !reasons.includes('açıklama (TR)')) {
      reasons.push('TR açıklama yetersiz (index)');
    }
  }

  // Index kapısı: imageVerified zorunlu (publish URL ile geçebilir)
  if (!placeImageVerified(src)) {
    const hasVerifiedLabel = reasons.includes('doğrulanmış görsel');
    if (!hasVerifiedLabel) reasons.push('görsel doğrulanmamış (index)');
  }

  // Koordinat: publish helper ile aynı kural (ek güvenlik)
  if (!hasPublishCoords(src.lat, src.lng) && !isValidPlaceCoord(src.lat, src.lng)) {
    if (!reasons.includes('koordinat')) reasons.push('koordinat');
  }

  return [...new Set(reasons)];
}

module.exports = {
  CATALOG_ISSUE_FILTERS,
  CATALOG_ISSUE_LABELS,
  STATUS_COUNT_KEYS,
  INVALID_COORDS_SQL,
  MISSING_SOURCE_SQL,
  UNVERIFIED_IMAGE_SQL,
  getCatalogCounts,
  trashDaysLeft,
  notReadyReasons,
};
