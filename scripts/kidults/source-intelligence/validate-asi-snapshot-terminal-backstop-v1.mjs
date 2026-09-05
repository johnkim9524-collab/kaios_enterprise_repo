#!/usr/bin/env node
import fs from 'node:fs';

const WORKFLOW = '.github/workflows/kidults-asi-snapshot-terminal-backstop-v1.yml';
const fail = code => { throw new Error(code); };
const req = (condition, code) => { if (!condition) fail(code); };

export function validateWorkflow(text) {
  for (const token of [
    'name: KIDULTS ASI Snapshot Terminal Receipt Backstop v1',
    'workflow_run:',
    "- 'KIDULTS ASI Snapshot Readiness Factory v2'",
    'branches: [main]',
    'types: [completed]',
    'actions: read',
    'contents: read',
    'Initialize fail-closed backstop receipt',
    'Resolve immutable Snapshot run envelope and artifact truth',
    'Validate durable backstop receipt',
    'Upload Snapshot terminal backstop receipt',
    'Preserve exact-main upstream failure as RED after receipt retention',
    'CURRENT_MAIN_EXACT',
    'EXPECTED_NONAUTHORITATIVE_SKIP',
    'CURRENT_MAIN_SNAPSHOT_TERMINAL_ARTIFACT_REQUIRED',
    'kidults-asi-p3-archive-consumer-terminal-v1-${runId}-${runAttempt}',
    'promotion_eligible:false',
    "public_release:'HOLD'",
    "production:'HOLD'",
  ]) req(text.includes(token), `BACKSTOP_TOKEN_MISSING:${token}`);

  req(!/permissions:[\s\S]{0,200}(contents:\s*write|actions:\s*write|statuses:\s*write|deployments:\s*write)/.test(text), 'BACKSTOP_WRITE_PERMISSION_FORBIDDEN');
  req(!/(secrets\.|CLOUDFLARE_|PSA_|DATABASE_URL|POSTGRES|wrangler|curl\s+.*cloudflare|deployment\s+create)/i.test(text), 'BACKSTOP_SECRET_OR_PROVIDER_SURFACE_FORBIDDEN');

  const init = text.indexOf('- name: Initialize fail-closed backstop receipt');
  const resolve = text.indexOf('- name: Resolve immutable Snapshot run envelope and artifact truth');
  const validate = text.indexOf('- name: Validate durable backstop receipt');
  const upload = text.indexOf('- name: Upload Snapshot terminal backstop receipt');
  const preserve = text.indexOf('- name: Preserve exact-main upstream failure as RED after receipt retention');
  req(init >= 0 && resolve > init && validate > resolve && upload > validate && preserve > upload, 'BACKSTOP_ORDER_INVALID');

  const uploadBlock = text.slice(upload, preserve);
  req(/if:\s*\$\{\{\s*always\(\)\s*\}\}/.test(uploadBlock), 'BACKSTOP_UPLOAD_NOT_ALWAYS');
  req(uploadBlock.includes('if-no-files-found: error'), 'BACKSTOP_UPLOAD_MISSING_FAIL_CLOSE');
  req(uploadBlock.includes('${{ github.event.workflow_run.id }}') && uploadBlock.includes('${{ github.event.workflow_run.run_attempt }}') && uploadBlock.includes('${{ github.event.workflow_run.head_sha }}') && uploadBlock.includes('${{ github.run_id }}') && uploadBlock.includes('${{ github.run_attempt }}'), 'BACKSTOP_ARTIFACT_NAME_NOT_FULLY_BOUND');

  return { state: 'VERIFIED_PASS', workflow: WORKFLOW };
}

export function validateReceipt(x) {
  req(x?.id === 'kidults-asi-snapshot-terminal-backstop-v1', 'BACKSTOP_RECEIPT_ID');
  req(['VERIFIED_PASS', 'VERIFIED_FAIL', 'EXPECTED_NONAUTHORITATIVE_SKIP'].includes(x.state), 'BACKSTOP_RECEIPT_STATE');
  req(['CURRENT_MAIN_EXACT', 'EXPECTED_NONAUTHORITATIVE_SKIP'].includes(x.generation_class), 'BACKSTOP_GENERATION_CLASS');
  req(Number.isInteger(x.upstream_run_id) && x.upstream_run_id > 0, 'BACKSTOP_RUN_ID');
  req(Number.isInteger(x.upstream_run_attempt) && x.upstream_run_attempt > 0, 'BACKSTOP_RUN_ATTEMPT');
  req(/^[0-9a-f]{40}$/.test(x.upstream_head_sha || ''), 'BACKSTOP_HEAD_SHA');
  req(['success','failure','cancelled','timed_out','action_required','neutral','skipped','stale'].includes(x.upstream_conclusion), 'BACKSTOP_CONCLUSION');
  req(x.promotion_eligible === false, 'BACKSTOP_PROMOTION_FALSE');
  req(x.public_release === 'HOLD' && x.production === 'HOLD' && x.g5 === 'HOLD', 'BACKSTOP_HOLD_BOUNDARY');
  req(Number.isInteger(x.upstream_artifact_count) && x.upstream_artifact_count >= 0, 'BACKSTOP_ARTIFACT_COUNT');
  req(Number.isInteger(x.upstream_terminal_artifact_count) && x.upstream_terminal_artifact_count >= 0, 'BACKSTOP_TERMINAL_COUNT');
  req(x.same_run_terminal_present === (x.upstream_terminal_artifact_count > 0), 'BACKSTOP_TERMINAL_BOOLEAN_BINDING');
  if (x.expected_same_run_terminal_name !== null && x.expected_same_run_terminal_name !== undefined) {
    req(x.expected_same_run_terminal_name === `kidults-asi-p3-archive-consumer-terminal-v1-${x.upstream_run_id}-${x.upstream_run_attempt}`, 'BACKSTOP_TERMINAL_NAME_BINDING');
  }
  if (x.generation_class === 'EXPECTED_NONAUTHORITATIVE_SKIP') req(x.state === 'EXPECTED_NONAUTHORITATIVE_SKIP', 'BACKSTOP_STALE_GENERATION_STATE');
  if (x.generation_class === 'CURRENT_MAIN_EXACT') {
    req(x.same_run_terminal_present === true && x.upstream_terminal_artifact_count === 1, 'BACKSTOP_CURRENT_MAIN_TERMINAL_REQUIRED');
    req(x.expected_same_run_terminal_name === `kidults-asi-p3-archive-consumer-terminal-v1-${x.upstream_run_id}-${x.upstream_run_attempt}`, 'BACKSTOP_CURRENT_MAIN_TERMINAL_NAME');
    if (x.upstream_conclusion === 'success') req(x.state === 'VERIFIED_PASS', 'BACKSTOP_SUCCESS_MAPPING');
    else req(x.state === 'VERIFIED_FAIL', 'BACKSTOP_FAILURE_MAPPING');
  }
  return { state: 'VERIFIED_PASS', receipt: x.id };
}

function selfTest(text) {
  validateWorkflow(text);
  const base = {
    id:'kidults-asi-snapshot-terminal-backstop-v1', state:'VERIFIED_FAIL', generation_class:'CURRENT_MAIN_EXACT',
    upstream_run_id:1, upstream_run_attempt:1, upstream_head_sha:'a'.repeat(40), upstream_conclusion:'failure',
    upstream_artifact_count:1, upstream_terminal_artifact_count:1, same_run_terminal_present:true,
    expected_same_run_terminal_name:'kidults-asi-p3-archive-consumer-terminal-v1-1-1',
    promotion_eligible:false, public_release:'HOLD', production:'HOLD', g5:'HOLD'
  };
  validateReceipt(structuredClone(base));
  const success = structuredClone(base); success.state='VERIFIED_PASS'; success.upstream_conclusion='success'; validateReceipt(success);
  const stale = structuredClone(base); stale.state='EXPECTED_NONAUTHORITATIVE_SKIP'; stale.generation_class='EXPECTED_NONAUTHORITATIVE_SKIP'; stale.upstream_terminal_artifact_count=0; stale.same_run_terminal_present=false; stale.expected_same_run_terminal_name='kidults-asi-p3-archive-consumer-terminal-v1-1-1'; validateReceipt(stale);
  const cases = [
    ['upload-not-always', text.replace(/(- name: Upload Snapshot terminal backstop receipt\n)\s+if:\s*\$\{\{\s*always\(\)\s*\}\}/, '$1        if: success()')],
    ['write-permission', text.replace('contents: read', 'contents: write')],
    ['upstream-name-drift', text.replace("- 'KIDULTS ASI Snapshot Readiness Factory v2'", "- 'WRONG'")],
    ['terminal-name-drift', text.replace('kidults-asi-p3-archive-consumer-terminal-v1-${runId}-${runAttempt}', 'wrong-terminal-${runId}-${runAttempt}')],
    ['current-main-terminal-not-required', text.replace("if(generationClass==='CURRENT_MAIN_EXACT')req(terminal.length===1,'CURRENT_MAIN_SNAPSHOT_TERMINAL_ARTIFACT_REQUIRED');", '')],
  ];
  for (const [name, mutated] of cases) {
    let rejected=false; try { validateWorkflow(mutated); } catch { rejected=true; }
    req(rejected, `BACKSTOP_FALSE_ACCEPT:${name}`);
  }
  for (const [name, mutate] of [
    ['promotion', x=>{x.promotion_eligible=true;}],
    ['bad-sha', x=>{x.upstream_head_sha='bad';}],
    ['failure-as-pass', x=>{x.state='VERIFIED_PASS';}],
    ['terminal-missing', x=>{x.upstream_terminal_artifact_count=0;x.same_run_terminal_present=false;}],
    ['terminal-name-drift', x=>{x.expected_same_run_terminal_name='wrong';}],
  ]) {
    const x=structuredClone(base); mutate(x); let rejected=false; try { validateReceipt(x); } catch { rejected=true; }
    req(rejected, `BACKSTOP_RECEIPT_FALSE_ACCEPT:${name}`);
  }
  return {state:'VERIFIED_PASS', workflow_negative_cases:cases.length, receipt_negative_cases:5, current_main_same_run_terminal_required:true};
}

const text = fs.readFileSync(WORKFLOW, 'utf8');
const out = process.argv.includes('--self-test') ? selfTest(text) : validateWorkflow(text);
process.stdout.write(`${JSON.stringify(out)}\n`);
