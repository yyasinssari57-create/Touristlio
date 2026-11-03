/**
 * V4 Adım 4 — yinelenen ve şablon mekân raporu.
 * Salt okunur. Kayıt silinmez, taslağa çekilmez, koordinat düzeltilmez.
 *
 * Çalıştırma: npm run audit:places-quality
 * Çıktı (gitignore): reports/v4-adim4-*.csv ve reports/v4-adim4-ozet.json
 *
 * Kaynak: DATABASE_URL varsa PostgreSQL (BEGIN READ ONLY), yoksa server/data/places.json.
 * AUDIT_PLACES_SOURCE=json veya db ile kaynak zorlanır.
 */
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { slugify } = require('../lib/slugify');
const { slugFromPlace } = require('../lib/place-lookup');
const { haversineKm } = require('../lib/geo');
const { BY_CATEGORY } = require('../lib/photo-pools');
const {
  isValidSitemapCoord,
  PLACE_DESCRIPTION_MIN_CHARS,
} = require('../lib/sitemap');

const TEMPLATE_KINDS = [
  'cultural-district',
  'main-square',
  'waterfront',
  'historic-quarter',
  'central-park',
  'old-town',
];

const KIND_LABELS = {
  'cultural-district': 'Cultural District',
  'main-square': 'Main Square',
  'waterfront': 'Waterfront',
  'historic-quarter': 'Historic Quarter',
  'central-park': 'Central Park',
  'old-town': 'Old Town',
};

/** Aynı şehirde bu mesafenin içindeki çiftler yinelenen adayıdır. */
const DUPLICATE_MAX_METERS = 300;
/** Token kümesi benzerliği. Örnek: ani-ruins-kars ile kars-ani-ruins-kars. */
const SLUG_JACCARD_MIN = 0.8;
/** Yazım olarak çok yakın slug (1 - Levenshtein / uzunluk). */
const SLUG_EDIT_SIMILARITY_MIN = 0.88;
const SHORT_BLURB_MAX = PLACE_DESCRIPTION_MIN_CHARS;

const CENTER_NAME_RE = /\b(old town|historic quarter|main square|cultural district|central park|city center|şehir merkezi|sehir merkezi)\b/i;
const BEACH_NAME_RE = /\b(beach|plajı|plaji|plaj|plage|sahil|kumsalı|kumsali|kumsal)\b/i;
const MUSEUM_NAME_RE = /\b(museum|müze|muze)\b/i;
const RELIGIOUS_NAME_RE = /\b(mosque|camii|cami|cathedral|katedral|church|kilise|monastery|manastır|manastir)\b/i;
const BEACH_CONFLICT_CATEGORIES = new Set(['museum', 'religious', 'historical', 'restaurant', 'food']);

const BEACH_PHOTO_IDS = new Set(BY_CATEGORY.beach || []);

const ROOT = path.join(__dirname, '..', '..');
const DEFAULT_OUT = path.join(ROOT, 'reports');
const PLACES_JSON = path.join(__dirname, '..', 'data', 'places.json');

function textOf(value) {
  return String(value == null ? '' : value).trim();
}

function textLen(value) {
  return textOf(value).length;
}

function foldKey(value) {
  const raw = textOf(value);
  if (!raw) return '';
  return slugify(raw);
}

function parseStringList(value) {
  if (Array.isArray(value)) return value.map(textOf).filter(Boolean);
  const raw = textOf(value);
  if (!raw) return [];
  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(textOf).filter(Boolean);
    } catch {
      /* düz metin olarak devam */
    }
  }
  return [raw];
}

function uniqueStrings(values) {
  const out = [];
  const seen = new Set();
  for (const value of values) {
    const text = textOf(value);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

function unsplashPhotoId(url) {
  const match = String(url || '').match(/unsplash\.com\/(photo-[A-Za-z0-9_-]+)/i);
  return match ? match[1].toLowerCase() : '';
}

/**
 * Slug, "<şehir>-<kalıp>-<şehir>" ise kalıbı döndürür.
 * Benzersiz slug soneki (-2) varsa yok sayılır.
 * Örnek: vienna-old-town-vienna, ho-chi-minh-city-waterfront-ho-chi-minh-city.
 * Örnek değil: hasankeyf-old-town-batman, central-park-new-york.
 */
function templateKindFromSlug(slug) {
  const bare = String(slug || '').toLowerCase().trim().replace(/-\d+$/, '');
  for (const kind of TEMPLATE_KINDS) {
    const needle = `-${kind}-`;
    const at = bare.indexOf(needle);
    if (at <= 0) continue;
    const city = bare.slice(0, at);
    const rest = bare.slice(at + needle.length);
    if (city && rest === city) return { city, kind };
  }
  return null;
}

function isGeneratedTemplateLocation(place, kind) {
  const label = KIND_LABELS[kind];
  if (!label) return false;
  const loc = textOf(place.location).toLowerCase();
  const city = textOf(place.city).toLowerCase();
  if (!loc || !city) return false;
  return loc === `${label.toLowerCase()}, ${city}`;
}

function slugTokens(slug) {
  return String(slug || '')
    .toLowerCase()
    .trim()
    .replace(/-\d+$/, '')
    .split('-')
    .filter(Boolean);
}

function contiguousTokenSubset(shorter, longer) {
  if (shorter.length < 3 || shorter.length >= longer.length) return false;
  for (let i = 0; i <= longer.length - shorter.length; i += 1) {
    let same = true;
    for (let j = 0; j < shorter.length; j += 1) {
      if (longer[i + j] !== shorter[j]) {
        same = false;
        break;
      }
    }
    if (same) return true;
  }
  return false;
}

function jaccard(left, right) {
  const a = new Set(left);
  const b = new Set(right);
  if (!a.size && !b.size) return 1;
  let inter = 0;
  for (const token of a) {
    if (b.has(token)) inter += 1;
  }
  const union = a.size + b.size - inter;
  return union ? inter / union : 0;
}

function levenshtein(a, b) {
  const s = String(a || '');
  const t = String(b || '');
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  const prev = new Array(t.length + 1);
  const cur = new Array(t.length + 1);
  for (let j = 0; j <= t.length; j += 1) prev[j] = j;
  for (let i = 1; i <= s.length; i += 1) {
    cur[0] = i;
    for (let j = 1; j <= t.length; j += 1) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= t.length; j += 1) prev[j] = cur[j];
  }
  return prev[t.length];
}

/** Aynı şehirdeki iki slug neden birbirine benziyor? Boş dizi = benzer değil. */
function slugSimilarityReasons(slugA, slugB) {
  const left = slugTokens(slugA);
  const right = slugTokens(slugB);
  const bareA = left.join('-');
  const bareB = right.join('-');
  if (!bareA || !bareB || bareA === bareB) {
    return bareA && bareA === bareB ? ['slug_equal'] : [];
  }
  const reasons = [];
  if (contiguousTokenSubset(left, right) || contiguousTokenSubset(right, left)) {
    reasons.push('slug_substring');
  }
  const score = jaccard(left, right);
  const editBase = Math.max(bareA.length, bareB.length);
  const editScore = editBase ? 1 - (levenshtein(bareA, bareB) / editBase) : 0;
  if (
    !reasons.includes('slug_substring')
    && (
      (left.length >= 3 && right.length >= 3 && score >= SLUG_JACCARD_MIN)
      || (bareA.length >= 12 && bareB.length >= 12 && editScore >= SLUG_EDIT_SIMILARITY_MIN)
    )
  ) {
    reasons.push('slug_similar');
  }
  return reasons;
}

function coordIssue(place) {
  const lat = place.lat;
  const lng = place.lng;
  if (lat == null || lng == null || textOf(lat) === '' || textOf(lng) === '') return 'bos';
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return 'gecersiz';
  if (la === 0 || ln === 0) return 'sifir';
  if (Math.abs(la) > 90 || Math.abs(ln) > 180) return 'aralik_disi';
  return '';
}

function blurbLength(place) {
  return Math.max(textLen(place.description), textLen(place.overview));
}

function textIssue(place) {
  const blurb = blurbLength(place);
  if (blurb === 0) return 'bos';
  if (blurb <= SHORT_BLURB_MAX) return 'kisa';
  return '';
}

function textChars(place) {
  const chunks = [
    place.description,
    place.overview,
    place.history,
    place.tips,
    place.descriptionEn,
    place.overviewEn,
    place.historyEn,
    place.tipsEn,
  ].map(textOf).filter(Boolean);
  const seen = new Set();
  let total = 0;
  for (const chunk of chunks) {
    if (seen.has(chunk)) continue;
    seen.add(chunk);
    total += chunk.length;
  }
  return total;
}

function richness(place) {
  const images = place.imageUrls.length;
  const tiola = Number(place.tiolaCount) || 0;
  const chars = textChars(place);
  return {
    textChars: chars,
    images,
    tiola,
    score: chars + (images * 100) + (tiola * 500),
  };
}

function pickFuller(a, b) {
  const ra = richness(a);
  const rb = richness(b);
  const keys = ['score', 'tiola', 'images', 'textChars'];
  for (const key of keys) {
    if (ra[key] !== rb[key]) return ra[key] > rb[key] ? a : b;
  }
  return Number(a.id) <= Number(b.id) ? a : b;
}

function distanceMeters(a, b) {
  if (!isValidSitemapCoord(a.lat, a.lng) || !isValidSitemapCoord(b.lat, b.lng)) return null;
  const km = haversineKm(Number(a.lat), Number(a.lng), Number(b.lat), Number(b.lng));
  if (!Number.isFinite(km)) return null;
  return Math.round(km * 1000 * 10) / 10;
}

function cityKey(place) {
  const city = foldKey(place.city);
  if (!city) return '';
  return `${city}|${foldKey(place.country)}`;
}

function normalizePlace(raw, tiolaCount) {
  const imageUrl = textOf(raw.imageUrl || raw.image_url || raw.heroImage || raw.hero_image);
  const photos = parseStringList(raw.photos);
  const imageUrls = uniqueStrings([imageUrl, ...photos]);
  const slug = textOf(raw.slug) || slugify(slugFromPlace({
    name: raw.name,
    city: raw.city,
    country: raw.country,
  }));
  const storedTiola = Number(raw.tiolaCount ?? raw.tiola_count) || 0;
  const approved = tiolaCount == null ? null : Number(tiolaCount) || 0;
  return {
    id: raw.id,
    name: textOf(raw.name),
    slug,
    location: textOf(raw.location),
    country: textOf(raw.country),
    city: textOf(raw.city),
    district: textOf(raw.district),
    category: textOf(raw.category).toLowerCase(),
    status: textOf(raw.status || 'published').toLowerCase() || 'published',
    lat: raw.lat,
    lng: raw.lng,
    description: raw.description,
    overview: raw.overview,
    history: raw.history,
    tips: raw.tips,
    descriptionEn: raw.descriptionEn || raw.description_en,
    overviewEn: raw.overviewEn || raw.overview_en,
    historyEn: raw.historyEn || raw.history_en,
    tipsEn: raw.tipsEn || raw.tips_en,
    imageUrl,
    imageUrls,
    tiolaCount: approved == null ? storedTiola : Math.max(storedTiola, approved),
    tiolaCountStored: storedTiola,
  };
}

function findTemplates(places) {
  const rows = [];
  for (const place of places) {
    const hit = templateKindFromSlug(place.slug);
    if (!hit) continue;
    const generated = isGeneratedTemplateLocation(place, hit.kind);
    rows.push({
      id: place.id,
      slug: place.slug,
      name: place.name,
      city: place.city,
      country: place.country,
      category: place.category,
      status: place.status,
      kind: hit.kind,
      location: place.location,
      likely_generated: generated ? 'evet' : 'hayir',
      review_hint: generated ? 'sablon_uretim' : 'gozden_gecir',
      lat: place.lat ?? '',
      lng: place.lng ?? '',
      tiola_count: place.tiolaCount,
      description_chars: blurbLength(place),
    });
  }
  rows.sort((a, b) => String(a.slug).localeCompare(String(b.slug)) || (Number(a.id) - Number(b.id)));
  return rows;
}

function findDuplicates(places) {
  const groups = new Map();
  for (const place of places) {
    const key = cityKey(place);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(place);
  }
  const rows = [];
  for (const group of groups.values()) {
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const a = group[i];
        const b = group[j];
        const meters = distanceMeters(a, b);
        const merged = [];
        if (meters != null && meters <= DUPLICATE_MAX_METERS) merged.push('within_300m');
        for (const reason of slugSimilarityReasons(a.slug, b.slug)) {
          if (!merged.includes(reason)) merged.push(reason);
        }
        if (!merged.length) continue;
        const left = Number(a.id) <= Number(b.id) ? a : b;
        const right = left === a ? b : a;
        const leftRich = richness(left);
        const rightRich = richness(right);
        const fuller = pickFuller(left, right);
        const tie = leftRich.score === rightRich.score
          && leftRich.tiola === rightRich.tiola
          && leftRich.images === rightRich.images
          && leftRich.textChars === rightRich.textChars;
        rows.push({
          id_a: left.id,
          slug_a: left.slug,
          name_a: left.name,
          status_a: left.status,
          id_b: right.id,
          slug_b: right.slug,
          name_b: right.name,
          status_b: right.status,
          city: left.city,
          country: left.country,
          distance_m: meters == null ? '' : meters,
          reasons: merged.join('|'),
          tiola_a: leftRich.tiola,
          images_a: leftRich.images,
          text_chars_a: leftRich.textChars,
          score_a: leftRich.score,
          tiola_b: rightRich.tiola,
          images_b: rightRich.images,
          text_chars_b: rightRich.textChars,
          score_b: rightRich.score,
          fuller_id: fuller.id,
          fuller_slug: fuller.slug,
          fuller_name: fuller.name,
          score_tie: tie ? 'evet' : 'hayir',
        });
      }
    }
  }
  rows.sort((a, b) => {
    const da = a.distance_m === '' ? 1e12 : Number(a.distance_m);
    const db = b.distance_m === '' ? 1e12 : Number(b.distance_m);
    return da - db || String(a.slug_a).localeCompare(String(b.slug_a));
  });
  return rows;
}

function findSharedImages(places) {
  const byUrl = new Map();
  const byPhoto = new Map();
  for (const place of places) {
    const seenPhoto = new Set();
    for (const url of place.imageUrls) {
      if (!byUrl.has(url)) byUrl.set(url, []);
      byUrl.get(url).push(place);
      const photoId = unsplashPhotoId(url);
      if (!photoId || seenPhoto.has(photoId)) continue;
      seenPhoto.add(photoId);
      if (!byPhoto.has(photoId)) byPhoto.set(photoId, { places: [], urls: new Set() });
      const bucket = byPhoto.get(photoId);
      bucket.places.push(place);
      bucket.urls.add(url);
    }
  }

  const rows = [];
  for (const [url, list] of byUrl) {
    const unique = dedupePlaces(list);
    if (unique.length < 2) continue;
    rows.push(imageRow('exact_url', url, unique, url));
  }
  for (const [photoId, bucket] of byPhoto) {
    const unique = dedupePlaces(bucket.places);
    if (unique.length < 2 || bucket.urls.size < 2) continue;
    const sample = [...bucket.urls][0];
    rows.push(imageRow('unsplash_photo_id', photoId, unique, sample));
  }
  rows.sort((a, b) => b.place_count - a.place_count || String(a.image_key).localeCompare(String(b.image_key)));
  return rows;
}

function dedupePlaces(list) {
  const map = new Map();
  for (const place of list) map.set(place.id, place);
  return [...map.values()].sort((a, b) => Number(a.id) - Number(b.id));
}

function imageRow(matchType, imageKey, places, sampleUrl) {
  return {
    match_type: matchType,
    image_key: imageKey,
    place_count: places.length,
    place_ids: places.map((p) => p.id).join(' | '),
    slugs: places.map((p) => p.slug).join(' | '),
    names: places.map((p) => p.name).join(' | '),
    statuses: places.map((p) => p.status).join(' | '),
    sample_url: sampleUrl,
  };
}

function findThin(places) {
  const rows = [];
  for (const place of places) {
    const coord = coordIssue(place);
    const text = textIssue(place);
    if (!coord && !text) continue;
    rows.push({
      id: place.id,
      slug: place.slug,
      name: place.name,
      city: place.city,
      country: place.country,
      category: place.category,
      status: place.status,
      lat: place.lat ?? '',
      lng: place.lng ?? '',
      coord_issue: coord,
      description_chars: textLen(place.description),
      overview_chars: textLen(place.overview),
      blurb_chars: blurbLength(place),
      text_issue: text,
    });
  }
  rows.sort((a, b) => Number(a.id) - Number(b.id));
  return rows;
}

function findMismatches(places) {
  const rows = [];
  for (const place of places) {
    const name = `${place.name} ${place.slug.replace(/-/g, ' ')}`;
    const reasons = [];
    const center = CENTER_NAME_RE.test(name);
    const beachName = BEACH_NAME_RE.test(place.name);
    const museumName = MUSEUM_NAME_RE.test(place.name);
    const religiousName = RELIGIOUS_NAME_RE.test(place.name);
    if (center && place.category === 'beach') reasons.push('sehir_merkezi_kategori_plaj');
    if (beachName && BEACH_CONFLICT_CATEGORIES.has(place.category)) reasons.push('ad_plaj_kategori_uyumsuz');
    if (museumName && place.category === 'beach') reasons.push('ad_muze_kategori_plaj');
    if (religiousName && place.category === 'beach') reasons.push('ad_dini_kategori_plaj');
    const beachPhoto = place.imageUrls.some((url) => BEACH_PHOTO_IDS.has(unsplashPhotoId(url)));
    if (center && beachPhoto) reasons.push('sehir_merkezi_gorseli_plaj');
    if (!reasons.length) continue;
    rows.push({
      id: place.id,
      slug: place.slug,
      name: place.name,
      city: place.city,
      country: place.country,
      category: place.category,
      status: place.status,
      reasons: reasons.join('|'),
      image_url: place.imageUrl,
    });
  }
  rows.sort((a, b) => String(a.reasons).localeCompare(String(b.reasons)) || (Number(a.id) - Number(b.id)));
  return rows;
}

function countStatus(rows, status) {
  return rows.filter((row) => row.status === status).length;
}

function buildSummary(places, report, meta) {
  const templates = report.templates;
  const generated = templates.filter((row) => row.review_hint === 'sablon_uretim');
  const review = templates.filter((row) => row.review_hint === 'gozden_gecir');
  const dup = report.duplicates;
  const dupPlaceIds = new Set();
  const publishedDupIds = new Set();
  let within300 = 0;
  let slugOnly = 0;
  let bothPublished = 0;
  let within300Published = 0;
  let slugOnlyPublished = 0;
  for (const row of dup) {
    dupPlaceIds.add(row.id_a);
    dupPlaceIds.add(row.id_b);
    const close = String(row.reasons).includes('within_300m');
    if (close) within300 += 1;
    else slugOnly += 1;
    if (row.status_a === 'published' && row.status_b === 'published') {
      bothPublished += 1;
      publishedDupIds.add(row.id_a);
      publishedDupIds.add(row.id_b);
      if (close) within300Published += 1;
      else slugOnlyPublished += 1;
    }
  }
  const exact = report.sharedImages.filter((row) => row.match_type === 'exact_url');
  const photo = report.sharedImages.filter((row) => row.match_type === 'unsplash_photo_id');
  const exactPlaces = new Set();
  for (const row of exact) {
    String(row.place_ids).split(' | ').forEach((id) => exactPlaces.add(id));
  }
  const thinCoord = report.thin.filter((row) => row.coord_issue).length;
  const thinText = report.thin.filter((row) => row.text_issue).length;
  const published = places.filter((place) => place.status === 'published').length;
  return {
    generatedAt: new Date().toISOString(),
    source: meta.source,
    readOnly: true,
    unpublished: 0,
    placeCount: places.length,
    publishedCount: published,
    criteria: {
      A: 'slug <şehir>-(cultural-district|main-square|waterfront|historic-quarter|central-park|old-town)-<şehir>, isteğe bağlı -2 soneki. Konum "<Kalıp>, <Şehir>" ise sablon_uretim, değilse gozden_gecir.',
      B: `Aynı şehir ve ülke. Koordinat ≤ ${DUPLICATE_MAX_METERS} m (haversine) veya slug token alt dizisi / Jaccard ≥ ${SLUG_JACCARD_MIN} / yazım benzerliği ≥ ${SLUG_EDIT_SIMILARITY_MIN}. Dolu olan: benzersiz metin karakteri + görsel×100 + Tiola×500.`,
      C: 'Aynı görsel URL (hero/image_url ve photos). Farklı kırpılmış Unsplash adresi aynı photo-id ise ayrı satır.',
      D: `Koordinat boş, 0, geçersiz veya aralık dışı. Türkçe açıklama/özet ${SHORT_BLURB_MAX} karakter veya daha kısa (site haritasıyla aynı eşik: daha uzun olmalı).`,
      E: 'Adı şehir merkezi / old town / meydan / park olup kategorisi Plaj olanlar; plaj adı olup müze-dini-tarihi-restoran olanlar; şehir merkezi adının görseli plaj havuzundan gelenler.',
    },
    counts: {
      A_templates: templates.length,
      A_templates_published: countStatus(templates, 'published'),
      A_sablon_uretim: generated.length,
      A_sablon_uretim_published: countStatus(generated, 'published'),
      A_gozden_gecir: review.length,
      A_gozden_gecir_published: countStatus(review, 'published'),
      B_pairs: dup.length,
      B_within_300m: within300,
      B_slug_only: slugOnly,
      B_places: dupPlaceIds.size,
      B_pairs_both_published: bothPublished,
      B_within_300m_both_published: within300Published,
      B_slug_only_both_published: slugOnlyPublished,
      B_places_both_published: publishedDupIds.size,
      C_exact_url_groups: exact.length,
      C_exact_url_places: exactPlaces.size,
      C_unsplash_photo_groups: photo.length,
      D_thin: report.thin.length,
      D_coord: thinCoord,
      D_text: thinText,
      E_mismatches: report.mismatches.length,
      E_mismatches_published: countStatus(report.mismatches, 'published'),
    },
  };
}

function buildReport(places, meta) {
  const report = {
    templates: findTemplates(places),
    duplicates: findDuplicates(places),
    sharedImages: findSharedImages(places),
    thin: findThin(places),
    mismatches: findMismatches(places),
  };
  report.summary = buildSummary(places, report, meta || { source: 'fixture' });
  return report;
}

function csvCell(value) {
  const text = value == null ? '' : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function writeCsv(filePath, rows) {
  const columns = rows.length ? Object.keys(rows[0]) : [];
  const lines = [columns.join(',')];
  for (const row of rows) {
    lines.push(columns.map((column) => csvCell(row[column])).join(','));
  }
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
}

function writeReports(report, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const files = {
    templates: path.join(outDir, 'v4-adim4-a-templates.csv'),
    duplicates: path.join(outDir, 'v4-adim4-b-duplicates.csv'),
    sharedImages: path.join(outDir, 'v4-adim4-c-shared-images.csv'),
    thin: path.join(outDir, 'v4-adim4-d-thin.csv'),
    mismatches: path.join(outDir, 'v4-adim4-e-mismatches.csv'),
    summary: path.join(outDir, 'v4-adim4-ozet.json'),
  };
  writeCsv(files.templates, report.templates);
  writeCsv(files.duplicates, report.duplicates);
  writeCsv(files.sharedImages, report.sharedImages);
  writeCsv(files.thin, report.thin);
  writeCsv(files.mismatches, report.mismatches);
  fs.writeFileSync(files.summary, `${JSON.stringify(report.summary, null, 2)}\n`, 'utf8');
  return files;
}

function safeError(err) {
  return String(err && err.message ? err.message : err)
    .replace(/postgres(?:ql)?:\/\/\S+/gi, 'postgresql://…');
}

async function loadFromDatabase(url) {
  const { Client } = require('pg');
  const needsSsl = /supabase\.(co|com)|sslmode=require/i.test(url) || process.env.PGSSL === 'true';
  const client = new Client({
    connectionString: url,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const places = await client.query(`
      SELECT id, name, slug, location, country, city, district, category, status,
             image_url, description, overview, history, tips,
             description_en, overview_en, history_en, tips_en,
             photos, lat, lng, COALESCE(tiola_count, 0) AS tiola_count
      FROM places
      ORDER BY id
    `);
    let approved = new Map();
    try {
      const tiolas = await client.query(`
        SELECT place_id, COUNT(*)::int AS approved
        FROM tiolas
        WHERE status = 'approved'
        GROUP BY place_id
      `);
      approved = new Map(tiolas.rows.map((row) => [Number(row.place_id), Number(row.approved) || 0]));
    } catch (err) {
      console.error('Tiola sayımı okunamadı, kayıtlı tiola_count kullanılacak:', safeError(err));
    }
    await client.query('ROLLBACK');
    return {
      source: 'postgresql',
      places: places.rows.map((row) => normalizePlace(row, approved.get(Number(row.id)) || 0)),
    };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* bağlantı kapanıyor */ }
    throw err;
  } finally {
    await client.end();
  }
}

function loadFromJson() {
  const raw = JSON.parse(fs.readFileSync(PLACES_JSON, 'utf8'));
  if (!Array.isArray(raw)) throw new Error('places.json dizi değil');
  return {
    source: 'places.json',
    places: raw.map((row) => normalizePlace(row, null)),
  };
}

async function loadPlaces() {
  const forced = textOf(process.env.AUDIT_PLACES_SOURCE).toLowerCase();
  if (forced === 'json') return loadFromJson();
  const url = textOf(process.env.DATABASE_URL);
  if (!url) {
    if (forced === 'db') throw new Error('DATABASE_URL yok');
    return loadFromJson();
  }
  try {
    return await loadFromDatabase(url);
  } catch (err) {
    if (forced === 'db') throw err;
    console.error('Veritabanı okunamadı, places.json kullanılacak:', safeError(err));
    return loadFromJson();
  }
}

function printSummary(summary, files) {
  const c = summary.counts;
  console.log('V4 Adım 4 — salt okunur rapor');
  console.log(`  kaynak: ${summary.source}`);
  console.log(`  mekân: ${summary.placeCount} (yayında ${summary.publishedCount})`);
  console.log(`  A şablon slug: ${c.A_templates} (yayında ${c.A_templates_published})`);
  console.log(`    üretim kalıbı: ${c.A_sablon_uretim} (yayında ${c.A_sablon_uretim_published})`);
  console.log(`    gözden geçir (gerçek yer olabilir): ${c.A_gozden_gecir} (yayında ${c.A_gozden_gecir_published})`);
  console.log(`  B yinelenen çift: ${c.B_pairs} (≤300 m ${c.B_within_300m}, yalnızca slug ${c.B_slug_only}, mekân ${c.B_places})`);
  console.log(`    ikisi de yayında: ${c.B_pairs_both_published} çift, ${c.B_places_both_published} mekân (≤300 m ${c.B_within_300m_both_published}, yalnızca slug ${c.B_slug_only_both_published})`);
  console.log(`  C aynı görsel URL grubu: ${c.C_exact_url_groups} (mekân ${c.C_exact_url_places})`);
  console.log(`    aynı Unsplash karesi, farklı adres: ${c.C_unsplash_photo_groups}`);
  console.log(`  D eksik kayıt: ${c.D_thin} (koordinat ${c.D_coord}, kısa/boş metin ${c.D_text})`);
  console.log(`  E kategori/görsel uyumsuz: ${c.E_mismatches} (yayında ${c.E_mismatches_published})`);
  console.log('  yayından çıkarılan: 0');
  if (files) {
    console.log(`  dosyalar: ${path.relative(ROOT, files.summary)}`);
  }
}

async function runAudit(outDir = process.env.AUDIT_REPORT_DIR || DEFAULT_OUT) {
  const loaded = await loadPlaces();
  const report = buildReport(loaded.places, { source: loaded.source });
  const files = writeReports(report, outDir);
  return { report, files };
}

async function main() {
  const { report, files } = await runAudit();
  printSummary(report.summary, files);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(safeError(err));
    process.exit(1);
  });
}

module.exports = {
  TEMPLATE_KINDS,
  DUPLICATE_MAX_METERS,
  SHORT_BLURB_MAX,
  SLUG_JACCARD_MIN,
  templateKindFromSlug,
  slugSimilarityReasons,
  normalizePlace,
  findTemplates,
  findDuplicates,
  findSharedImages,
  findThin,
  findMismatches,
  buildReport,
  richness,
  pickFuller,
  distanceMeters,
  runAudit,
};
