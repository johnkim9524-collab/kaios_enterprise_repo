#!/usr/bin/env node
import fs from 'node:fs';

const workflowPath = '.github/workflows/kidults-full-value-chain-redteam-orchestrator-v1.yml';
const stateScript = 'scripts/kidults/kpmo/validate-material-defect-state-parity-v1.mjs';
const terminalScript = 'scripts/kidults/kpmo/reconcile-full-value-chain-redteam-terminal-v1.mjs';

function stepSlice(source, name, nextName) {
  const startMarker = `      - name: ${name}`;
  const start = source.indexOf(startMarker);
  if (start < 0) return '';
  const nextMarker = nextName ? `      - name: ${nextName}` : '\n      - name:';
  const end = source.indexOf(nextMarker, start + startMarker.length);
  return end < 0 ? source.slice(start) : source.slice(start, end);
}

export function stateBindingErrors(source) {
  const text = String(source || '');
  const severityName = 'Validate live material-defect severity parity';
  const stateName = 'Validate live material-defect GitHub/body state parity';
  const aggregateName = 'Run aggregate full value-chain Red-Team suite';
  const reconcileName = 'Reconcile durable full-chain terminal receipt';
  const uploadName = 'Upload durable full-chain terminal receipt';
  const severityIndex = text.indexOf(`      - name: ${severityName}`);
  const stateIndex = text.indexOf(`      - name: ${stateName}`);
  const aggregateIndex = text.indexOf(`      - name: ${aggregateName}`);
  const reconcileIndex = text.indexOf(`      - name: ${reconcileName}`);
  const uploadIndex = text.indexOf(`      - name: ${uploadName}`);
  const state = stepSlice(text, stateName, aggregateName);
  const reconcile = stepSlice(text, reconcileName, uploadName);
  const errors = [];
  if (!/permissions:\s*\n\s+contents:\s*read\s*\n\s+issues:\s*read\b/.test(text)) errors.push('FULL_CHAIN_STATE_PARITY_ISSUES_READ_MISSING');
  if (!state.includes('id: state_parity')) errors.push('FULL_CHAIN_STATE_PARITY_STEP_ID_MISSING');
  if (!state.includes('GITHUB_TOKEN: ${{ github.token }}')) errors.push('FULL_CHAIN_STATE_PARITY_TOKEN_MISSING');
  if (!state.includes(`${stateScript} --self-test`) || !state.includes(`node ${stateScript}`)) errors.push('FULL_CHAIN_STATE_PARITY_VALIDATOR_MISSING');
  if (!state.includes('set -euo pipefail')) errors.push('FULL_CHAIN_STATE_PARITY_FAIL_CLOSED_SHELL_MISSING');
  if (!reconcile.includes('STATE_PARITY_OUTCOME: ${{ steps.state_parity.outcome }}')) errors.push('FULL_CHAIN_STATE_PARITY_TERMINAL_BINDING_MISSING');
  if (!reconcile.includes('if: always()') || !reconcile.includes(`${terminalScript} --finalize`)) errors.push('FULL_CHAIN_STATE_PARITY_TERMINAL_RECONCILE_MISSING');
  if (severityIndex < 0 || stateIndex < 0 || aggregateIndex < 0 || reconcileIndex < 0 || uploadIndex < 0
      || severityIndex > stateIndex || stateIndex > aggregateIndex || reconcileIndex < aggregateIndex || uploadIndex < reconcileIndex) {
    errors.push('FULL_CHAIN_STATE_PARITY_ORDER_INVALID');
  }
  return errors;
}

function requireMutationRejected(original, mutated, expected) {
  if (mutated === original) throw new Error(`MUTATION_NOT_APPLIED:${expected}`);
  const errors = stateBindingErrors(mutated);
  if (!errors.includes(expected)) throw new Error(`MUTATION_ESCAPED:${expected}:${errors.join(',')}`);
}

const source = fs.readFileSync(workflowPath, 'utf8');
const errors = stateBindingErrors(source);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
const stateName = 'Validate live material-defect GitHub/body state parity';
const aggregateName = 'Run aggregate full value-chain Red-Team suite';
const stateBlock = stepSlice(source, stateName, aggregateName);
requireMutationRejected(source, source.replace(stateBlock, ''), 'FULL_CHAIN_STATE_PARITY_STEP_ID_MISSING');
requireMutationRejected(source, source.replace(stateBlock, stateBlock.replace('GITHUB_TOKEN: ${{ github.token }}', 'GITHUB_TOKEN_REMOVED: true')), 'FULL_CHAIN_STATE_PARITY_TOKEN_MISSING');
requireMutationRejected(source, source.replace(stateBlock, stateBlock.replace(`${stateScript} --self-test`, 'echo self-test-removed')), 'FULL_CHAIN_STATE_PARITY_VALIDATOR_MISSING');
requireMutationRejected(source, source.replace('STATE_PARITY_OUTCOME: ${{ steps.state_parity.outcome }}', 'STATE_PARITY_OUTCOME: removed'), 'FULL_CHAIN_STATE_PARITY_TERMINAL_BINDING_MISSING');
console.log(JSON.stringify({
  suite: 'KIDULTS_FULL_VALUE_CHAIN_STATE_PARITY_BINDING_V1',
  result: 'PASS',
  shared_material_registry_parser_required: true,
  severity_and_state_parity_required_before_aggregate: true,
  terminal_receipt_binds_state_parity: true,
  negative_mutations_rejected: 4,
  empirical_gate_effect: 'NONE',
  production: 'HOLD',
  public: 'HOLD',
  g5: 'HOLD'
}));
