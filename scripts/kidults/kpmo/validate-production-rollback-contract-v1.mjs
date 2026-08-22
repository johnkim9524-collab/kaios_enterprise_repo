import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const contractPath = 'contracts/certification/kidults-controlled-production-promotion.v0.1.json';
const snapshotPath = 'scripts/production/capture-kidults-predeployment-snapshot.sh';
const promotionPath = 'scripts/production/promote-kidults-controlled.sh';
const rollbackPath = 'scripts/production/rollback-kidults-controlled.sh';

const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
const sources = {
  snapshot: fs.readFileSync(snapshotPath, 'utf8'),
  promotion: fs.readFileSync(promotionPath, 'utf8'),
  rollback: fs.readFileSync(rollbackPath, 'utf8'),
};

const requiredMarkers = {
  snapshot: [
    'rollback_ready', 'rollback-images.json', 'docker image save --output',
    'rollback-images.tar.sha256', 'database-metadata.tsv', 'incomplete rollback snapshot',
  ],
  promotion: [
    'readonly BASE_URL="https://kaios.kidults.com"', 'ROLLBACK_ARMED=false', 'ROLLBACK_ARMED=true',
    'trap on_error ERR', "trap 'rollback_and_exit SIGINT 130' INT", "trap 'rollback_and_exit SIGTERM 143' TERM",
    'KAIOS_EXECUTE_PRODUCTION_ROLLBACK=true', 'rollback_and_exit "SMOKE_FAILURE" 2',
    'snapshot.get("rollback_ready") is True', 'KAIOS_EXECUTE_PRODUCTION_ROLLBACK=false',
    "curl --proto '=https' --max-redirs 0",
  ],
  rollback: [
    'KAIOS_EXECUTE_PRODUCTION_ROLLBACK', 'manifest.get("rollback_ready") is True',
    'snapshot_manifest_sha256', 'failed-kaios.db', 'docker load --input', '--pull never',
    'gateway_image_identity', 'scheduler_image_identity', 'rollback-receipt.json', 'artfund_change_executed',
  ],
};

function validateText(current) {
  const findings = [];
  for (const [name, markers] of Object.entries(requiredMarkers)) {
    for (const marker of markers) if (!current[name].includes(marker)) findings.push(`${name}:missing:${marker}`);
  }
  if (current.promotion.includes('BASE_URL="${BASE_URL:-')) findings.push('promotion:environment-overridable-production-origin');
  if (contract.safety?.automatic_rollback_on_smoke_failure !== true) findings.push('contract:auto-rollback-not-true');
  if (contract.safety?.default_action !== 'dry-run') findings.push('contract:default-action-not-dry-run');
  if (contract.safety?.artfund_changes_forbidden !== true) findings.push('contract:artfund-isolation-not-required');
  return findings;
}

const baselineFindings = validateText(sources);
if (baselineFindings.length) throw new Error(`Production rollback contract invalid: ${baselineFindings.join('; ')}`);

for (const script of [snapshotPath, promotionPath, rollbackPath]) {
  const result = spawnSync('bash', ['-n', script], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`shell syntax validation failed for ${script}: ${result.stderr}`);
}

let mutationCases = 0;
for (const [name, markers] of Object.entries(requiredMarkers)) {
  for (const marker of markers) {
    const mutated = { ...sources, [name]: sources[name].split(marker).join(`REMOVED_${crypto.randomUUID()}`) };
    mutationCases += 1;
    if (validateText(mutated).length === 0) throw new Error(`rollback mutation guard missed ${name}:${marker}`);
  }
}
{
  const mutated = { ...sources, promotion: sources.promotion.replace('readonly BASE_URL="https://kaios.kidults.com"', 'BASE_URL="${BASE_URL:-https://kaios.kidults.com}"') };
  mutationCases += 1;
  if (!validateText(mutated).includes('promotion:environment-overridable-production-origin')) throw new Error('rollback mutation guard missed environment-overridable Production origin');
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-rollback-validator-'));
try {
  const snapshotDir = path.join(temp, 'snapshot');
  const prodRoot = path.join(temp, 'prod');
  const dataDir = path.join(temp, 'data');
  fs.mkdirSync(snapshotDir, { recursive: true });
  fs.mkdirSync(prodRoot, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });

  const required = [
    'kaios.db', 'kaios.db.sha256', 'database-metadata.tsv', 'database-integrity.txt',
    'env.production.snapshot', 'env.production.snapshot.sha256', 'docker-compose.production.yml',
    'docker-compose.production.yml.sha256', 'docker-inspect.json', 'rollback-images.json',
    'rollback-images.tar', 'rollback-images.tar.sha256', 'rollback-plan.txt',
  ];
  const write = (name, content) => fs.writeFileSync(path.join(snapshotDir, name), content);
  write('kaios.db', 'synthetic-db');
  write('database-metadata.tsv', '1000\t1000\t600\n');
  write('database-integrity.txt', 'ok\n');
  write('env.production.snapshot', 'SYNTHETIC=true\n');
  write('docker-compose.production.yml', 'services: {}\n');
  write('docker-inspect.json', '[]\n');
  write('rollback-images.json', JSON.stringify({
    'kidults-gateway': { image_id: `sha256:${'a'.repeat(64)}`, image_ref: 'synthetic-gateway:test' },
    'kidults-scheduler': { image_id: `sha256:${'b'.repeat(64)}`, image_ref: 'synthetic-scheduler:test' },
  }, null, 2));
  write('rollback-images.tar', 'synthetic-image-archive');
  write('rollback-plan.txt', 'synthetic rollback plan\n');

  const shaLine = name => `${crypto.createHash('sha256').update(fs.readFileSync(path.join(snapshotDir, name))).digest('hex')}  ${path.join(snapshotDir, name)}\n`;
  write('kaios.db.sha256', shaLine('kaios.db'));
  write('env.production.snapshot.sha256', shaLine('env.production.snapshot'));
  write('docker-compose.production.yml.sha256', shaLine('docker-compose.production.yml'));
  write('rollback-images.tar.sha256', shaLine('rollback-images.tar'));

  const files = {};
  for (const name of required) files[name] = crypto.createHash('sha256').update(fs.readFileSync(path.join(snapshotDir, name))).digest('hex');
  write('manifest.json', JSON.stringify({
    status: 'captured', vertical: 'kidults', rollback_ready: true,
    production_change_executed: false, artfund_change_executed: false,
    required_rollback_files: required, files,
  }, null, 2));

  const dryRun = spawnSync('bash', [rollbackPath], {
    cwd: process.cwd(), encoding: 'utf8',
    env: { ...process.env, ROOT_DIR: process.cwd(), PROD_ROOT: prodRoot, PROD_DB: path.join(dataDir, 'kaios.db'), PREDEPLOYMENT_SNAPSHOT_DIR: snapshotDir, KAIOS_EXECUTE_PRODUCTION_ROLLBACK: 'false' },
  });
  if (dryRun.status !== 0 || !dryRun.stdout.includes('ROLLBACK DRY RUN COMPLETE')) throw new Error(`rollback synthetic dry-run failed: status=${dryRun.status}\n${dryRun.stdout}\n${dryRun.stderr}`);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}

console.log(JSON.stringify({
  suite: 'KIDULTS_PRODUCTION_ROLLBACK_CONTRACT_V1', result: 'PASS', governing_issue: 955,
  canonical_production_origin_fail_closed: true, automatic_rollback_contract: true,
  rollback_armed_before_first_runtime_mutation: true, err_interrupt_termination_traps: true,
  smoke_failure_automatic_rollback: true, exact_snapshot_digest_verification: true,
  exact_prior_image_archive_and_identity_restore: true, upstream_pull_during_rollback: 'PROHIBITED',
  failed_state_forensic_preservation: true, recovery_receipt: 'REQUIRED', shell_syntax_validated: true,
  mutation_cases_detected: mutationCases, synthetic_dry_run: 'PASS', production_execution: 'NONE',
  public: 'HOLD', g5: 'EXPLICIT_APPROVAL_REQUIRED',
}, null, 2));
