#!/usr/bin/env node
import fs from 'node:fs';

const workflowPath = '.github/workflows/kidults-full-value-chain-redteam-orchestrator-v1.yml';
const canonicalScript = 'scripts/kidults/kpmo/validate-canonical-latest-block-scope-v1.mjs';
const severityScript = 'scripts/kidults/kpmo/validate-material-defect-severity-parity-v2.mjs';
const guardScript = 'scripts/kidults/kpmo/validate-full-value-chain-live-authority-binding-v1.mjs';
const terminalScript = 'scripts/kidults/kpmo/reconcile-full-value-chain-redteam-terminal-v1.mjs';
const canonicalIssues = [235,236,237,238,240,256,344,457,479,480,489,521,550,558,559,560,609,742,769,881,921,951,1066,1166,1296];
const blockPattern = /<!-- KPMO_CANONICAL_TRUTH_V2_START -->([\s\S]*?)<!-- KPMO_CANONICAL_TRUTH_V2_END -->/g;

function stepSlice(source, name, nextName) {
  const startMarker = `      - name: ${name}`;
  const start = source.indexOf(startMarker);
  if (start < 0) return '';
  const nextMarker = nextName ? `      - name: ${nextName}` : '\n      - name:';
  const end = source.indexOf(nextMarker, start + startMarker.length);
  return end < 0 ? source.slice(start) : source.slice(start, end);
}

export function bindingErrors(source) {
  const errors = [];
  const text = String(source || '');
  if (!/permissions:\s*\n\s+contents:\s*read\s*\n\s+issues:\s*read\b/.test(text)) {
    errors.push('FULL_CHAIN_ISSUES_READ_PERMISSION_MISSING');
  }

  const guardName = 'Validate full value-chain live-authority binding regression';
  const canonicalName = 'Validate live canonical current-main HOLD authority';
  const severityName = 'Validate live material-defect severity parity';
  const aggregateName = 'Run aggregate full value-chain Red-Team suite';
  const initializeName = 'Initialize durable full-chain terminal receipt';
  const reconcileName = 'Reconcile durable full-chain terminal receipt';
  const uploadName = 'Upload durable full-chain terminal receipt';

  const initialize = stepSlice(text, initializeName, guardName);
  const guard = stepSlice(text, guardName, canonicalName);
  const canonical = stepSlice(text, canonicalName, severityName);
  const severity = stepSlice(text, severityName, aggregateName);
  const aggregateIndex = text.indexOf(`      - name: ${aggregateName}`);
  const initializeIndex = text.indexOf(`      - name: ${initializeName}`);
  const reconcileIndex = text.indexOf(`      - name: ${reconcileName}`);
  const uploadIndex = text.indexOf(`      - name: ${uploadName}`);
  const reconcile = stepSlice(text, reconcileName, uploadName);
  const upload = stepSlice(text, uploadName, null);
  const guardIndex = text.indexOf(`      - name: ${guardName}`);
  const canonicalIndex = text.indexOf(`      - name: ${canonicalName}`);
  const severityIndex = text.indexOf(`      - name: ${severityName}`);

  if (!initialize.includes(`${terminalScript} --initialize`)) errors.push('FULL_CHAIN_TERMINAL_INITIALIZER_MISSING');
  if (!guard.includes(guardScript)) errors.push('FULL_CHAIN_BINDING_GUARD_INVOCATION_MISSING');
  if (!guard.includes('GITHUB_TOKEN: ${{ github.token }}')) errors.push('FULL_CHAIN_GUARD_TOKEN_BINDING_MISSING');
  if (!canonical.includes(`${canonicalScript} --self-test`) || !canonical.includes(`node ${canonicalScript}`)) {
    errors.push('FULL_CHAIN_CANONICAL_LIVE_VALIDATOR_MISSING');
  }
  if (!severity.includes(`${severityScript} --self-test`) || !severity.includes(`node ${severityScript}`)) {
    errors.push('FULL_CHAIN_SEVERITY_LIVE_VALIDATOR_MISSING');
  }
  for (const [label, block] of [['canonical', canonical], ['severity', severity]]) {
    if (!block.includes('GITHUB_TOKEN: ${{ github.token }}')) errors.push(`FULL_CHAIN_${label.toUpperCase()}_TOKEN_BINDING_MISSING`);
    if (!block.includes('set -euo pipefail')) errors.push(`FULL_CHAIN_${label.toUpperCase()}_FAIL_CLOSED_SHELL_MISSING`);
  }
  if (!reconcile.includes('if: always()') || !reconcile.includes(`${terminalScript} --finalize`)) {
    errors.push('FULL_CHAIN_TERMINAL_RECONCILIATION_ALWAYS_MISSING');
  }
  if (!reconcile.includes('steps.live_authority_binding.outcome')
    || !reconcile.includes('steps.canonical_authority.outcome')
    || !reconcile.includes('steps.severity_parity.outcome')
    || !reconcile.includes('steps.aggregate_suite.outcome')) {
    errors.push('FULL_CHAIN_TERMINAL_STAGE_OUTCOME_BINDING_MISSING');
  }
  if (!upload.includes('if: always()')
    || !upload.includes('actions/upload-artifact@b7c566a772e6b6bfb58ed0dc250532a479d7789f')
    || !upload.includes('kidults-full-chain-terminal-${{ github.run_id }}-${{ github.run_attempt }}')
    || !upload.includes('if-no-files-found: error')) {
    errors.push('FULL_CHAIN_TERMINAL_UPLOAD_ALWAYS_MISSING');
  }
  if (initializeIndex < 0 || guardIndex < 0 || canonicalIndex < 0 || severityIndex < 0 || aggregateIndex < 0
    || reconcileIndex < 0 || uploadIndex < 0 || initializeIndex > guardIndex || guardIndex > aggregateIndex
    || canonicalIndex > aggregateIndex || severityIndex > aggregateIndex || reconcileIndex < aggregateIndex
    || uploadIndex < reconcileIndex) {
    errors.push('FULL_CHAIN_TERMINAL_AND_AUTHORITY_ORDER_INVALID');
  }
  return errors;
}

function requireMutationRejected(original, mutated, expected) {
  if (mutated === original) throw new Error(`MUTATION_NOT_APPLIED:${expected}`);
  const errors = bindingErrors(mutated);
  if (!errors.includes(expected)) throw new Error(`MUTATION_ESCAPED:${expected}:${errors.join(',')}`);
}

function latestBlock(body) {
  const blocks = [...String(body || '').matchAll(blockPattern)];
  return blocks.length ? blocks.at(-1)[1] : '';
}

function liveCanonicalErrors(issue, liveMainSha) {
  const block = latestBlock(issue?.body);
  const errors = [];
  if (!block) errors.push('LATEST_V2_BLOCK_MISSING');
  if (!block.includes(`protected main: \`${liveMainSha}\``)) errors.push('LATEST_V2_NOT_BOUND_TO_LIVE_PROTECTED_MAIN');
  if (!/Production\/Public\/G5:\s*(?:\*\*)?HOLD(?:\*\*)?/i.test(block)) errors.push('LATEST_V2_HOLD_MISSING');
  return errors;
}

async function githubGet(repository, token, path) {
  const response = await fetch(`https://api.github.com/repos/${repository}${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28'
    },
    signal: AbortSignal.timeout(20_000)
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`GITHUB_HTTP_${response.status}:${text.slice(0, 300)}`);
  return JSON.parse(text);
}

const source = fs.readFileSync(workflowPath, 'utf8');
const errors = bindingErrors(source);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

requireMutationRejected(source, source.replace('  issues: read', '  issues: none'), 'FULL_CHAIN_ISSUES_READ_PERMISSION_MISSING');
requireMutationRejected(source, source.replace(`node ${canonicalScript} --self-test`, 'echo canonical-self-test-removed'), 'FULL_CHAIN_CANONICAL_LIVE_VALIDATOR_MISSING');
requireMutationRejected(source, source.replace(`node ${severityScript} --self-test`, 'echo severity-self-test-removed'), 'FULL_CHAIN_SEVERITY_LIVE_VALIDATOR_MISSING');
requireMutationRejected(source, source.replace(`${terminalScript} --initialize`, 'terminal-initializer-removed'), 'FULL_CHAIN_TERMINAL_INITIALIZER_MISSING');
requireMutationRejected(source, source.replace(`${terminalScript} --finalize`, 'terminal-finalizer-removed'), 'FULL_CHAIN_TERMINAL_RECONCILIATION_ALWAYS_MISSING');
const terminalAlways = source.indexOf('      - name: Reconcile durable full-chain terminal receipt');
const terminalUpload = source.indexOf('      - name: Upload durable full-chain terminal receipt');
const reconcileBlock = source.slice(terminalAlways, terminalUpload);
requireMutationRejected(
  source,
  source.replace(reconcileBlock, reconcileBlock.replace('if: always()', 'if: success()')),
  'FULL_CHAIN_TERMINAL_RECONCILIATION_ALWAYS_MISSING'
);

const guardName = 'Validate full value-chain live-authority binding regression';
const canonicalName = 'Validate live canonical current-main HOLD authority';
const severityName = 'Validate live material-defect severity parity';
const guardBlock = stepSlice(source, guardName, canonicalName);
const canonicalBlock = stepSlice(source, canonicalName, severityName);
requireMutationRejected(
  source,
  source.replace(guardBlock, guardBlock.replace('GITHUB_TOKEN: ${{ github.token }}', 'GITHUB_TOKEN_REMOVED: true')),
  'FULL_CHAIN_GUARD_TOKEN_BINDING_MISSING'
);
requireMutationRejected(
  source,
  source.replace(canonicalBlock, canonicalBlock.replace('GITHUB_TOKEN: ${{ github.token }}', 'GITHUB_TOKEN_REMOVED: true')),
  'FULL_CHAIN_CANONICAL_TOKEN_BINDING_MISSING'
);

const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
if (!repository || !token) {
  console.error(JSON.stringify({
    suite: 'KIDULTS_FULL_VALUE_CHAIN_LIVE_AUTHORITY_BINDING_V1',
    result: 'VERIFIED_FAIL',
    failure_class: 'REPOSITORY_OR_TOKEN_MISSING',
    promotion_eligible: false,
    production: 'HOLD', public: 'HOLD', g5: 'HOLD'
  }, null, 2));
  process.exit(1);
}

try {
  const branch = await githubGet(repository, token, '/branches/main');
  const liveMainSha = branch?.commit?.sha;
  if (!/^[0-9a-f]{40}$/i.test(String(liveMainSha || ''))) throw new Error('LIVE_MAIN_SHA_INVALID');
  const issues = await Promise.all(canonicalIssues.map(number => githubGet(repository, token, `/issues/${number}`)));
  const failures = [];
  for (const issue of issues) {
    for (const error of liveCanonicalErrors(issue, liveMainSha)) failures.push(`#${issue.number}:${error}`);
  }
  if (failures.length) {
    console.error(JSON.stringify({
      suite: 'KIDULTS_FULL_VALUE_CHAIN_LIVE_AUTHORITY_BINDING_V1',
      result: 'VERIFIED_FAIL',
      failure_class: 'CANONICAL_LIVE_MAIN_HOLD_AUTHORITY',
      protected_main: liveMainSha,
      canonical_issue_count: canonicalIssues.length,
      canonical_issue_pass_count: canonicalIssues.length - new Set(failures.map(item => item.split(':')[0])).size,
      failures,
      promotion_eligible: false,
      empirical_gate_effect: 'NONE',
      production: 'HOLD', public: 'HOLD', g5: 'HOLD'
    }, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify({
    suite: 'KIDULTS_FULL_VALUE_CHAIN_LIVE_AUTHORITY_BINDING_V1',
    result: 'PASS',
    protected_main: liveMainSha,
    canonical_issue_count: canonicalIssues.length,
    canonical_current_main_hold: '25/25',
    canonical_latest_block_live_authority: 'MANDATORY_BEFORE_AGGREGATE',
    material_severity_parity_live_authority: 'MANDATORY_BEFORE_AGGREGATE',
    github_permission: 'CONTENTS_READ_PLUS_ISSUES_READ_ONLY',
    token_scope: 'LIVE_AUTHORITY_STEPS_ONLY',
    mutation_cases: 5,
    empirical_gate_effect: 'NONE',
    production: 'HOLD',
    public: 'HOLD',
    g5: 'HOLD'
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    suite: 'KIDULTS_FULL_VALUE_CHAIN_LIVE_AUTHORITY_BINDING_V1',
    result: 'VERIFIED_FAIL',
    failure_class: 'LIVE_AUTHORITY_API_OR_VALIDATION_FAILURE',
    message: error instanceof Error ? error.message : String(error),
    promotion_eligible: false,
    empirical_gate_effect: 'NONE',
    production: 'HOLD', public: 'HOLD', g5: 'HOLD'
  }, null, 2));
  process.exit(1);
}
