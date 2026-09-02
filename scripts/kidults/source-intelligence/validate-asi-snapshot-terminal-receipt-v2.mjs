#!/usr/bin/env node
import fs from 'node:fs';

const WORKFLOW = '.github/workflows/kidults-asi-snapshot-readiness-factory-v2.yml';

function requireCondition(value, code) {
  if (!value) throw new Error(code);
}

export function validateWorkflow(text) {
  const init = text.indexOf('- name: Initialize fail-closed P3 terminal receipt');
  const restore = text.indexOf('- name: Restore exact P2 run and its receipt-bound P0B and P1 artifacts');
  const reconcile = text.indexOf('- name: Reconcile P3 terminal receipt');
  const upload = text.indexOf('- name: Upload P3 terminal receipt');

  requireCondition(init >= 0, 'P3_TERMINAL_INIT_MISSING');
  requireCondition(restore > init, 'P3_TERMINAL_INIT_NOT_BEFORE_RESTORE');
  requireCondition(reconcile > restore, 'P3_TERMINAL_RECONCILE_MISSING_OR_MISORDERED');
  requireCondition(upload > reconcile, 'P3_TERMINAL_UPLOAD_MISSING_OR_MISORDERED');

  const restoreBlock = text.slice(restore, reconcile);
  requireCondition(/\n\s+id:\s*restore_p2\s*(?:\n|$)/.test(restoreBlock), 'P3_RESTORE_ID_MISSING');
  requireCondition(!/continue-on-error:\s*true/.test(restoreBlock), 'P3_RESTORE_CONTINUE_ON_ERROR_FORBIDDEN');
  requireCondition(restoreBlock.includes("if(matches.length!==1)"), 'P3_EXACT_MAIN_P2_CARDINALITY_NOT_STRICT');
  requireCondition(restoreBlock.includes("EXACT_MAIN_P2_CANDIDATE_COUNT"), 'P3_EXACT_MAIN_P2_CANDIDATE_COUNT_NOT_PERSISTED');

  const reconcileBlock = text.slice(reconcile, upload);
  requireCondition(/if:\s*\$\{\{\s*always\(\)\s*\}\}/.test(reconcileBlock), 'P3_TERMINAL_RECONCILE_NOT_ALWAYS');
  for (const token of [
    'GITHUB_RUN_ID',
    'GITHUB_RUN_ATTEMPT',
    'GITHUB_SHA',
    'RESTORE_OUTCOME',
    'JOB_STATUS',
    'EXACT_MAIN_P2_MISSING',
    "'VERIFIED_FAIL'",
    "'VERIFIED_PASS'",
    "public_release:'HOLD'",
    "production:'HOLD'",
    'promotion_eligible:false',
  ]) requireCondition(reconcileBlock.includes(token), `P3_TERMINAL_RECONCILE_TOKEN_MISSING:${token}`);

  const uploadBlock = text.slice(upload);
  requireCondition(/if:\s*\$\{\{\s*always\(\)\s*\}\}/.test(uploadBlock), 'P3_TERMINAL_UPLOAD_NOT_ALWAYS');
  requireCondition(uploadBlock.includes('kidults-asi-snapshot-readiness-terminal-v2-main-${{ github.sha }}-${{ github.run_id }}-${{ github.run_attempt }}'), 'P3_TERMINAL_ARTIFACT_NAME_NOT_GENERATION_BOUND');
  requireCondition(uploadBlock.includes('/tmp/kidults-asi-snapshot-readiness-terminal-v2.json'), 'P3_TERMINAL_ARTIFACT_PATH_MISSING');
  requireCondition(uploadBlock.includes('if-no-files-found: error'), 'P3_TERMINAL_ARTIFACT_MISSING_FAIL_CLOSE');

  return {state:'VERIFIED_PASS', workflow:WORKFLOW};
}

function selfTest(text) {
  const cases = [
    ['missing-init', text.replace('- name: Initialize fail-closed P3 terminal receipt', '- name: removed-init')],
    ['restore-no-id', text.replace(/(\- name: Restore exact P2 run and its receipt-bound P0B and P1 artifacts\n)\s+id:\s*restore_p2\n/, '$1')],
    ['weak-cardinality', text.replace('if(matches.length!==1)', 'if(matches.length<1)')],
    ['no-reconcile-always', text.replace(/(\- name: Reconcile P3 terminal receipt\n)\s+if:\s*\$\{\{\s*always\(\)\s*\}\}/, '$1        if: success()')],
    ['no-upload-always', text.replace(/(\- name: Upload P3 terminal receipt\n)\s+if:\s*\$\{\{\s*always\(\)\s*\}\}/, '$1        if: success()')],
    ['weak-name', text.replace('kidults-asi-snapshot-readiness-terminal-v2-main-${{ github.sha }}-${{ github.run_id }}-${{ github.run_attempt }}', 'kidults-asi-snapshot-readiness-terminal-v2')],
  ];
  for (const [name, mutated] of cases) {
    let rejected = false;
    try { validateWorkflow(mutated); } catch { rejected = true; }
    requireCondition(rejected, `P3_TERMINAL_SELF_TEST_FALSE_ACCEPT:${name}`);
  }
  return {state:'VERIFIED_PASS', negative_cases:cases.length};
}

const text = fs.readFileSync(WORKFLOW, 'utf8');
const result = process.argv.includes('--self-test') ? selfTest(text) : validateWorkflow(text);
process.stdout.write(`${JSON.stringify(result)}\n`);
