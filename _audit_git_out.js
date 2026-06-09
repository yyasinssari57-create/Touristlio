const { execSync } = require('child_process');
const fs = require('fs');
const out = [];
for (const c of ['git status --porcelain', 'git log -3 --oneline', 'git rev-parse HEAD', 'git rev-parse origin/main']) {
  out.push('=== ' + c + ' ===');
  try { out.push(execSync(c, { encoding: 'utf8', cwd: __dirname }).trim()); } catch (e) { out.push(String(e.message)); }
}
fs.writeFileSync(require('path').join(__dirname, '_audit_git_out.txt'), out.join('\n'));
