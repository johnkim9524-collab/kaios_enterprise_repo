import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFile);
const cwd = resolve(currentDir, '..');
const raw = readFileSync(resolve(cwd, 'wrangler.jsonc'), 'utf8');
const cleanRaw = raw.replace(/^\uFEFF/, '');
const config = JSON.parse(cleanRaw);

const failures = [];
const db = config?.d1_databases?.find((item) => item.binding === 'DB');
if (!db) failures.push('Missing D1 binding DB.');
if (!db?.database_name) failures.push('Missing D1 database_name.');
if (!db?.database_id || db.database_id === 'REPLACE_WITH_D1_DATABASE_ID') failures.push('D1 database_id is not configured.');
if (config?.main !== 'src/worker.ts') failures.push('Worker entrypoint must remain src/worker.ts.');
if (!Array.isArray(config?.triggers?.crons) || !config.triggers.crons.length) failures.push('Autonomous cron trigger is missing.');
if (config?.vars?.SOURCE_ADAPTERS_JSON === undefined) failures.push('SOURCE_ADAPTERS_JSON variable is missing.');
if (!config?.vars?.METHODOLOGY_VERSION) failures.push('METHODOLOGY_VERSION is missing.');
if (!config?.vars?.MIN_EVIDENCE_FOR_PUBLISH) failures.push('MIN_EVIDENCE_FOR_PUBLISH is missing.');

try {
  const adapters = JSON.parse(config?.vars?.SOURCE_ADAPTERS_JSON || '[]');
  if (!Array.isArray(adapters)) failures.push('SOURCE_ADAPTERS_JSON must be an array.');
} catch {
  failures.push('SOURCE_ADAPTERS_JSON is not valid JSON.');
}

const expectedVisualLock = 'KIDULTS Portal Visual Baseline v1.0';
const lockMigration = readFileSync(resolve(cwd, 'migrations/0002_autonomous_orchestration.sql'), 'utf8');
if (!lockMigration.includes(expectedVisualLock) || !lockMigration.includes('"locked":true')) failures.push('Visual baseline lock checkpoint is missing or changed.');

if (failures.length) {
  console.error('KIDULTS deployment preflight BLOCKED');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('KIDULTS deployment preflight PASS');
console.log(`D1: ${db.database_name} (${db.database_id})`);
console.log(`Environment: ${config?.vars?.KIDULTS_ENV || 'unspecified'}`);
console.log(`Methodology: ${config.vars.METHODOLOGY_VERSION}`);
console.log(`Cron: ${config.triggers.crons.join(', ')}`);
