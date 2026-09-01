const { db } = require('../db');
const adminPlace = require('./admin-place');
const { sanitizeText } = require('./sanitize');

async function escapeCsv(val) {
  const s = val == null ? '' : String(val);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function exportPlacesJson() {
  const rows = await db.prepare('SELECT * FROM places ORDER BY id ASC').all();
  return rows.map((row) => {
    let photos = [];
    let tags = [];
    let searchAliases = [];
    let categories = [];
    try { photos = JSON.parse(row.photos || '[]'); } catch { /* ignore */ }
    try { tags = JSON.parse(row.tags || '[]'); } catch { /* ignore */ }
    try { searchAliases = JSON.parse(row.search_aliases || '[]'); } catch { /* ignore */ }
    try { categories = JSON.parse(row.categories || '[]'); } catch { /* ignore */ }
    return {
      id: row.id,
      name: row.name,
      location: row.location,
      country: row.country,
      city: row.city,
      district: row.district,
      category: row.category,
      imageUrl: row.image_url,
      description: row.description,
      descriptionEn: row.description_en,
      lat: row.lat,
      lng: row.lng,
      status: row.status || 'published',
      isLocal: !!row.is_local,
      entryFee: row.entry_fee,
      bestTime: row.best_time,
      photos,
      tags,
      searchAliases,
      categories,
    };
  });
}

async function exportPlacesCsv() {
  const rows = await db.prepare(`
    SELECT id, name, country, city, district, category, lat, lng, status, description, image_url
    FROM places ORDER BY id ASC
  `).all();
  const header = ['id', 'name', 'country', 'city', 'district', 'category', 'lat', 'lng', 'status', 'description', 'imageUrl'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push([
      r.id,
      escapeCsv(r.name),
      escapeCsv(r.country),
      escapeCsv(r.city),
      escapeCsv(r.district),
      escapeCsv(r.category),
      r.lat ?? '',
      r.lng ?? '',
      escapeCsv(r.status || 'published'),
      escapeCsv(r.description),
      escapeCsv(r.image_url),
    ].join(','));
  }
  return lines.join('\n');
}

async function parseCsv(text) {
  const lines = String(text || '').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const items = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = lines[i].match(/("([^"]|"")*"|[^,]*)/g) || [];
    const row = {};
    headers.forEach((h, idx) => {
      let v = (cols[idx] || '').trim();
      if (v.startsWith('"') && v.endsWith('"')) {
        v = v.slice(1, -1).replace(/""/g, '"');
      }
      row[h] = v;
    });
    if (row.name) items.push(normalizeImportRow(row));
  }
  return items;
}

function normalizeImportRow(row) {
  const lat = row.lat != null && row.lat !== '' ? Number(row.lat) : undefined;
  const lng = row.lng != null && row.lng !== '' ? Number(row.lng) : undefined;
  return {
    id: row.id ? Number(row.id) : undefined,
    name: sanitizeText(row.name, 200),
    country: sanitizeText(row.country, 120),
    city: sanitizeText(row.city, 120),
    district: sanitizeText(row.district, 120),
    category: sanitizeText(row.category, 60),
    location: sanitizeText(row.location, 200),
    description: sanitizeText(row.description, 5000),
    descriptionEn: sanitizeText(row.descriptionEn || row.description_en, 5000),
    imageUrl: sanitizeText(row.imageUrl || row.image_url, 500),
    lat: Number.isFinite(lat) ? lat : undefined,
    lng: Number.isFinite(lng) ? lng : undefined,
    status: ['published', 'draft', 'archived'].includes(row.status) ? row.status : 'published',
    photos: Array.isArray(row.photos) ? row.photos : undefined,
    searchAliases: Array.isArray(row.searchAliases) ? row.searchAliases
      : (row.search_aliases ? String(row.search_aliases).split(',').map((s) => s.trim()) : undefined),
  };
}

async function importPlaces(items, { updateExisting = true } = {}) {
  if (!Array.isArray(items) || !items.length) {
    throw new Error('İçe aktarılacak yer bulunamadı');
  }

  let created = 0;
  let updated = 0;
  const errors = [];

  for (let i = 0; i < items.length; i += 1) {
    const raw = items[i];
    try {
      const row = normalizeImportRow(raw);
      if (!row.name || !row.country || !row.city || !row.category) {
        errors.push({ index: i, error: 'Ad, ülke, şehir ve kategori zorunlu' });
        continue;
      }

      let existing = null;
      if (row.id) {
        existing = await db.prepare('SELECT id FROM places WHERE id = ?').get(row.id);
      }
      if (!existing) {
        existing = await db.prepare(`
          SELECT id FROM places WHERE name = ? AND city = ? AND country = ? LIMIT 1
        `).get(row.name, row.city, row.country);
      }

      if (existing) {
        if (!updateExisting) {
          errors.push({ index: i, error: 'Zaten mevcut', id: existing.id });
          continue;
        }
        await adminPlace.updatePlace(existing.id, row);
        updated += 1;
      } else {
        const createdRow = await adminPlace.insertPlace(row);
        created += 1;
        if (row.id && createdRow.id !== row.id) {
          /* id auto-assigned; acceptable for bulk import */
        }
      }
    } catch (err) {
      errors.push({ index: i, error: err.message || 'Hata' });
    }
  }

  return { created, updated, errors, total: items.length };
}

function parseImportPayload(body, file) {
  if (file?.buffer) {
    const text = file.buffer.toString('utf8');
    const name = (file.originalname || '').toLowerCase();
    if (name.endsWith('.csv') || file.mimetype === 'text/csv') {
      return parseCsv(text);
    }
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : (parsed.places || []);
  }
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.places)) return body.places;
  if (typeof body?.data === 'string') {
    if (body.format === 'csv') return parseCsv(body.data);
    const parsed = JSON.parse(body.data);
    return Array.isArray(parsed) ? parsed : (parsed.places || []);
  }
  throw new Error('Geçersiz içe aktarma formatı (JSON veya CSV bekleniyor)');
}

module.exports = {
  exportPlacesJson,
  exportPlacesCsv,
  importPlaces,
  parseImportPayload,
};
