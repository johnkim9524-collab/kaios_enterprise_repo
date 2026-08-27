import fs from 'node:fs';
import path from 'node:path';

const serviceRoot = path.resolve(import.meta.dirname, '..');
const repoRoot = path.resolve(serviceRoot, '..', '..');
const registry = JSON.parse(fs.readFileSync(path.join(serviceRoot, 'contracts/d1-writer-registry-v1.json'), 'utf8'));
const wranglerPath = path.join(repoRoot, 'services/kidults-autonomous-intelligence/wrangler.jsonc');
const wrangler = fs.readFileSync(wranglerPath, 'utf8');

const legacy = registry.writers.find((writer) => writer.writer_id === 'kidults-autonomous-intelligence-legacy');
if (!legacy || legacy.state !== 'LEGACY_MIGRATION_HOLD') throw new Error('LEGACY_WRITER_REGISTRY_STATE_INVALID');
if (!wrangler.includes('"D1_WRITER_MODE": "LEGACY_MIGRATION_HOLD"')) throw new Error('D1_WRITER_MODE_NOT_FAIL_CLOSED');

console.error(JSON.stringify({
  suite: 'KIDULTS_REMOTE_D1_WRITER_GUARD_V1',
  result: 'VERIFIED_FAIL',
  reason: 'LEGACY_DIRECT_D1_WRITER_REMOTE_DEPLOY_PROHIBITED_UNTIL_POSTGRESQL_PROJECTOR_CUTOVER',
  writer_id: legacy.writer_id,
  permitted_remote_writer: 'kpmo-d1-projector-v1',
  production: 'HOLD'
}, null, 2));
process.exit(1);
