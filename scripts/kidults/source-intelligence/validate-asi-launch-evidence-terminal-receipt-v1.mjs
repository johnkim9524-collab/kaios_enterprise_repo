#!/usr/bin/env node
import fs from 'node:fs';

const workflowPath = '.github/workflows/kidults-asi-launch-evidence-program-v1.yml';
const expectedUpload = 'actions/upload-artifact@b7c566a772e6b6bfb58ed0dc250532a479d7789f';
const die = code => { throw new Error(code); };
const requireTrue = (condition, code) => { if (!condition) die(code); };

function validate(text) {
  requireTrue(text.includes('name: KIDULTS ASI Launch Evidence Program V1'), 'WORKFLOW_NAME_MISSING');
  requireTrue(text.includes('runs-on: ubuntu-24.04'), 'RUNNER_NOT_PINNED');
  requireTrue(/^permissions:\n  contents: read$/m.test(text), 'LEAST_PRIVILEGE_CONTENTS_READ_MISSING');

  const uses = [...text.matchAll(/^\s*- uses:\s*([^\s#]+).*$/gm)].map(match => match[1]);
  requireTrue(uses.every(ref => /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[0-9a-f]{40}$/.test(ref)), 'MUTABLE_OR_NONFULL_ACTION_REF');
  requireTrue(uses.includes(expectedUpload), 'UPLOAD_ARTIFACT_PIN_MISSING');

  const prepare = text.indexOf('- name: Prepare terminal evidence directory');
  const syntax = text.indexOf('- name: Validate syntax');
  const stage = text.indexOf('- name: Validate stage truth and fail-closed negative paths');
  const sample = text.indexOf('- name: Validate scientific sample governance');
  const receipt = text.indexOf('- name: Emit fail-closed terminal receipt');
  const upload = text.indexOf(`- uses: ${expectedUpload}`);
  const reapply = text.indexOf('- name: Reapply validation outcome after durable receipt');
  requireTrue([prepare, syntax, stage, sample, receipt, upload, reapply].every(index => index >= 0), 'TERMINAL_EVIDENCE_STEP_MISSING');
  requireTrue(prepare < syntax && syntax < stage && stage < sample && sample < receipt && receipt < upload && upload < reapply, 'TERMINAL_EVIDENCE_ORDER_INVALID');

  const receiptBlock = text.slice(receipt, upload);
  requireTrue(/if:\s*\$\{\{\s*always\(\)\s*\}\}/.test(receiptBlock), 'TERMINAL_RECEIPT_NOT_ALWAYS');
  requireTrue(receiptBlock.includes("RECEIPT_SHA: ${{ github.event.pull_request.head.sha || github.sha }}"), 'EXACT_SOURCE_SHA_BINDING_MISSING');
  requireTrue(receiptBlock.includes('RECEIPT_REF: ${{ github.head_ref || github.ref_name }}'), 'EXACT_SOURCE_REF_BINDING_MISSING');
  requireTrue(receiptBlock.includes("evidence_admission: 'NONE'"), 'EVIDENCE_ADMISSION_NONE_MISSING');
  requireTrue(receiptBlock.includes('promotion_eligible: false'), 'PROMOTION_FALSE_MISSING');
  requireTrue(receiptBlock.includes('promotion_authority: false'), 'PROMOTION_AUTHORITY_FALSE_MISSING');
  requireTrue(receiptBlock.includes('database_mutation_authority: false'), 'DATABASE_AUTHORITY_FALSE_MISSING');
  requireTrue(receiptBlock.includes('external_execution_authority: false'), 'EXTERNAL_AUTHORITY_FALSE_MISSING');
  requireTrue(receiptBlock.includes("production: 'HOLD'"), 'PRODUCTION_HOLD_MISSING');
  requireTrue(receiptBlock.includes("public: 'HOLD'"), 'PUBLIC_HOLD_MISSING');
  requireTrue(receiptBlock.includes("g5: 'HOLD'"), 'G5_HOLD_MISSING');
  requireTrue(receiptBlock.includes('empirical_authority: false'), 'EMPIRICAL_AUTHORITY_FALSE_MISSING');
  requireTrue(receiptBlock.includes('provider_activation_authority: false'), 'PROVIDER_AUTHORITY_FALSE_MISSING');

  const uploadBlock = text.slice(upload, reapply);
  requireTrue(/if:\s*\$\{\{\s*always\(\)\s*\}\}/.test(uploadBlock), 'TERMINAL_UPLOAD_NOT_ALWAYS');
  requireTrue(uploadBlock.includes('if-no-files-found: error'), 'UPLOAD_EMPTY_NOT_FAIL_CLOSED');
  requireTrue(uploadBlock.includes('artifacts/asi-launch-evidence-terminal'), 'TERMINAL_ARTIFACT_PATH_MISSING');

  const reapplyBlock = text.slice(reapply);
  requireTrue(/if:\s*\$\{\{\s*always\(\)\s*\}\}/.test(reapplyBlock), 'REAPPLY_NOT_ALWAYS');
  requireTrue(reapplyBlock.includes('terminal-receipt-v1.json'), 'REAPPLY_RECEIPT_READBACK_MISSING');
  requireTrue(reapplyBlock.includes('process.exit(1)'), 'FAILED_VALIDATION_NOT_REAPPLIED');

  for (const id of ['validate_syntax', 'validate_stage_truth', 'validate_sample_governance']) {
    requireTrue(text.includes(`id: ${id}`), `VALIDATION_ID_MISSING:${id}`);
  }
  requireTrue((text.match(/echo "exit_code=\$rc" >> "\$GITHUB_OUTPUT"/g) || []).length === 3, 'VALIDATION_EXIT_CODE_CAPTURE_COUNT');
  requireTrue((text.match(/exit 0/g) || []).length >= 3, 'VALIDATION_CAPTURE_NOT_NONTERMINAL');

  return true;
}

const source = fs.readFileSync(workflowPath, 'utf8');

if (process.argv.includes('--self-test')) {
  const negativeCases = [
    source.replace('if-no-files-found: error', 'if-no-files-found: ignore'),
    source.replace(`uses: ${expectedUpload}`, 'uses: actions/upload-artifact@v6'),
    source.replace('promotion_eligible: false', 'promotion_eligible: true'),
    source.replace('github.event.pull_request.head.sha || github.sha', 'github.sha'),
    source.replace("evidence_admission: 'NONE'", "evidence_admission: 'EMPIRICAL'"),
    source.replace('- name: Reapply validation outcome after durable receipt', '- name: Reapply outcome after receipt'),
  ];
  for (const [index, candidate] of negativeCases.entries()) {
    let rejected = false;
    try { validate(candidate); } catch { rejected = true; }
    requireTrue(rejected, `NEGATIVE_CASE_FALSE_GREEN:${index + 1}`);
  }
  console.log(JSON.stringify({ test: 'ASI_LAUNCH_EVIDENCE_TERMINAL_RECEIPT_V1_SELF_TEST', state: 'VERIFIED_PASS', negative_cases: negativeCases.length }));
}

validate(source);
console.log(JSON.stringify({ validator: 'ASI_LAUNCH_EVIDENCE_TERMINAL_RECEIPT_V1', state: 'VERIFIED_PASS', authority: 'CONTROL_ONLY', promotion_eligible: false, production: 'HOLD', public: 'HOLD', g5: 'HOLD' }));
