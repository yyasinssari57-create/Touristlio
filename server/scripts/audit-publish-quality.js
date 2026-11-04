/**
 * V4 Adım 6 — yayındaki eksik kayıtlar. Salt okunur.
 * Kayıt silinmez, taslağa çekilmez, durum değişmez.
 *
 * Çalıştırma: npm run audit:publish-quality
 * Çıktı (gitignore): reports/v4-adim6-eksik-yayin.csv ve reports/v4-adim6-ozet.json
 *
 * Kaynak: DATABASE_URL varsa PostgreSQL (BEGIN READ ONLY), yoksa server/data/places.json.
 * AUDIT_PLACES_SOURCE=json veya db ile kaynak zorlanır.
 */
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { isPublishedPlaceStatus } = require('../lib/place-status');
const { missingPublishFields, fieldLabels } = require('../lib/publish-quality');
const { emptyNamedSections } = require('../../public/js/place-sections');

const ROOT = path.join(__dirname, '..', '..');
const DEFAULT_OUT = path.join(ROOT, 'reports');
const PLACES_JSON = path.join(__dirname, '..', 'data', 'places.json');

function text(value) {
  return String(value == null ? '' : value).trim();
}

function csvCell(value) {
  const raw = value == null ? '' : String(value);
  if (/[",\n]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

function toPlace(raw) {
  return {
    id: raw.id,
    name: raw.name || '',
    slug: raw.slug || '',
    city: raw.city || '',
    country: raw.country || '',
    category: raw.category || '',
    status: raw.status || 'published',
    description: raw.description || '',
    lat: raw.lat,
    lng: raw.lng,
    imageUrl: raw.imageUrl || raw.image_url || '',
    photos: raw.photos || [],
    infoSourceUrl: raw.infoSourceUrl || raw.info_source_url || '',
    infoVerifiedAt: raw.infoVerifiedAt || raw.info_verified_at || null,
    imageVerified: raw.imageVerified,
    image_verified: raw.image_verified,
    history: raw.history || '',
    historyEn: raw.historyEn || raw.history_en || '',
    thingsToDo: raw.thingsToDo || raw.things_to_do || [],
    thingsToDoEn: raw.thingsToDoEn || raw.things_to_do_en || [],
    cultureFood: raw.cultureFood || raw.culture_food || '',
    cultureFoodEn: raw.cultureFoodEn || raw.culture_food_en || '',
    travelTips: raw.travelTips || raw.travel_tips || '',
    tips: raw.tips || '',
    tipsEn: raw.tipsEn || raw.tips_en || '',
    bestTime: raw.bestTime || raw.best_time || '',
    howToGetThere: raw.howToGetThere || raw.how_to_get_there || '',
    tags: raw.tags || [],
  };
}

function buildReport(places, source) {
  const gaps = [];
  const fieldCounts = {
    name: 0,
    descriptionTr: 0,
    coords: 0,
    category: 0,
    verifiedImage: 0,
    sourceOrDate: 0,
  };
  const sectionCounts = { tarihce: 0, yapilacaklar: 0, kultur: 0, ipuclari: 0 };
  let publishedCount = 0;
  let anyEmptySection = 0;

  for (const place of places) {
    if (!isPublishedPlaceStatus(place.status)) continue;
    publishedCount += 1;
    const missing = missingPublishFields(place);
    const emptySections = emptyNamedSections(place, 'tr');
    if (emptySections.length) anyEmptySection += 1;
    for (const key of emptySections) sectionCounts[key] += 1;
    if (!missing.length) continue;
    for (const key of missing) fieldCounts[key] += 1;
    gaps.push({
      id: place.id,
      name: place.name,
      slug: place.slug,
      city: place.city,
      country: place.country,
      missing: fieldLabels(missing).join(' | '),
      empty_sections: emptySections.join(' | '),
    });
  }

  gaps.sort((a, b) => Number(a.id) - Number(b.id));
  return {
    summary: {
      source,
      placeCount: places.length,
      publishedCount,
      gapCount: gaps.length,
      fieldCounts,
      emptySectionCounts: sectionCounts,
      publishedWithEmptySection: anyEmptySection,
      statusChanges: 0,
      note: 'Eksik yayınlar listelendi. Taslağa çekilmedi.',
    },
    gaps,
  };
}

function writeReports(report, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const csvPath = path.join(outDir, 'v4-adim6-eksik-yayin.csv');
  const jsonPath = path.join(outDir, 'v4-adim6-ozet.json');
  const columns = ['id', 'name', 'slug', 'city', 'country', 'missing', 'empty_sections'];
  const lines = [columns.join(',')];
  for (const row of report.gaps) {
    lines.push(columns.map((column) => csvCell(row[column])).join(','));
  }
  fs.writeFileSync(csvPath, `${lines.join('\n')}\n`, 'utf8');
  fs.writeFileSync(jsonPath, `${JSON.stringify(report.summary, null, 2)}\n`, 'utf8');
  return { csv: csvPath, summary: jsonPath };
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
      SELECT id, name, slug, city, country, category, status,
             description, lat, lng, image_url, photos,
             info_source_url, info_verified_at,
             history, history_en, things_to_do, things_to_do_en,
             culture_food, culture_food_en, travel_tips, tips, tips_en,
             best_time, how_to_get_there, tags
      FROM places
      ORDER BY id
    `);
    await client.query('ROLLBACK');
    return {
      source: 'postgresql',
      places: places.rows.map(toPlace),
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
    places: raw.map(toPlace),
  };
}

async function loadPlaces() {
  const forced = text(process.env.AUDIT_PLACES_SOURCE).toLowerCase();
  if (forced === 'json') return loadFromJson();
  const url = text(process.env.DATABASE_URL);
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
  const f = summary.fieldCounts;
  const s = summary.emptySectionCounts;
  console.log('V4 Adım 6 — salt okunur yayın kapısı raporu');
  console.log(`  kaynak: ${summary.source}`);
  console.log(`  mekân: ${summary.placeCount} (yayında ${summary.publishedCount})`);
  console.log(`  eksik yayın: ${summary.gapCount}`);
  console.log(`    ad: ${f.name}`);
  console.log(`    açıklama (TR): ${f.descriptionTr}`);
  console.log(`    koordinat: ${f.coords}`);
  console.log(`    kategori: ${f.category}`);
  console.log(`    doğrulanmış görsel: ${f.verifiedImage}`);
  console.log(`    kaynak URL veya doğrulama tarihi: ${f.sourceOrDate}`);
  console.log(`  boş bölüm (yayında): tarihçe ${s.tarihce}, yapılacaklar ${s.yapilacaklar}, kültür ${s.kultur}, ipuçları ${s.ipuclari}`);
  console.log(`  boş bölümü olan yayın: ${summary.publishedWithEmptySection}`);
  console.log('  taslağa çekilen: 0');
  if (files) console.log(`  dosya: ${path.relative(ROOT, files.summary)}`);
}

async function runAudit(outDir = process.env.AUDIT_REPORT_DIR || DEFAULT_OUT) {
  const loaded = await loadPlaces();
  const report = buildReport(loaded.places, loaded.source);
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
  buildReport,
  toPlace,
  loadFromJson,
  runAudit,
  printSummary,
};
