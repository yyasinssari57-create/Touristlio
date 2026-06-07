#!/usr/bin/env node
/**
 * Production modunda sunucuyu başlatır (NODE_ENV=production).
 * .env dosyanızda production değerleri olmalı — şablon: .env.production.example
 */
process.env.NODE_ENV = 'production';

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

require('../index.js');
