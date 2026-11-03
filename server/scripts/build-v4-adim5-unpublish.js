/**
 * Writes server/data/v4-adim5-unpublish.json and sets status=draft
 * on those places in server/data/places.json. Does not delete rows.
 *
 * Usage: node server/scripts/build-v4-adim5-unpublish.js
 */
const fs = require('fs');
const path = require('path');
const { planUnpublish, withSeedSlugs } = require('../lib/v4-adim5-plan');

const ROOT = path.join(__dirname, '..', '..');
const PLACES = path.join(ROOT, 'server', 'data', 'places.json');
const PLAN = path.join(ROOT, 'server', 'data', 'v4-adim5-unpublish.json');

function patchStatus(text, ids) {
  const idSet = new Set(ids.map((id) => Number(id)));
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  const out = [];
  let inserted = 0;
  for (let i = 0; i < lines.length; i += 1) {
    out.push(lines[i]);
    const match = lines[i].match(/^(\s*)"id": (\d+),$/);
    if (!match) continue;
    const id = Number(match[2]);
    if (!idSet.has(id)) continue;
    const next = lines[i + 1] || '';
    if (/"status"\s*:/.test(next)) continue;
    out.push(`${match[1]}"status": "draft",`);
    inserted += 1;
  }
  return { text: out.join(newline), inserted };
}

function main() {
  const rawText = fs.readFileSync(PLACES, 'utf8');
  const raw = JSON.parse(rawText);
  if (!Array.isArray(raw)) throw new Error('places.json dizi değil');
  const places = withSeedSlugs(raw);
  const plan = planUnpublish(places);
  const payload = {
    note: 'V4 Adım 5. Silinmedi. status=draft. 16 gözden geçir ve yalnızca yakın koordinat çiftleri duruyor.',
    counts: plan.counts,
    drafts: plan.drafts,
    redirects: plan.redirects,
    protected: plan.protected,
  };
  fs.writeFileSync(PLAN, `${JSON.stringify(payload, null, 2)}\n`);
  const patched = patchStatus(rawText, plan.drafts.map((row) => row.id));
  if (patched.inserted !== plan.drafts.length) {
    const parsed = JSON.parse(patched.text);
    const have = new Set(parsed.filter((row) => row.status === 'draft').map((row) => Number(row.id)));
    const missing = plan.drafts.filter((row) => !have.has(Number(row.id)));
    if (missing.length) {
      throw new Error(`status yazılamadı: ${missing.map((row) => row.id).join(', ')}`);
    }
  }
  fs.writeFileSync(PLACES, patched.text);
  console.log(JSON.stringify({
    drafts: plan.counts.drafts,
    templateDrafts: plan.counts.templateDrafts,
    duplicateDrafts: plan.counts.duplicateDrafts,
    redirects: plan.counts.redirects,
    protected: plan.counts.protected,
    inserted: patched.inserted,
  }));
}

main();
