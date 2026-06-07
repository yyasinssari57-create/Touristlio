#!/usr/bin/env node
/**
 * Production modunda sunucuyu başlatır (NODE_ENV=production).
 * .env dosyanızda production değerleri olmalı — şablon: .env.production.example
 */
require('dotenv').config();
process.env.NODE_ENV = 'production';

const crypto = require('crypto');
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  process.env.JWT_SECRET = crypto.randomBytes(48).toString('hex');
  console.warn(
    '[start-prod] JWT_SECRET auto-generated for this boot. '
    + 'Set JWT_SECRET in Render Environment for stable sessions across redeploys.',
  );
}

function logFatal(label, err) {
  const code = err?.code ? `[${err.code}] ` : '';
  const message = err?.message || String(err);
  console.error(`[start-prod] ${label}: ${code}${message}`);
  if (err?.stack) console.error(err.stack);
  process.exit(1);
}

process.on('uncaughtException', (err) => logFatal('uncaughtException', err));
process.on('unhandledRejection', (reason) => {
  logFatal('unhandledRejection', reason instanceof Error ? reason : new Error(String(reason)));
});

try {
  require('../index.js');
} catch (err) {
  logFatal('startup', err);
}
