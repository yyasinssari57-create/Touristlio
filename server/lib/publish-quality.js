/**
 * V4 Adım 6 — yayın kalite kapısı.
 * Yeni yayın (taslak/arşiv → yayında, ya da yeni kayıt doğrudan yayında) eksikse reddedilir.
 * Zaten yayında olan kayıt bu kapıdan geçmez: düzenlenebilir, kendiliğinden taslağa çekilmez.
 * İngilizce alanlar zorunlu değil (Adım 8).
 * Doğrulanmış görsel: Adım 7 `image_verified` işaretini ekleyince yalnızca true geçer.
 * İşaret yokken kayıtlı görsel adresi gerekir. Boş adres geçmez; sayfa açılırken
 * basılan kategori yedeği doğrulanmış görsel sayılmaz.
 */

const { isPublishedPlaceStatus } = require('./place-status');

const FIELD_ORDER = ['name', 'descriptionTr', 'coords', 'category', 'verifiedImage', 'sourceOrDate'];

const FIELD_LABELS = {
  name: 'ad',
  descriptionTr: 'açıklama (TR)',
  coords: 'koordinat',
  category: 'kategori',
  verifiedImage: 'doğrulanmış görsel',
  sourceOrDate: 'kaynak URL veya doğrulama tarihi',
};

class PublishQualityError extends Error {
  constructor(missing) {
    const labels = missing.map((key) => FIELD_LABELS[key] || key);
    super(`Yayınlanamadı. Eksik alanlar: ${labels.join(', ')}.`);
    this.name = 'PublishQualityError';
    this.missing = missing;
    this.statusCode = 400;
  }
}

function text(value) {
  return String(value == null ? '' : value).trim();
}

function hasText(value) {
  return text(value).length > 0;
}

function parseList(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === '') return [];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Sitemap ile aynı kural: boş, sayı olmayan, aralık dışı veya 0 koordinat eksiktir.
 * 0, Null Island ve bozuk içe aktarma (boylam 0) demektir.
 */
function hasPublishCoords(lat, lng) {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return false;
  if (la === 0 || ln === 0) return false;
  if (Math.abs(la) > 90 || Math.abs(ln) > 180) return false;
  return true;
}

function imageFlag(place) {
  if (!place || typeof place !== 'object') return undefined;
  if (place.imageVerified !== undefined && place.imageVerified !== null && place.imageVerified !== '') {
    return place.imageVerified;
  }
  if (place.image_verified !== undefined && place.image_verified !== null && place.image_verified !== '') {
    return place.image_verified;
  }
  return undefined;
}

function isYes(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function isNo(value) {
  return value === false || value === 0 || value === '0' || value === 'false';
}

function storedImageUrls(place) {
  const urls = [];
  const cover = text(place.imageUrl || place.image_url);
  if (cover && !/^(undefined|null|placeholder)$/i.test(cover)) urls.push(cover);
  for (const item of parseList(place.photos)) {
    const src = text(typeof item === 'string' ? item : (item && (item.url || item.src)));
    if (src && !/^(undefined|null|placeholder)$/i.test(src)) urls.push(src);
  }
  return urls;
}

function hasVerifiedImage(place) {
  const flag = imageFlag(place);
  if (flag !== undefined) {
    if (isYes(flag)) return true;
    if (isNo(flag)) return false;
  }
  return storedImageUrls(place).length > 0;
}

function hasSourceOrVerifiedDate(place) {
  if (hasText(place.infoSourceUrl || place.info_source_url)) return true;
  const when = place.infoVerifiedAt !== undefined ? place.infoVerifiedAt : place.info_verified_at;
  if (when instanceof Date) return !Number.isNaN(when.getTime());
  return hasText(when);
}

function missingPublishFields(place) {
  const src = place || {};
  const missing = [];
  if (!hasText(src.name)) missing.push('name');
  if (!hasText(src.description)) missing.push('descriptionTr');
  if (!hasPublishCoords(src.lat, src.lng)) missing.push('coords');
  if (!hasText(src.category)) missing.push('category');
  if (!hasVerifiedImage(src)) missing.push('verifiedImage');
  if (!hasSourceOrVerifiedDate(src)) missing.push('sourceOrDate');
  return missing;
}

function fieldLabels(missing) {
  return (missing || []).map((key) => FIELD_LABELS[key] || key);
}

/**
 * previousStatus null/undefined → yeni kayıt.
 * previousStatus yayında → kapı yok.
 * Sonraki durum yayında değil → kapı yok.
 */
function assertCanPublish(previousStatus, nextPlace) {
  const next = nextPlace || {};
  const nextStatus = next.status == null || next.status === '' ? 'published' : next.status;
  if (!isPublishedPlaceStatus(nextStatus)) return;
  if (previousStatus != null && previousStatus !== '' && isPublishedPlaceStatus(previousStatus)) return;
  const missing = missingPublishFields(next);
  if (missing.length) throw new PublishQualityError(missing);
}

module.exports = {
  FIELD_ORDER,
  FIELD_LABELS,
  PublishQualityError,
  hasPublishCoords,
  hasVerifiedImage,
  hasSourceOrVerifiedDate,
  missingPublishFields,
  fieldLabels,
  assertCanPublish,
  storedImageUrls,
};
