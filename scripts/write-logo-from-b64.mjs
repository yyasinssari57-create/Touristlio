#!/usr/bin/env node
import { readFileSync, writeFileSync, statSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const B64 = join(__dirname, 'logo-full.b64');
const OUT = join(ROOT, 'public', 'images', 'logo-transparent.png');

const b64 = readFileSync(B64, 'utf8').replace(/\s+/g, '');
const buf = Buffer.from(b64, 'base64');
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, buf);
console.log(`Saved: public/images/logo-transparent.png (${statSync(OUT).size} bytes)`);
