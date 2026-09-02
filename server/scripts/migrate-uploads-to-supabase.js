#!/usr/bin/env node
/**
 * Upload local uploads/ files to Supabase Storage and rewrite DB paths.
 * Usage: node server/scripts/migrate-uploads-to-supabase.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { initDb, db } = require('../db');
const storage = require('../lib/supabase-storage');
const { publicImageUrl } = require('../lib/media-url');

const ROOT = path.join(__dirname, '..', '..');
const UPLOADS = path.join(ROOT, 'uploads');
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

function walk(dir, baseRel, acc) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    const rel = baseRel ? `${baseRel}/${ent.name}` : ent.name;
    if (ent.isDirectory()) {
      walk(full, rel, acc);
      continue;
    }
    if (!IMAGE_EXT.has(path.extname(ent.name).toLowerCase())) continue;
    acc.push({ full, rel: rel.replace(/\\/g, '/') });
  }
}

function mimeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
}

function rewriteValue(value) {
  if (!value) return value;
  const s = String(value);
  if (/^https?:\/\//i.test(s) && !/\/uploads\//i.test(s) && !s.includes('storage/v1/object')) {
    return s;
  }
  if (s.startsWith('/uploads/') || (!s.includes('://') && s.length > 3)) {
    return publicImageUrl(s) || s;
  }
  return s;
}

function rewritePhotosJson(raw) {
  let arr;
  try { arr = JSON.parse(raw || '[]'); } catch { return raw; }
  if (!Array.isArray(arr)) return raw;
  const next = arr.map((u) => rewriteValue(u));
  return JSON.stringify(next);
}

async function main() {
  if (!storage.isEnabled()) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_KEY required');
    process.exit(1);
  }
  await initDb();
  await storage.ensureBucket();

  const files = [];
  walk(UPLOADS, '', files);
  console.log(`Local uploads files: ${files.length}`);

  let uploaded = 0;
  let skipped = 0;
  for (const f of files) {
    try {
      const buf = fs.readFileSync(f.full);
      await storage.uploadObjectUpsert(f.rel, buf, mimeFor(f.full));
      uploaded += 1;
      if (uploaded % 20 === 0) console.log(`  uploaded ${uploaded}/${files.length}`);
    } catch (err) {
      skipped += 1;
      console.warn('skip', f.rel, err.message);
    }
  }

  const places = await db.prepare('SELECT id, image_url, photos FROM places').all();
  let placesUpdated = 0;
  for (const p of places) {
    const imageUrl = rewriteValue(p.image_url);
    const photos = rewritePhotosJson(p.photos);
    if (imageUrl !== p.image_url || photos !== p.photos) {
      await db.prepare('UPDATE places SET image_url = ?, photos = ? WHERE id = ?').run(imageUrl, photos, p.id);
      placesUpdated += 1;
    }
  }

  const users = await db.prepare('SELECT id, avatar_url FROM users WHERE avatar_url IS NOT NULL').all();
  let usersUpdated = 0;
  for (const u of users) {
    const next = rewriteValue(u.avatar_url);
    if (next !== u.avatar_url) {
      await db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(next, u.id);
      usersUpdated += 1;
    }
  }

  const tiolas = await db.prepare('SELECT id, photo_path FROM tiolas WHERE photo_path IS NOT NULL AND photo_path != \'\'').all();
  let tiolasUpdated = 0;
  for (const t of tiolas) {
    const next = rewriteValue(t.photo_path);
    if (next !== t.photo_path) {
      await db.prepare('UPDATE tiolas SET photo_path = ? WHERE id = ?').run(next, t.id);
      tiolasUpdated += 1;
    }
  }

  console.log(JSON.stringify({
    uploaded,
    skipped,
    placesUpdated,
    usersUpdated,
    tiolasUpdated,
    bucket: storage.BUCKET,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
