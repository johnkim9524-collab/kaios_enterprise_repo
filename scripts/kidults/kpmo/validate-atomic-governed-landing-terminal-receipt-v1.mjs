#!/usr/bin/env node
import fs from 'node:fs';

const workflowPath = '.github/workflows/kidults-atomic-governed-landing-v1.yml';
const runnerPath = 'scripts/kidults/kpmo/run-atomic-governed-landing-v1.mjs';
const workflow = fs.readFileSync(workflowPath, 'utf8');
const runner = fs.readFileSync(runnerPath, 'utf8');

function findingsFor(workflowText, runnerText) {
  const findings = [];
  const require = (condition, id) => { if (!condition) findings.push(id); };

  require(workflowText.includes('- name: Upload exact-run governed landing terminal receipt'), 'TERMINAL_UPLOAD_STEP_MISSING');
  require(workflowText.includes('if: always()'), 'TERMINAL_UPLOAD_NOT_ALWAYS');
  require(workflowText.includes('actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02'), 'TERMINAL_UPLOAD_ACTION_NOT_PINNED');
  require(workflowText.includes('kidults-atomic-governed-landing-terminal-${{ github.run_id }}-${{ github.run_attempt }}'), 'TERMINAL_ARTIFACT_RUN_ATTEMPT_BINDING_MISSING');
  require(workflowText.includes('path: /tmp/kidults-atomic-governed-landing-terminal-receipt.json'), 'TERMINAL_ARTIFACT_PATH_MISSING');
  require(workflowText.includes('if-no-files-found: error'), 'TERMINAL_ARTIFACT_MISSING_NOT_FATAL');

  require(runnerText.includes("const terminalReceiptPath = '/tmp/kidults-atomic-governed-landing-terminal-receipt.json';"), 'TERMINAL_RECEIPT_PATH_MISSING');
  require(runnerText.includes("id: 'kidults-atomic-governed-landing-terminal-receipt-v1'"), 'TERMINAL_RECEIPT_ID_MISSING');
  require(runnerText.includes('workflow_run_id:'), 'TERMINAL_RUN_ID_BINDING_MISSING');
  require(runnerText.includes('workflow_run_attempt:'), 'TERMINAL_RUN_ATTEMPT_BINDING_MISSING');
  require(runnerText.includes('exact_head_sha:'), 'TERMINAL_HEAD_BINDING_MISSING');
  require(runnerText.includes('execution_main_sha:'), 'TERMINAL_MAIN_BINDING_MISSING');
  require(runnerText.includes('authorization_id_sha256:'), 'TERMINAL_AUTHORIZATION_DIGEST_MISSING');
  require(!runnerText.includes('operation_authorization_id: authorizationId'), 'RAW_AUTHORIZATION_ID_LEAK');
  require(runnerText.includes("writeTerminalReceipt('RUNNING', 'INITIALIZED')"), 'TERMINAL_INITIALIZATION_MISSING');
  require(runnerText.includes("writeTerminalReceipt('MERGED_VERIFIED', 'MERGED_VERIFIED'"), 'TERMINAL_SUCCESS_RECEIPT_MISSING');
  require(runnerText.includes("writeTerminalReceipt('FAILURE', failureClass)"), 'TERMINAL_FAILURE_RECEIPT_MISSING');

  const catchIndex = runnerText.indexOf('} catch (error) {');
  const failureReceiptIndex = runnerText.indexOf("writeTerminalReceipt('FAILURE', failureClass)", catchIndex);
  const failureStatusIndex = runnerText.indexOf("await publish('failure', failureClass)", catchIndex);
  require(catchIndex >= 0 && failureReceiptIndex > catchIndex, 'TERMINAL_FAILURE_CATCH_BINDING_MISSING');
  require(failureStatusIndex < 0 || failureReceiptIndex < failureStatusIndex, 'TERMINAL_FAILURE_RECEIPT_NOT_FIRST');

  return findings;
}

const findings = findingsFor(workflow, runner);
const mutations = [
  ['REMOVE_ALWAYS_UPLOAD', workflow.replace('if: always()', 'if: success()'), runner],
  ['ALLOW_MISSING_ARTIFACT', workflow.replace('if-no-files-found: error', 'if-no-files-found: warn'), runner],
  ['REMOVE_FAILURE_RECEIPT', workflow, runner.replace("try { writeTerminalReceipt('FAILURE', failureClass); } catch {}", '')],
  ['REMOVE_SUCCESS_RECEIPT', workflow, runner.replace("const successReceipt = writeTerminalReceipt('MERGED_VERIFIED', 'MERGED_VERIFIED', {", "const successReceipt = { state: 'MERGED_VERIFIED',")],
  ['LEAK_RAW_AUTHORIZATION', workflow, runner.replace('authorization_id_sha256: authorizationIdSha256,', 'authorization_id_sha256: authorizationIdSha256,\n    operation_authorization_id: authorizationId,')],
];

const mutationResults = mutations.map(([id, workflowText, runnerText]) => ({
  id,
  rejected: findingsFor(workflowText, runnerText).length > 0,
}));
for (const result of mutationResults) {
  if (!result.rejected) findings.push(`MUTATION_FALSE_GREEN:${result.id}`);
}

console.log(JSON.stringify({
  id: 'kidults-atomic-governed-landing-terminal-receipt-regression-v1',
  state: findings.length ? 'VERIFIED_FAIL' : 'VERIFIED_PASS',
  terminal_receipt_required_on_success_and_failure: true,
  artifact_run_attempt_bound: true,
  missing_artifact_fails_closed: true,
  raw_authorization_identifier_forbidden: true,
  mutations: mutationResults,
  findings,
  production: 'HOLD',
  public_release: 'HOLD',
  g5: 'HOLD',
}, null, 2));

if (findings.length) process.exit(1);
