/**
 * V4 Adım 3 — place English copy for sitemap and hreflang.
 * Adım 8 asks for name_en + description_en. This schema has no name_en;
 * a place name is a proper noun. English copy is description_en or overview_en.
 * Empty English copy must not get an /en/places URL or an en hreflang.
 */

function filled(value) {
  return String(value == null ? '' : value).trim();
}

function placeHasEnglishCopy(row) {
  const description = filled(row?.description_en ?? row?.descriptionEn);
  const overview = filled(row?.overview_en ?? row?.overviewEn);
  return description.length > 0 || overview.length > 0;
}

function placeEnSitemapPath(row) {
  if (!placeHasEnglishCopy(row)) return null;
  const slug = filled(row?.slug);
  if (!slug) return null;
  return `/en/places/${encodeURIComponent(slug)}`;
}

module.exports = {
  placeHasEnglishCopy,
  placeEnSitemapPath,
};
