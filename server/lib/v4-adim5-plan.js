/**
 * V4 Adım 5 — yayından çıkarılacak güvenli küme.
 * Silmez. 16 gözden geçir eski şehri, yalnızca ≤300 m çiftleri ve
 * ortak Unsplash gruplarını taslağa almaz.
 *
 * Slug, boş veritabanında seed.js ile aynı sırayı izler: ilk kayıt kök slug,
 * çakışan sonraki kayıt -2, -3… Böylece Malecón / Malecon ayrı kalır.
 */
const { slugify } = require('./slugify');
const { slugFromPlace } = require('./place-lookup');
const audit = require('../scripts/audit-places-quality');

const SLUG_REASONS = new Set(['slug_equal', 'slug_substring', 'slug_similar']);

function pairReasons(pair) {
  return String(pair.reasons || '').split('|').filter(Boolean);
}

function numId(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : value;
}

/** Same slug sequence as server/seed.js on an empty places table. */
function assignSeedSlug(raw, used) {
  const base = raw && raw.slug ? raw.slug : slugFromPlace(raw || {});
  let slug = slugify(base) || 'place';
  const root = slug;
  let n = 2;
  while (used.has(slug)) {
    slug = `${root}-${n}`;
    n += 1;
  }
  used.add(slug);
  return slug;
}

function withSeedSlugs(rawPlaces) {
  const used = new Set();
  return (rawPlaces || []).map((raw) => {
    const slug = assignSeedSlug(raw, used);
    return audit.normalizePlace({ ...raw, slug }, null);
  });
}

function planUnpublish(places) {
  const list = Array.isArray(places) ? places : [];
  const byId = new Map(list.map((place) => [numId(place.id), place]));
  const templates = audit.findTemplates(list);
  const review = templates.filter((row) => row.review_hint === 'gozden_gecir');
  const generated = templates.filter((row) => row.review_hint === 'sablon_uretim');
  const protectedIds = new Set(review.map((row) => numId(row.id)));
  const generatedIds = new Set(generated.map((row) => numId(row.id)));

  const draftReason = new Map();
  for (const row of generated) {
    const id = numId(row.id);
    if (protectedIds.has(id)) continue;
    draftReason.set(id, 'sablon_uretim');
  }

  const duplicates = audit.findDuplicates(list);
  let nearbyOnlyPairs = 0;
  let similarPairs = 0;
  const edges = [];

  for (const pair of duplicates) {
    const reasons = pairReasons(pair);
    const slugLike = reasons.some((reason) => SLUG_REASONS.has(reason));
    const close = reasons.includes('within_300m');
    if (close || !slugLike) {
      nearbyOnlyPairs += 1;
      continue;
    }
    similarPairs += 1;
    const fullerId = numId(pair.fuller_id);
    const poorerId = fullerId === numId(pair.id_a) ? numId(pair.id_b) : numId(pair.id_a);
    const fuller = byId.get(fullerId);
    const poorer = byId.get(poorerId);
    if (!fuller || !poorer) continue;

    if (protectedIds.has(poorerId)) {
      if (draftReason.has(fullerId)) {
        edges.push({
          fromId: fullerId,
          toId: poorerId,
          toScore: Number(pair.fuller_id) === Number(pair.id_a) ? Number(pair.score_b) : Number(pair.score_a),
        });
      }
      continue;
    }

    if (generatedIds.has(fullerId) && !generatedIds.has(poorerId)) {
      const poorerScore = fullerId === numId(pair.id_a) ? Number(pair.score_b) : Number(pair.score_a);
      edges.push({ fromId: fullerId, toId: poorerId, toScore: poorerScore });
      continue;
    }

    if (!draftReason.has(poorerId)) draftReason.set(poorerId, 'yinelenen_adres');
    const fullerScore = fullerId === numId(pair.id_a) ? Number(pair.score_a) : Number(pair.score_b);
    edges.push({ fromId: poorerId, toId: fullerId, toScore: fullerScore });
  }

  const bestEdge = new Map();
  for (const edge of edges) {
    if (edge.fromId === edge.toId) continue;
    if (!draftReason.has(edge.fromId)) continue;
    const prev = bestEdge.get(edge.fromId);
    if (!prev || edge.toScore > prev.toScore) bestEdge.set(edge.fromId, edge);
  }

  function finalTargetId(fromId) {
    let current = fromId;
    const seen = new Set();
    while (bestEdge.has(current)) {
      if (seen.has(current)) return null;
      seen.add(current);
      current = bestEdge.get(current).toId;
    }
    if (current == null || current === fromId || draftReason.has(current)) return null;
    return byId.has(current) ? current : null;
  }

  const redirects = [];
  for (const fromId of draftReason.keys()) {
    const toId = finalTargetId(fromId);
    if (toId == null) continue;
    const from = byId.get(fromId);
    const to = byId.get(toId);
    if (!from || !to || !from.slug || !to.slug || from.slug === to.slug) continue;
    redirects.push({
      fromId: from.id,
      fromSlug: from.slug,
      fromName: from.name,
      toId: to.id,
      toSlug: to.slug,
      toName: to.name,
    });
  }
  redirects.sort((a, b) => String(a.fromSlug).localeCompare(String(b.fromSlug)) || (numId(a.fromId) - numId(b.fromId)));

  const drafts = [];
  for (const [id, reason] of draftReason.entries()) {
    const place = byId.get(id);
    if (!place || protectedIds.has(id)) continue;
    drafts.push({
      id: place.id,
      slug: place.slug,
      name: place.name,
      city: place.city,
      country: place.country,
      reason,
    });
  }
  drafts.sort((a, b) => String(a.slug).localeCompare(String(b.slug)) || (numId(a.id) - numId(b.id)));

  const protectedPlaces = review.map((row) => {
    const place = byId.get(numId(row.id)) || row;
    return {
      id: place.id,
      slug: place.slug,
      name: place.name,
      city: place.city,
      country: place.country,
    };
  }).sort((a, b) => String(a.name).localeCompare(String(b.name)));

  return {
    drafts,
    redirects,
    protected: protectedPlaces,
    counts: {
      templatesGenerated: generated.length,
      templatesReview: review.length,
      templateDrafts: drafts.filter((row) => row.reason === 'sablon_uretim').length,
      duplicateDrafts: drafts.filter((row) => row.reason === 'yinelenen_adres').length,
      drafts: drafts.length,
      redirects: redirects.length,
      protected: protectedPlaces.length,
      nearbyOnlyPairs,
      similarPairs,
    },
  };
}

module.exports = {
  planUnpublish,
  withSeedSlugs,
  assignSeedSlug,
  SLUG_REASONS,
};
