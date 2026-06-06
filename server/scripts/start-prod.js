#!/usr/bin/env node
/**
 * Production modunda sunucuyu başlatır (NODE_ENV=production).
 * .env dosyanızda production değerleri olmalı — şablon: .env.production.example
 */
process.env.NODE_ENV = 'production';
require('../index.js');
