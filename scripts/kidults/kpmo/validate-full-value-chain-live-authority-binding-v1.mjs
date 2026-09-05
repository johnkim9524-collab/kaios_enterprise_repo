#!/usr/bin/env node
import fs from 'node:fs';

const workflowPath = '.github/workflows/kidults-full-value-chain-redteam-orchestrator-v1.yml';
const canonicalScript = 'scripts/kidults/kpmo/validate-canonical-latest-block-scope-v1.mjs';
const severityScript = 'scripts/kidults/kpmo/validate-material-defect-severity-parity-v2.mjs';
const guardScript = 'scripts/kidults/kpmo/validate-full-value-chain-live-authority-binding-v1.mjs';
const reconcileScript = 'scripts/kidults/kpmo/reconcile-full-value-chain-redteam-terminal-v1.mjs';
const receiptName = 'kidults-full-value-chain-redteam-terminal-v1';

function fail(code) { throw new Error(code); }
function assert(condition, code) { if (!condition) fail(code); }

function stepSlice(source, name, nextName = null) {
  const marker = `      - name: ${name}`;
  const start = source.indexOf(marker);
  if (start < 0) return '';
  const end = nextName
    ? source.indexOf(`      - name: ${nextName}`, start + marker.length)
    : source.indexOf('\n      - name:', start + marker.length);
  return end < 0 ? source.slice(start) : source.slice(start, end);
}

export function bindingErrors(source) {
  const text = String(source || '');
  const errors = [];
  if (!/permissions:\s*\n\s+contents:\s*read\s*\n\s+issues:\s*read\b/.test(text)) errors.push('FULL_CHAIN_READONLY_ISSUE_PERMISSION_MISSING');
  if (/permissions:[\s\S]{0,160}\b(?:issues|contents|actions|pull-requests|checks|statuses):\s*write\b/.test(text)) errors.push('FULL_CHAIN_WRITE_PERMISSION_FORBIDDEN');

  const names = [
    'Validate full value-chain live-authority binding regression',
    'Validate live canonical current-main authority',
    'Validate live material-defect severity parity',
    'Run aggregate full value-chain Red-Team suite',
    'Reconcile exact-run terminal receipt',
    'Upload exact-run terminal receipt',
    'Enforce terminal Red-Team verdict',
  ];
  const indexes = names.map((name) => text.indexOf(`      - name: ${name}`));
  if (indexes.some((value) => value < 0) || indexes.some((value, index) => index > 0 && value <= indexes[index - 1])) errors.push('FULL_CHAIN_AUTHORITY_TERMINAL_ORDER_INVALID');

  const guard = stepSlice(text, names[0], names[1]);
  const canonical = stepSlice(text, names[1], names[2]);
  const severity = stepSlice(text, names[2], names[3]);
  const aggregate = stepSlice(text, names[3], names[4]);
  const reconcile = stepSlice(text, names[4], names[5]);
  const upload = stepSlice(text, names[5], names[6]);
  const enforce = stepSlice(text, names[6]);

  if (!guard.includes(`node ${guardScript}`)) errors.push('FULL_CHAIN_BINDING_GUARD_INVOCATION_MISSING');
  if (!guard.includes(`node ${reconcileScript} --self-test`)) errors.push('FULL_CHAIN_TERMINAL_RECONCILER_SELFTEST_MISSING');
  if (!canonical.includes(`node ${canonicalScript} --self-test`) || !canonical.includes(`node ${canonicalScript}`)) errors.push('FULL_CHAIN_CANONICAL_LIVE_VALIDATOR_MISSING');
  if (!severity.includes(`node ${severityScript} --self-test`) || !severity.includes(`node ${severityScript}`)) errors.push('FULL_CHAIN_SEVERITY_LIVE_VALIDATOR_MISSING');
  if (!canonical.includes('GITHUB_TOKEN: ${{ github.token }}') || !severity.includes('GITHUB_TOKEN: ${{ github.token }}')) errors.push('FULL_CHAIN_LIVE_AUTHORITY_TOKEN_BINDING_MISSING');
  if (!guard.includes('continue-on-error: true') || !canonical.includes('continue-on-error: true') || !severity.includes('continue-on-error: true') || !aggregate.includes('continue-on-error: true')) errors.push('FULL_CHAIN_COMPLETE_EVIDENCE_COLLECTION_MISSING');
  if (!aggregate.includes('run-full-value-chain-redteam-suite-v1.mjs')) errors.push('FULL_CHAIN_AGGREGATE_SUITE_MISSING');
  if (!reconcile.includes('if: always()') || !reconcile.includes(`node ${reconcileScript}`) || !reconcile.includes('steps.binding_guard.outcome') || !reconcile.includes('steps.canonical_live.outcome') || !reconcile.includes('steps.severity_live.outcome') || !reconcile.includes('steps.aggregate.outcome')) errors.push('FULL_CHAIN_TERMINAL_RECONCILIATION_MISSING');
  if (!upload.includes('if: always()') || !upload.includes('actions/upload-artifact@') || !upload.includes(receiptName) || !upload.includes('if-no-files-found: error')) errors.push('FULL_CHAIN_TERMINAL_UPLOAD_MISSING');
  if (!enforce.includes('if: always()') || !enforce.includes('FULL_CHAIN_TERMINAL_NOT_PASS')) errors.push('FULL_CHAIN_FINAL_FAILCLOSED_ENFORCEMENT_MISSING');
  return errors;
}

function mutationMustFail(source, mutated, expected) {
  assert(mutated !== source, `MUTATION_NOT_APPLIED:${expected}`);
  const errors = bindingErrors(mutated);
  assert(errors.includes(expected), `MUTATION_ESCAPED:${expected}:${errors.join(',')}`);
}

const source = fs.readFileSync(workflowPath, 'utf8');
const errors = bindingErrors(source);
if (errors.length) {
  console.error(JSON.stringify({ state: 'VERIFIED_FAIL', errors, production: 'HOLD', public: 'HOLD', g5: 'HOLD' }, null, 2));
  process.exit(1);
}

mutationMustFail(source, source.replace('  issues: read', '  issues: write'), 'FULL_CHAIN_READONLY_ISSUE_PERMISSION_MISSING');
mutationMustFail(source, source.replace(`node ${canonicalScript} --self-test`, 'echo canonical-validator-removed'), 'FULL_CHAIN_CANONICAL_LIVE_VALIDATOR_MISSING');
mutationMustFail(source, source.replace(`node ${severityScript} --self-test`, 'echo severity-validator-removed'), 'FULL_CHAIN_SEVERITY_LIVE_VALIDATOR_MISSING');
mutationMustFail(source, source.replace('        continue-on-error: true', '        continue-on-error: false'), 'FULL_CHAIN_COMPLETE_EVIDENCE_COLLECTION_MISSING');
mutationMustFail(source, source.replace('      - name: Reconcile exact-run terminal receipt', '      - name: REMOVED reconcile exact-run terminal receipt'), 'FULL_CHAIN_AUTHORITY_TERMINAL_ORDER_INVALID');
mutationMustFail(source, source.replace('      - name: Upload exact-run terminal receipt', '      - name: REMOVED upload exact-run terminal receipt'), 'FULL_CHAIN_AUTHORITY_TERMINAL_ORDER_INVALID');
mutationMustFail(source, source.replace('      - name: Enforce terminal Red-Team verdict', '      - name: REMOVED enforce terminal Red-Team verdict'), 'FULL_CHAIN_AUTHORITY_TERMINAL_ORDER_INVALID');

console.log(JSON.stringify({
  id: 'kidults-full-value-chain-live-authority-binding-v1',
  state: 'VERIFIED_PASS',
  live_canonical_required: true,
  live_severity_required: true,
  complete_evidence_collection: true,
  terminal_receipt_always_required: true,
  issues_permission: 'READ_ONLY',
  mutation_cases_rejected: 7,
  empirical_evidence_readiness: 'NOT_PROMOTED_BY_THIS_SUITE',
  release_evidence_readiness: 'NOT_PROMOTED_BY_THIS_SUITE',
  production: 'HOLD', public: 'HOLD', g5: 'HOLD'
}, null, 2));
