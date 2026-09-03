#!/usr/bin/env node
import fs from 'node:fs';

const workflowPath = '.github/workflows/kidults-asi-hourly-v2-promotion-readiness-v1.yml';

function fail(message) {
  console.error(`FAIL hourly-v2 promotion provenance: ${message}`);
  process.exit(1);
}

function assertions(text) {
  const errors = [];
  const require = (condition, message) => { if (!condition) errors.push(message); };
  const workflowRunBlock = text.match(/workflow_run:\s*\n([\s\S]*?)\n\npermissions:/)?.[1] ?? '';
  const validateRunBlock = text.match(/validate_run\(\) \{([\s\S]*?)\n          \}/)?.[1] ?? '';
  const exactArtifactBlock = text.match(/exact_artifact\(\) \{([\s\S]*?)\n          \}/)?.[1] ?? '';

  require(/workflows:\s*\['KIDULTS ASI Global Any-Site Hourly Pooling v2'\]/.test(workflowRunBlock), 'canonical v2 producer workflow trigger missing');
  require(/branches:\s*\[main\]/.test(workflowRunBlock), 'workflow_run must be restricted to main');
  require(/types:\s*\[completed\]/.test(workflowRunBlock), 'workflow_run completion trigger missing');
  require(!text.includes('/actions/artifacts?per_page=100'), 'repository-global artifact lookup is forbidden');
  require(text.includes('/actions/runs/${run_id}/artifacts?per_page=100'), 'run-scoped artifact lookup missing');
  require(text.includes('/actions/workflows/kidults-asi-global-any-site-hourly-pooling-v2.yml/runs'), 'canonical producer workflow-run enumeration missing');
  require(validateRunBlock.includes('.path==$path'), 'canonical producer workflow path binding missing');
  require(validateRunBlock.includes('.repository.full_name==$repo'), 'producer repository binding missing');
  require(validateRunBlock.includes('.head_branch=="main"'), 'producer main-branch binding missing');
  require(validateRunBlock.includes('.head_sha==$sha'), 'producer exact-SHA binding missing');
  require(validateRunBlock.includes('.conclusion=="success"'), 'producer success binding missing');
  require(text.includes('test "$MAIN_SHA" = "$EXPECTED_SHA"'), 'current protected-main equality proof missing');
  require(exactArtifactBlock.includes('[ "$count" -eq 1 ]'), 'exact artifact cardinality check missing');
  require(exactArtifactBlock.includes('^sha256:[0-9a-f]{64}$'), 'provider artifact digest validation missing');
  require(text.includes('WAITING_FOR_SECOND_DISTINCT_EXACT_SHA_V2_CYCLE'), 'exact-generation waiting state missing');
  require(text.includes('test "$SECOND_RUN_ID" != "$UPSTREAM_RUN_ID"'), 'distinct-run proof missing');
  require(text.includes('"triggering_run_included": true'), 'triggering-run inclusion receipt missing');
  require(text.includes('"same_generation": true'), 'same-generation receipt missing');
  require(text.includes('v1_baseline:null'), 'repository-global v1 baseline must not influence exact-v2 readiness');
  require(text.includes("public_release:'HOLD'") || text.includes('"public_release": "HOLD"'), 'Public HOLD boundary missing');
  require(text.includes("production:'HOLD'") || text.includes('"production": "HOLD"'), 'Production HOLD boundary missing');

  const safeValidation = text.indexOf('python3 scripts/kidults/kpmo/validate-safe-zip-archive-v1.py');
  const extraction = text.indexOf('unzip -q -o "/tmp/v2-${i}.zip"');
  require(safeValidation >= 0 && extraction >= 0 && safeValidation < extraction, 'safe ZIP validation must precede extraction');
  require(text.includes('--required-basename asi-global-any-site-hourly-cycle-receipt-v2.json'), 'exact receipt basename archive guard missing');
  require(text.includes('"safe_zip_validated_before_extraction": true'), 'safe ZIP provenance state missing');
  require(text.includes('safe_zip_receipt_digest'), 'safe ZIP receipt digest binding missing');
  return errors;
}

const source = fs.readFileSync(workflowPath, 'utf8');
const sourceErrors = assertions(source);
if (sourceErrors.length) fail(sourceErrors.join('; '));

const mutations = [
  ['remove-main-filter', source.replace('    branches: [main]\n', '')],
  ['repo-global-artifact-lookup', source.replace('/actions/runs/${run_id}/artifacts?per_page=100', '/actions/artifacts?per_page=100')],
  ['remove-workflow-path-binding', source.replace('and .path==$path', 'and true')],
  ['remove-repository-binding', source.replace('and .repository.full_name==$repo', 'and true')],
  ['remove-exact-sha-binding', source.replace('and .head_sha==$sha', 'and true')],
  ['remove-main-sha-proof', source.replace('          test "$MAIN_SHA" = "$EXPECTED_SHA"\n', '')],
  ['remove-cardinality', source.replace('[ "$count" -eq 1 ]', 'true')],
  ['remove-digest-validation', source.replace('[[ "$digest" =~ ^sha256:[0-9a-f]{64}$ ]]', 'true')],
  ['remove-wait-state', source.replace('WAITING_FOR_SECOND_DISTINCT_EXACT_SHA_V2_CYCLE', 'WAITING')],
  ['allow-duplicate-run', source.replace('          test "$SECOND_RUN_ID" != "$UPSTREAM_RUN_ID"\n', '')],
  ['remove-trigger-inclusion', source.replace('"triggering_run_included": true', '"triggering_run_included": false')],
  ['remove-same-generation', source.replace('"same_generation": true', '"same_generation": false')],
  ['reintroduce-v1-global-baseline', source.replace('v1_baseline:null', "v1_baseline:{artifact_id:'LATEST'}")],
  ['remove-safe-zip-order', source.replace('python3 scripts/kidults/kpmo/validate-safe-zip-archive-v1.py', 'python3 -c true # removed safe zip validator')],
  ['remove-safe-basename', source.replace('--required-basename asi-global-any-site-hourly-cycle-receipt-v2.json', '--max-entries 2048')],
  ['remove-safe-provenance', source.replace('"safe_zip_validated_before_extraction": true', '"safe_zip_validated_before_extraction": false')],
];

for (const [name, mutated] of mutations) {
  if (mutated === source) fail(`trusted self-test mutation did not apply: ${name}`);
  if (assertions(mutated).length === 0) fail(`trusted self-test failed to reject mutation: ${name}`);
}

console.log(JSON.stringify({
  status: 'PASS',
  id: 'kidults-asi-hourly-v2-promotion-provenance-validator-v1',
  protected_properties: [
    'main-only workflow_run',
    'canonical producer identity',
    'exact protected-main SHA',
    'run-scoped exact-cardinality artifact',
    'provider artifact digest',
    'safe ZIP validation before extraction',
    'exact receipt basename cardinality',
    'safe ZIP receipt digest provenance',
    'triggering-run inclusion',
    'two distinct same-generation cycles',
    'no repository-global v1 baseline',
    'Public/Production HOLD'
  ],
  mutation_cases: mutations.length
}, null, 2));
