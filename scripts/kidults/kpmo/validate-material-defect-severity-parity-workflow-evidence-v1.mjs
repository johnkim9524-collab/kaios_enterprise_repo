#!/usr/bin/env node

import fs from 'node:fs';

const workflowPath = '.github/workflows/kpmo-material-defect-severity-parity-v1.yml';
const text = fs.readFileSync(workflowPath, 'utf8');

const required = [
  'id: parity_validation',
  'continue-on-error: true',
  'name: Build run-bound parity diagnostic receipt',
  'if: always()',
  'kpmo-material-defect-severity-parity-${{ github.run_id }}-${{ github.run_attempt }}',
  'artifacts/kpmo-material-defect-severity-parity/diagnostic-receipt.json',
  'artifacts/kpmo-material-defect-severity-parity/validator.log',
  'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02',
  'if-no-files-found: error',
  'name: Enforce parity validator result after evidence retention',
];

const missing = required.filter((token) => !text.includes(token));
if (missing.length) {
  console.error(`PARITY_TERMINAL_EVIDENCE_CONTRACT_MISSING:${missing.join('|')}`);
  process.exit(1);
}

const forbidden = [
  /Validate open material-defect severity parity[\s\S]*?\|\|\s*true/,
  /Enforce parity validator result after evidence retention[\s\S]*?continue-on-error:\s*true/,
];
for (const pattern of forbidden) {
  if (pattern.test(text)) {
    console.error(`PARITY_TERMINAL_EVIDENCE_CONTRACT_FORBIDDEN:${pattern}`);
    process.exit(1);
  }
}

console.log('PARITY_TERMINAL_EVIDENCE_CONTRACT_OK');
