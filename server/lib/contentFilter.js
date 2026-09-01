const { db } = require('../db');

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache = { words: [], loadedAt: 0 };

async function loadBannedWords() {
  const now = Date.now();
  if (now - cache.loadedAt < CACHE_TTL_MS && cache.words.length) {
    return cache.words;
  }
  const rows = await db.prepare('SELECT word FROM banned_words ORDER BY id').all();
  cache = {
    words: rows.map((r) => String(r.word || '').toLowerCase().trim()).filter(Boolean),
    loadedAt: now,
  };
  return cache.words;
}

function invalidateCache() {
  cache = { words: [], loadedAt: 0 };
}

async function containsBannedWord(text) {
  const lower = String(text || '').toLowerCase();
  if (!lower) return false;
  const words = await loadBannedWords();
  return words.some((w) => w && lower.includes(w));
}

module.exports = { containsBannedWord, invalidateCache, loadBannedWords };
