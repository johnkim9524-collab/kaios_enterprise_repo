#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const token = process.env.GH_TOKEN;
const repository = process.env.GH_REPOSITORY;
const mergeSha = process.env.CURRENT_SOLD_MERGE_SHA;
const premergeMainSha = process.env.CURRENT_SOLD_PREMERGE_MAIN_SHA;
const mergedPrHeadSha = process.env.CURRENT_SOLD_MERGED_PR_HEAD_SHA;
const prNumber = process.env.CURRENT_SOLD_PR_NUMBER;
const landingRunId = process.env.CURRENT_SOLD_LANDING_RUN_ID;
const landingRunAttempt = process.env.CURRENT_SOLD_LANDING_RUN_ATTEMPT;
const authorizationId = process.env.CURRENT_SOLD_LANDING_AUTHORIZATION_ID;
const receiptPath = process.env.CURRENT_SOLD_RECEIPT_PATH || 'out/current-sold-postlanding/receipt.json';
const statusContext = 'KIDULTS Current-SOLD Post-Landing V1';

const shaPattern = /^[0-9a-f]{40}$/;
const currentSoldPathMatchers = [
  /^coordination\/kidults\/market\/current-sold-[^/]+\.json$/,
  /^scripts\/kidults\/market\/current-sold-[^/]+\.mjs$/,
  /^tests\/kidults\/market\/current-sold-[^/]+\.mjs$/,
  /^infrastructure\/postgres\/current-sold\//,
  /^docs\/kidults\/market\/current-sold-engine-v1\.md$/,
  /^\.github\/workflows\/kidults-current-sold-engine-v1\.yml$/,
  /^\.github\/workflows\/kidults-atomic-governed-landing-v1\.yml$/,
  /^scripts\/kidults\/kpmo\/run-atomic-governed-landing-v1\.mjs$/,
];

function fail(code, detail = '') {
  const error = new Error(detail ? `${code}:${detail}` : code);
  error.code = code;
  throw error;
}

function assert(condition, code, detail = '') {
  if (!condition) fail(code, detail);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
  if (result.error) fail('POSTLANDING_COMMAND_EXECUTION_FAILED', `${command}:${result.error.message}`);
  if (result.status !== 0) {
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    fail('POSTLANDING_COMMAND_FAILED', `${command}:${result.status}`);
  }
  return result.stdout || '';
}

function listCurrentSoldFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isFile() && /^current-sold-.*\.mjs$/.test(entry.name))
    .map(entry => path.join(directory, entry.name))
    .sort();
}

async function postStatus(state, description) {
  if (!token || !repository || !shaPattern.test(mergeSha || '')) return;
  const targetUrl = `${process.env.GITHUB_SERVER_URL || 'https://github.com'}/${repository}/actions/runs/${process.env.GITHUB_RUN_ID || ''}`;
  const response = await fetch(`https://api.github.com/repos/${repository}/statuses/${mergeSha}`, {
    method: 'POST',
    redirect: 'error',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'kidults-current-sold-postlanding-v1',
    },
    body: JSON.stringify({
      state,
      context: statusContext,
      description: String(description).slice(0, 140),
      target_url: targetUrl,
    }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    fail('POSTLANDING_STATUS_PUBLISH_FAILED', `${response.status}:${payload?.message || 'request_failed'}`);
  }
}

function writeReceipt(receipt, overwrite = false) {
  fs.mkdirSync(path.dirname(receiptPath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
    flag: overwrite ? 'w' : 'wx',
  });
  fs.chmodSync(receiptPath, 0o600);
}

function baseReceipt(state) {
  return {
    id: 'kidults-current-sold-postlanding-receipt-v1',
    version: '1.0.0',
    state,
    repository,
    pull_request: Number(prNumber),
    exact_merge_sha: mergeSha,
    premerge_main_sha: premergeMainSha,
    merged_pr_head_sha: mergedPrHeadSha,
    landing_workflow_run_id: landingRunId,
    landing_workflow_run_attempt: landingRunAttempt,
    landing_authorization_id: authorizationId,
    trigger_class: 'ATOMIC_GOVERNED_LANDING_SAME_TRUSTED_JOB',
    github_token_push_suppression_compensated: true,
    expected_tests: 53,
    lawful_empirical_current_sold_count: 0,
    private_candidate_current_sold_count: 0,
    postgres_migration_applied: false,
    postgres_rows_written: 0,
    provider_calls: 0,
    deployment: false,
    public: 'HOLD',
    production: 'HOLD',
    g5: 'HOLD',
  };
}

let statusTouched = false;
try {
  assert(token, 'POSTLANDING_GITHUB_TOKEN_REQUIRED');
  assert(/^[^/]+\/[^/]+$/.test(repository || ''), 'POSTLANDING_REPOSITORY_INVALID');
  assert(shaPattern.test(mergeSha || ''), 'POSTLANDING_MERGE_SHA_INVALID');
  assert(shaPattern.test(premergeMainSha || ''), 'POSTLANDING_PREMERGE_SHA_INVALID');
  assert(shaPattern.test(mergedPrHeadSha || ''), 'POSTLANDING_PR_HEAD_SHA_INVALID');
  assert(/^\d+$/.test(prNumber || ''), 'POSTLANDING_PR_NUMBER_INVALID');
  assert(/^\d+$/.test(landingRunId || ''), 'POSTLANDING_RUN_ID_INVALID');
  assert(/^\d+$/.test(landingRunAttempt || ''), 'POSTLANDING_RUN_ATTEMPT_INVALID');
  assert(
    authorizationId === `LAND-PR-${prNumber}-${mergedPrHeadSha.slice(0, 12)}`,
    'POSTLANDING_AUTHORIZATION_BINDING_INVALID',
  );

  await postStatus('pending', 'Exact protected-main Current-SOLD validation in progress');
  statusTouched = true;

  const checkedOutSha = run('git', ['rev-parse', 'HEAD']).trim();
  assert(checkedOutSha === mergeSha, 'POSTLANDING_CHECKOUT_SHA_MISMATCH');

  const parentLine = run('git', ['rev-list', '--parents', '-n', '1', mergeSha]).trim().split(/\s+/);
  assert(parentLine.length === 3, 'POSTLANDING_TWO_PARENT_MERGE_REQUIRED', String(parentLine.length - 1));
  assert(parentLine[0] === mergeSha, 'POSTLANDING_MERGE_IDENTITY_DRIFT');
  assert(parentLine[1] === premergeMainSha, 'POSTLANDING_FIRST_PARENT_MISMATCH');
  assert(parentLine[2] === mergedPrHeadSha, 'POSTLANDING_SECOND_PARENT_MISMATCH');

  const subject = run('git', ['log', '-1', '--format=%s', mergeSha]).trim();
  assert(
    new RegExp(`^Merge pull request #${prNumber} from `).test(subject),
    'POSTLANDING_PR_MERGE_SUBJECT_MISMATCH',
    subject,
  );

  const changedFiles = run('git', ['diff', '--name-only', premergeMainSha, mergeSha])
    .split(/\r?\n/)
    .map(value => value.trim())
    .filter(Boolean);
  const currentSoldChangedFiles = changedFiles.filter(file => currentSoldPathMatchers.some(pattern => pattern.test(file)));
  assert(currentSoldChangedFiles.length > 0, 'POSTLANDING_CURRENT_SOLD_SURFACE_NOT_TOUCHED');

  const schemaFiles = [
    'coordination/kidults/market/current-sold-event-schema-v1.json',
    'coordination/kidults/market/current-sold-evidence-schema-v1.json',
    'coordination/kidults/market/current-sold-receipt-registry-schema-v1.json',
    'coordination/kidults/market/current-sold-batch-envelope-schema-v1.json',
    'coordination/kidults/market/current-sold-batch-receipt-schema-v1.json',
    'coordination/kidults/market/current-sold-private-dry-run-receipt-schema-v1.json',
    'coordination/kidults/market/current-sold-ledger-write-receipt-schema-v1.json',
    'coordination/kidults/market/current-sold-engine-v1.json',
  ];
  for (const file of schemaFiles) JSON.parse(fs.readFileSync(file, 'utf8'));

  const moduleFiles = [
    ...listCurrentSoldFiles('scripts/kidults/market'),
    ...listCurrentSoldFiles('tests/kidults/market'),
  ];
  for (const file of moduleFiles) run(process.execPath, ['--check', file]);

  const testFiles = fs.readdirSync('tests/kidults/market', { withFileTypes: true })
    .filter(entry => entry.isFile() && /^current-sold-.*\.test\.mjs$/.test(entry.name))
    .map(entry => path.join('tests/kidults/market', entry.name))
    .sort();
  const testOutput = run(process.execPath, ['--test', '--test-reporter=tap', ...testFiles]);
  process.stdout.write(testOutput);
  assert(/^# tests 53$/m.test(testOutput), 'POSTLANDING_TEST_COUNT_MISMATCH');
  assert(/^# pass 53$/m.test(testOutput), 'POSTLANDING_TEST_PASS_COUNT_MISMATCH');
  assert(/^# fail 0$/m.test(testOutput), 'POSTLANDING_TEST_FAILURE_COUNT_MISMATCH');

  const legacyBatchPath = 'scripts/kidults/market/current-sold-batch-v1.mjs';
  const legacyBatch = fs.readFileSync(legacyBatchPath, 'utf8');
  assert(legacyBatch.includes('CURRENT_SOLD_BATCH_RAW_BUNDLE_PERSISTENCE_DISABLED'), 'POSTLANDING_RAW_PERSISTENCE_GUARD_MISSING');
  assert(legacyBatch.includes('CURRENT_SOLD_BATCH_LEGACY_CLI_DISABLED_USE_PRIVATE_DRY_RUN'), 'POSTLANDING_LEGACY_CLI_GUARD_MISSING');
  assert(!/fs\.writeFile\(outputPath|writeCurrentSoldBatchBundle\(outputPath/.test(legacyBatch), 'POSTLANDING_RAW_PERSISTENCE_PATH_PRESENT');

  const outputDirectory = path.dirname(receiptPath);
  fs.mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
  const smokePath = path.join(outputDirectory, 'control-smoke-receipt.json');
  if (fs.existsSync(smokePath)) fs.rmSync(smokePath);
  run(process.execPath, ['scripts/kidults/market/current-sold-control-smoke-v1.mjs', '--output', smokePath], {
    env: { ...process.env, CURRENT_SOLD_SOURCE_SHA: mergeSha },
  });
  const smokeText = fs.readFileSync(smokePath, 'utf8');
  const smoke = JSON.parse(smokeText);
  assert(smoke.status === 'PASS', 'POSTLANDING_CONTROL_SMOKE_NOT_PASS');
  assert(smoke.execution_class === 'CONTROL_SYNTHETIC', 'POSTLANDING_CONTROL_SMOKE_CLASS_INVALID');
  assert(smoke.counts?.control_synthetic_admitted === 1, 'POSTLANDING_SYNTHETIC_COUNT_INVALID');
  assert(smoke.counts?.private_candidate_admitted === 0, 'POSTLANDING_PRIVATE_CANDIDATE_COUNT_INVALID');
  assert(smoke.counts?.lawful_empirical_admitted === 0, 'POSTLANDING_EMPIRICAL_COUNT_INVALID');
  assert(smoke.atomicity?.whole_batch_atomic === true, 'POSTLANDING_ATOMICITY_MISSING');
  assert(smoke.atomicity?.non_pass_admission_withheld === true, 'POSTLANDING_WITHHOLDING_MISSING');
  assert(smoke.ledger?.write_performed === false, 'POSTLANDING_LEDGER_WRITE_OCCURRED');
  assert(smoke.ledger?.migration_applied === false, 'POSTLANDING_LEDGER_MIGRATION_OCCURRED');
  assert(smoke.ledger?.rows_written === 0, 'POSTLANDING_LEDGER_ROWS_WRITTEN');
  assert(smoke.claim_boundary?.public === 'HOLD', 'POSTLANDING_PUBLIC_BOUNDARY_BROKEN');
  assert(smoke.claim_boundary?.production === 'HOLD', 'POSTLANDING_PRODUCTION_BOUNDARY_BROKEN');
  assert(smoke.claim_boundary?.g5 === 'HOLD', 'POSTLANDING_G5_BOUNDARY_BROKEN');
  assert((fs.statSync(smokePath).mode & 0o777) === 0o600, 'POSTLANDING_SMOKE_MODE_INVALID');
  assert(!/example\.invalid|control:synthetic|realized_consideration|source_url/.test(smokeText), 'POSTLANDING_SMOKE_RAW_DATA_LEAK');

  const sql = fs.readFileSync('infrastructure/postgres/current-sold/0001_current_sold_append_only_ledger_v1.sql', 'utf8');
  assert(sql.includes('BEFORE UPDATE OR DELETE ON kidults_private.current_sold_event_ledger'), 'POSTLANDING_APPEND_ONLY_UPDATE_DELETE_GUARD_MISSING');
  assert(sql.includes('BEFORE TRUNCATE ON kidults_private.current_sold_event_ledger'), 'POSTLANDING_APPEND_ONLY_TRUNCATE_GUARD_MISSING');
  assert(sql.includes('REVOKE UPDATE, DELETE, TRUNCATE'), 'POSTLANDING_APPEND_ONLY_REVOKE_MISSING');
  assert(!/ON CONFLICT.*DO UPDATE|UPDATE\s+kidults_private\.current_sold_|DELETE\s+FROM\s+kidults_private\.current_sold_/is.test(sql), 'POSTLANDING_APPEND_ONLY_NEGATIVE_SCAN_FAILED');

  const receipt = {
    ...baseReceipt('VERIFIED_PASS'),
    schema_json_files_parsed: schemaFiles.length,
    syntax_checked_modules: moduleFiles.length,
    tests_passed: 53,
    tests_failed: 0,
    current_sold_changed_file_count: currentSoldChangedFiles.length,
    merge_parent_binding_verified: true,
    control_smoke: 'PASS',
    raw_persistence_guard: 'PASS',
    postgres_append_only_static_guard: 'PASS',
  };
  writeReceipt(receipt);
  await postStatus('success', '53/53 exact-main Current-SOLD post-landing validation passed');
  console.log(JSON.stringify(receipt, null, 2));
} catch (error) {
  const errorCode = String(error?.code || error?.message || 'POSTLANDING_VALIDATION_FAILED').slice(0, 120);
  try {
    if (statusTouched) await postStatus('failure', errorCode);
  } catch (statusError) {
    console.error(statusError);
  }
  try {
    writeReceipt({ ...baseReceipt('VERIFIED_FAIL'), error_code: errorCode }, fs.existsSync(receiptPath));
  } catch {}
  throw error;
}
