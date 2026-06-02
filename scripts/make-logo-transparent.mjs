#!/usr/bin/env node
/**
 * Remove dark background from navbar logo PNG → logo-transparent.png
 * No npm deps — Node 18+ (zlib, fs only). Python twin: make-logo-transparent.py
 */
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createInflate, createDeflateRaw } from 'zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const IMG_DIR = join(ROOT, 'public', 'images');
const OUTPUT = join(IMG_DIR, 'logo-transparent.png');
const CANDIDATES = ['logo-round.png', 'logo.png', 'logo-emblem.png', 'logo-nav.png'];

function pickSource() {
  for (const name of CANDIDATES) {
    const path = join(IMG_DIR, name);
    if (existsSync(path)) return path;
  }
  throw new Error(`No source PNG in ${IMG_DIR}`);
}

function readFileBuffer(path) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    createReadStream(path)
      .on('data', (c) => chunks.push(c))
      .on('end', () => resolve(Buffer.concat(chunks)))
      .on('error', reject);
  });
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function unfilter(type, row, prev, bpp) {
  const out = Buffer.from(row);
  switch (type) {
    case 0:
      break;
    case 1:
      for (let i = bpp; i < out.length; i++) out[i] = (out[i] + out[i - bpp]) & 255;
      break;
    case 2:
      if (prev) for (let i = 0; i < out.length; i++) out[i] = (out[i] + prev[i]) & 255;
      break;
    case 3:
      for (let i = 0; i < out.length; i++) {
        const left = i >= bpp ? out[i - bpp] : 0;
        const up = prev ? prev[i] : 0;
        out[i] = (out[i] + Math.floor((left + up) / 2)) & 255;
      }
      break;
    case 4:
      for (let i = 0; i < out.length; i++) {
        const left = i >= bpp ? out[i - bpp] : 0;
        const up = prev ? prev[i] : 0;
        const upLeft = i >= bpp && prev ? prev[i - bpp] : 0;
        out[i] = (out[i] + paeth(left, up, upLeft)) & 255;
      }
      break;
    default:
      throw new Error(`Unsupported PNG filter ${type}`);
  }
  return out;
}

function filterNone(row) {
  return Buffer.concat([Buffer.from([0]), row]);
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
  }
  return (~c) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function inflateRaw(data) {
  return new Promise((resolve, reject) => {
    const inf = createInflate();
    const chunks = [];
    inf.on('data', (c) => chunks.push(c));
    inf.on('end', () => resolve(Buffer.concat(chunks)));
    inf.on('error', reject);
    inf.end(data);
  });
}

function deflateRaw(data) {
  return new Promise((resolve, reject) => {
    const def = createDeflateRaw();
    const chunks = [];
    def.on('data', (c) => chunks.push(c));
    def.on('end', () => resolve(Buffer.concat(chunks)));
    def.on('error', reject);
    def.end(data);
  });
}

async function decodePng(buffer) {
  if (buffer.toString('ascii', 0, 8) !== '\x89PNG\r\n\x1a\n') throw new Error('Not a PNG');
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idats = [];
  while (offset + 8 <= buffer.length) {
    const len = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idats.push(data);
    } else if (type === 'IEND') break;
    offset += 12 + len;
  }
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`Unsupported PNG format depth=${bitDepth} color=${colorType}`);
  }
  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp;
  const raw = await inflateRaw(Buffer.concat(idats));
  const rows = [];
  let prev = null;
  for (let y = 0; y < height; y++) {
    const type = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = unfilter(type, row, prev, bpp);
    rows.push(cur);
    prev = cur;
  }
  return { width, height, colorType, rows, bpp, stride };
}

async function encodePngRgba(width, height, rgbaRows) {
  const stride = width * 4;
  const filtered = Buffer.concat(rgbaRows.map((row) => filterNone(row)));
  const compressed = await deflateRaw(filtered);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from('\x89PNG\r\n\x1a\n'),
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function rowsToRgba(decoded) {
  const { width, height, colorType, rows } = decoded;
  const out = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(width * 4);
    for (let x = 0; x < width; x++) {
      const i = x * 4;
      if (colorType === 6) {
        row[i] = rows[y][x * 4];
        row[i + 1] = rows[y][x * 4 + 1];
        row[i + 2] = rows[y][x * 4 + 2];
        row[i + 3] = rows[y][x * 4 + 3];
      } else {
        row[i] = rows[y][x * 3];
        row[i + 1] = rows[y][x * 3 + 1];
        row[i + 2] = rows[y][x * 3 + 2];
        row[i + 3] = 255;
      }
    }
    out.push(row);
  }
  return out;
}

function applyMask(rgbaRows) {
  for (const row of rgbaRows) {
    for (let i = 0; i < row.length; i += 4) {
      const r = row[i];
      const g = row[i + 1];
      const b = row[i + 2];
      if (r < 80 && g < 80 && b < 80) {
        row[i] = 0;
        row[i + 1] = 0;
        row[i + 2] = 0;
        row[i + 3] = 0;
      }
    }
  }
}

async function main() {
  const src = pickSource();
  console.log(`Source: ${src.replace(ROOT + '\\', '').replace(ROOT + '/', '')}`);
  const buf = await readFileBuffer(src);
  const decoded = await decodePng(buf);
  const rgbaRows = rowsToRgba(decoded);
  applyMask(rgbaRows);
  const out = await encodePngRgba(decoded.width, decoded.height, rgbaRows);
  mkdirSync(IMG_DIR, { recursive: true });
  writeFileSync(OUTPUT, out);
  console.log(`Saved: public/images/logo-transparent.png (${statSync(OUTPUT).size} bytes)`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
