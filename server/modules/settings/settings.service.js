const { db } = require('../../db');

const DEFAULTS = {
  site_name: 'Touristlio',
  site_tagline: 'Sadece Ziyaret Etme. Hisset.',
  logo_url: '/images/logo.svg',
  theme_primary: '#0ea5e9',
  map_default_lat: '39.0',
  map_default_lng: '35.0',
  map_default_zoom: '6',
  feature_blog: 'true',
  feature_discover: 'true',
  seo_title: 'Touristlio — Seyahat Keşfi',
  seo_description: 'Türkiye ve dünyada gezilecek yerler, harita ve topluluk deneyimleri.',
  blog_hero_title_tr: 'Seyahat',
  blog_hero_title_em_tr: 'Hikayeleri',
  blog_hero_subtitle_tr: 'Yerel yazarlardan özenle seçilmiş gezi rehberleri, gizli köşeler ve kültürel keşifler.',
  blog_cat_all_tr: 'Tümü',
  blog_hero_title_en: 'Travel',
  blog_hero_title_em_en: 'Stories',
  blog_hero_subtitle_en: 'Curated guides, hidden gems and cultural discoveries from local writers.',
  blog_cat_all_en: 'All',
  blog_empty_tr: 'Henüz blog yok.',
  blog_empty_en: 'No blog posts yet.',
  blog_search_ph_tr: 'Blog ara…',
  blog_search_ph_en: 'Search blog…',
  blog_featured_lbl_tr: 'Öne çıkan',
  blog_featured_lbl_en: 'Featured',
  blog_view_place_tr: 'Mekânı gör',
  blog_view_place_en: 'View place',
  maintenance_mode: 'false',
  maintenance_message: 'Site bakımda. Lütfen daha sonra tekrar deneyin.',
};

async function getAll() {
  const rows = await require('./settings.model').allRows();
  const out = { ...DEFAULTS };
  rows.forEach((r) => { out[r.key] = r.value; });
  return out;
}

async function getPublic() {
  const all = await getAll();
  return {
    siteName: all.site_name,
    tagline: all.site_tagline,
    logoUrl: all.logo_url,
    themePrimary: all.theme_primary,
    map: {
      lat: Number(all.map_default_lat),
      lng: Number(all.map_default_lng),
      zoom: Number(all.map_default_zoom),
    },
    features: {
      blog: all.feature_blog === 'true',
      discover: all.feature_discover === 'true',
    },
    seo: {
      title: all.seo_title,
      description: all.seo_description,
    },
    blog: {
      heroTitle: all.blog_hero_title_tr,
      heroTitleEm: all.blog_hero_title_em_tr,
      subtitle: all.blog_hero_subtitle_tr,
      catAll: all.blog_cat_all_tr,
      heroTitleEn: all.blog_hero_title_en,
      heroTitleEmEn: all.blog_hero_title_em_en,
      subtitleEn: all.blog_hero_subtitle_en,
      catAllEn: all.blog_cat_all_en,
    },
  };
}

function getBlogPageSettings() {
  const all = getAll();
  return {
    heroTitleTr: all.blog_hero_title_tr,
    heroTitleEmTr: all.blog_hero_title_em_tr,
    subtitleTr: all.blog_hero_subtitle_tr,
    catAllTr: all.blog_cat_all_tr,
    heroTitleEn: all.blog_hero_title_en,
    heroTitleEmEn: all.blog_hero_title_em_en,
    subtitleEn: all.blog_hero_subtitle_en,
    catAllEn: all.blog_cat_all_en,
    emptyTr: all.blog_empty_tr,
    emptyEn: all.blog_empty_en,
    searchPhTr: all.blog_search_ph_tr,
    searchPhEn: all.blog_search_ph_en,
    featuredLblTr: all.blog_featured_lbl_tr,
    featuredLblEn: all.blog_featured_lbl_en,
    viewPlaceTr: all.blog_view_place_tr,
    viewPlaceEn: all.blog_view_place_en,
  };
}

function setBlogPageSettings(body = {}) {
  const map = {
    heroTitleTr: 'blog_hero_title_tr',
    heroTitleEmTr: 'blog_hero_title_em_tr',
    subtitleTr: 'blog_hero_subtitle_tr',
    catAllTr: 'blog_cat_all_tr',
    heroTitleEn: 'blog_hero_title_en',
    heroTitleEmEn: 'blog_hero_title_em_en',
    subtitleEn: 'blog_hero_subtitle_en',
    catAllEn: 'blog_cat_all_en',
    emptyTr: 'blog_empty_tr',
    emptyEn: 'blog_empty_en',
    searchPhTr: 'blog_search_ph_tr',
    searchPhEn: 'blog_search_ph_en',
    featuredLblTr: 'blog_featured_lbl_tr',
    featuredLblEn: 'blog_featured_lbl_en',
    viewPlaceTr: 'blog_view_place_tr',
    viewPlaceEn: 'blog_view_place_en',
  };
  for (const [key, settingKey] of Object.entries(map)) {
    if (body[key] != null) set(settingKey, String(body[key]));
  }
  return getBlogPageSettings();
}

function set(key, value) {
  require('./settings.model').upsert(key, value);
}

async function seedDefaults() {
  for (const [key, value] of Object.entries(DEFAULTS)) {
    await db.prepare('INSERT OR IGNORE INTO site_settings (key, value) VALUES (?, ?)').run(key, value);
  }
}

module.exports = { getAll, getPublic, set, getBlogPageSettings, setBlogPageSettings, seedDefaults, DEFAULTS };
