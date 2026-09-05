#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const result = spawnSync(
  process.execPath,
  [path.join(root, 'server/scripts/verify-gemini-faz4.js')],
  { stdio: 'inherit', cwd: root },
);
process.exit(result.status ?? 1);
