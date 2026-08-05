import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../../..');

const steps = [
  ['B34-A2 Build', 'scripts/kidults/b34/build-intelligence-engine.mjs'],
  ['B34 Foundation Audit', 'scripts/kidults/b34/audit-intelligence-engine.mjs'],
  ['B34-A3 Normalize', 'scripts/kidults/b34/normalize-observations.mjs'],
  ['B34-A3 Audit', 'scripts/kidults/b34/audit-normalization.mjs'],
  ['B34-A4 Score', 'scripts/kidults/b34/score-intelligence.mjs'],
  ['B34-A5 Release Gate', 'scripts/kidults/b34/certify-intelligence-release.mjs'],
  ['B34-A6 Portal Integration', 'scripts/kidults/b34/certify-portal-integration.mjs']
];

for (const [label, script] of steps) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(process.execPath, [path.join(root, script)], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`\n[B34] FAILED at ${label}.`);
    process.exit(result.status || 1);
  }
}

console.log('\n[B34] INTEGRATED PASS — build, normalization, scoring, release validation and portal candidate certification completed.');
console.log('[B34] Production promotion remains disabled pending manual visual approval.');
