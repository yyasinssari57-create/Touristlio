/**
 * V4 Adım 3 + Adım 8 — English place copy.
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
 */

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
  if (!placeEnTranslationComplete(row)) return null;
  const slug = filled(row?.slug);
  if (!slug) return null;
  return `/en/places/${encodeURIComponent(slug)}`;
}

/**
 * Indexing for one place page.
 * Turkish URL stays indexable. English URL is noindex until the
 * translation is complete, and then it is the hreflang "en" target.
 */
function placePageIndexing(row, lang) {
  const slug = filled(row?.slug);
  const trPath = slug ? `/places/${encodeURIComponent(slug)}` : null;
  const complete = placeEnTranslationComplete(row);
  const enPath = complete && trPath ? `/en${trPath}` : null;
  const noindex = lang === 'en' && !complete;
  return { complete, trPath, enPath, noindex };
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
  placePageIndexing,
  PLACE_EN_MISSING_SQL,
};
