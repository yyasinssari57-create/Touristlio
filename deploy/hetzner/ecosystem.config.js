/**
 * PM2 — Touristlio production (Hetzner VPS)
 * Kullanım (proje kökünden): pm2 start deploy/hetzner/ecosystem.config.js
 */
const path = require('path');

const appRoot = path.join(__dirname, '..', '..');

module.exports = {
  apps: [
    {
      name: 'touristlio',
      script: 'server/scripts/start-prod.js',
      cwd: appRoot,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '600M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: '/var/log/touristlio/pm2-error.log',
      out_file: '/var/log/touristlio/pm2-out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
