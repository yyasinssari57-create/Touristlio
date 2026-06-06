#!/usr/bin/env node
/**
 * Güçlü JWT_SECRET üretir — production .env dosyanıza yapıştırın.
 * Kullanım: npm run generate:jwt-secret
 */
const crypto = require('crypto');

const secret = crypto.randomBytes(32).toString('hex');
console.log('');
console.log('JWT_SECRET (64 karakter hex — production .env dosyanıza ekleyin):');
console.log('');
console.log(secret);
console.log('');
console.log('Örnek:');
console.log(`JWT_SECRET=${secret}`);
console.log('');
