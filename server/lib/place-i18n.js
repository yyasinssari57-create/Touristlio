/**
 * V4 Adım 3 + Adım 8 — English place copy.
 * V5 Adım 11 — isIndexablePlace (imageVerified + quality bar).
 *
 * Adım 8 asks whether name_en and description_en are both filled.
 * This schema has no name_en column. The place name is a proper noun
 * stored in `name` and shown in both languages. A non-empty name
 * satisfies the name half. Do not add a name_en column or copy the
 * stored name into one.
 *
 * The description half is description_en, or overview_en when
 * description_en is empty (Adım 3 sitemap rule). Whitespace is empty.
 *
 * Incomplete English copy: the visitor still sees the Turkish fallback,
 * but /en/places/:slug is noindex, stays out of the EN sitemap, and
 * does not get an hreflang="en" alternate.
 *
 * Unverified image (Adım 11): visitor still sees the page; robots noindex
 * and the URL stays out of the sitemap until imageVerified=true.
 */

const { meetsIndexablePlaceBase } = require('./place-indexable');

function filled(value) {
  return String(value == null ? '' : value).trim();
}

function rowHasNameField(row) {
  return !!row && (
    Object.prototype.hasOwnProperty.call(row, 'name')
    || Object.prototype.hasOwnProperty.call(row, 'name_en')
    || Object.prototype.hasOwnProperty.call(row, 'nameEn')
  );
}

function placeEnglishName(row) {
  if (row && (row.name_en != null || row.nameEn != null)) {
    return filled(row.name_en ?? row.nameEn);
  }
  return filled(row?.name);
}

function placeEnglishDescription(row) {
  return filled(row?.description_en ?? row?.descriptionEn)
    || filled(row?.overview_en ?? row?.overviewEn);
}

/**
 * True when the English place page may be indexed.
 * Rows that only carry description fields (sitemap fixtures) have no
 * name key; a missing key is not a missing translation. A present but
 * empty name, name_en, or nameEn is incomplete.
 */
function placeEnTranslationComplete(row) {
  const nameOk = rowHasNameField(row) ? placeEnglishName(row).length > 0 : true;
  return nameOk && placeEnglishDescription(row).length > 0;
}

/** Adım 3 name. Same rule as placeEnTranslationComplete. */
function placeHasEnglishCopy(row) {
  return placeEnTranslationComplete(row);
}

function placeEnSitemapPath(row) {
  if (!meetsIndexablePlaceBase(row)) return null;
  if (!placeEnTranslationComplete(row)) return null;
  const slug = filled(row?.slug);
  if (!slug) return null;
  return `/en/places/${encodeURIComponent(slug)}`;
}

/**
 * V5 Adım 11 — single indexability decision for sitemap, server robots,
 * and (mirrored) client robots.
 * Conditions: published + valid coords + enough TR blurb + imageVerified.
 * For lang=en, English translation must also be complete (V4 Adım 8).
 */
function isIndexablePlace(row, lang) {
  if (!meetsIndexablePlaceBase(row)) return false;
  if (String(lang || 'tr').toLowerCase() === 'en' && !placeEnTranslationComplete(row)) {
    return false;
  }
  return true;
}

/**
 * Indexing for one place page.
 * Page stays open to visitors. noindex when isIndexablePlace is false.
 * English hreflang only when the EN URL itself would be indexable.
 */
function placePageIndexing(row, lang) {
  const slug = filled(row?.slug);
  const trPath = slug ? `/places/${encodeURIComponent(slug)}` : null;
  const complete = placeEnTranslationComplete(row);
  const baseOk = meetsIndexablePlaceBase(row);
  const enPath = complete && baseOk && trPath ? `/en${trPath}` : null;
  const resolvedLang = String(lang || 'tr').toLowerCase() === 'en' ? 'en' : 'tr';
  const noindex = !isIndexablePlace(row, resolvedLang);
  return { complete, trPath, enPath, noindex, indexable: !noindex };
}

/**
 * Admin list filter. Matches placeEnTranslationComplete === false
 * on a places row (name + description_en / overview_en).
 */
const PLACE_EN_MISSING_SQL = `(
  btrim(COALESCE(name, '')) = ''
  OR (
    btrim(COALESCE(description_en, '')) = ''
    AND btrim(COALESCE(overview_en, '')) = ''
  )
)`;

module.exports = {
  placeEnglishName,
  placeEnglishDescription,
  placeEnTranslationComplete,
  placeHasEnglishCopy,
  placeEnSitemapPath,
  isIndexablePlace,
  placePageIndexing,
  PLACE_EN_MISSING_SQL,
};
