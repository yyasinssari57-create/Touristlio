#!/usr/bin/env node
import { readFileSync, writeFileSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'public', 'images', 'logo-transparent.png');

const chunkFiles = [
  'C:/Users/Yasin/.cursor/browser-logs/cdp-response-Runtime.evaluate-2026-06-02T20-01-13-521Z.json',
  'C:/Users/Yasin/.cursor/browser-logs/cdp-response-Runtime.evaluate-2026-06-02T20-01-08-103Z.json',
  'C:/Users/Yasin/.cursor/browser-logs/cdp-response-Runtime.evaluate-2026-06-02T20-01-08-274Z.json',
  'C:/Users/Yasin/.cursor/browser-logs/cdp-response-Runtime.evaluate-2026-06-02T20-01-08-471Z.json',
  'C:/Users/Yasin/.cursor/browser-logs/cdp-response-Runtime.evaluate-2026-06-02T20-01-08-622Z.json',
];

function extractValue(path) {
  const j = JSON.parse(readFileSync(path, 'utf8'));
  return j.result.result.value;
}

const b64 = chunkFiles.map(extractValue).join('');
const buf = Buffer.from(b64, 'base64');
writeFileSync(OUT, buf);
console.log(`Saved: public/images/logo-transparent.png (${statSync(OUT).size} bytes)`);
