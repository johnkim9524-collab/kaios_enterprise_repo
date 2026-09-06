#!/usr/bin/env node
import fs from 'node:fs';

const ARL_PATH = '.github/workflows/kidults-asi-autonomous-resolution-layer-v1.yml';
const COVERAGE_PATH = '.github/workflows/kidults-asi-requirement-adapter-coverage-v1.yml';
const TERMINAL_BLOCK = `      - name: Preserve non-authoritative or invalid trigger RED after receipt retention
        if: steps.classify.outputs.classification != 'CURRENT_MAIN_EXACT'
        run: exit 1`;
const PRODUCER_GUARD = "if: always() && github.event_name == 'workflow_run' && github.event.workflow_run.conclusion == 'success' && needs.classify-p1-generation.outputs.classification == 'CURRENT_MAIN_EXACT'";
const COVERAGE_GUARD = "if: github.event_name != 'workflow_run' || (github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.event == 'workflow_run')";
const CLASSIFICATION_UPLOAD = 'name: kidults-asi-arl-p1-generation-classification-v1-${{ github.run_id }}-${{ github.run_attempt }}';
const occurrences = (source, needle) => source.split(needle).length - 1;
const fail = (code) => { const error = new Error(code); error.code = code; throw error; };

export function validateArlClassificationTerminal(readFile = (path) => fs.readFileSync(path, 'utf8')) {
  const arl = readFile(ARL_PATH);
  const coverage = readFile(COVERAGE_PATH);
  if (occurrences(arl, TERMINAL_BLOCK) !== 1) fail('ARL_NONAUTHORITATIVE_TERMINAL_BLOCK_INVALID');
  if (occurrences(arl, PRODUCER_GUARD) !== 1) fail('ARL_AUTHORITATIVE_PRODUCER_GUARD_INVALID');
  if (occurrences(arl, CLASSIFICATION_UPLOAD) !== 1) fail('ARL_CLASSIFICATION_RECEIPT_RETENTION_INVALID');
  if (occurrences(coverage, COVERAGE_GUARD) !== 1) fail('COVERAGE_SUCCESS_ONLY_TRIGGER_GUARD_INVALID');
  if (arl.includes("steps.classify.outputs.classification == 'INVALID_TRIGGER'")) fail('ARL_EXPECTED_SKIP_FALSE_GREEN_REINTRODUCED');
  return {
    id: 'kidults-arl-classification-terminal-validation-v1',
    state: 'VERIFIED_PASS',
    classification_receipt_retained: true,
    nonauthoritative_terminal_fail_closed: true,
    authoritative_producer_guarded: true,
    coverage_success_only_trigger_guarded: true,
  };
}

const pristine = {
  [ARL_PATH]: fs.readFileSync(ARL_PATH, 'utf8'),
  [COVERAGE_PATH]: fs.readFileSync(COVERAGE_PATH, 'utf8'),
};
const mutations = [
  { ...pristine, [ARL_PATH]: pristine[ARL_PATH].replace(TERMINAL_BLOCK, TERMINAL_BLOCK.replace("classification != 'CURRENT_MAIN_EXACT'", "classification == 'INVALID_TRIGGER'")) },
  { ...pristine, [ARL_PATH]: pristine[ARL_PATH].replace(TERMINAL_BLOCK, TERMINAL_BLOCK.replace('run: exit 1', 'run: exit 0')) },
  { ...pristine, [ARL_PATH]: pristine[ARL_PATH].replace(PRODUCER_GUARD, PRODUCER_GUARD.replace(" == 'CURRENT_MAIN_EXACT'", " != 'INVALID_TRIGGER'")) },
  { ...pristine, [ARL_PATH]: pristine[ARL_PATH].replace(CLASSIFICATION_UPLOAD, 'name: classification-unbound') },
  { ...pristine, [COVERAGE_PATH]: pristine[COVERAGE_PATH].replace(COVERAGE_GUARD, "if: github.event_name != 'workflow_run' || github.event.workflow_run.conclusion != 'cancelled'") },
];
const result = validateArlClassificationTerminal((path) => pristine[path]);
for (const mutation of mutations) {
  let rejected = false;
  try { validateArlClassificationTerminal((path) => mutation[path]); } catch { rejected = true; }
  if (!rejected) fail('ARL_CLASSIFICATION_TERMINAL_MUTATION_NOT_REJECTED');
}
process.stdout.write(JSON.stringify({ ...result, negative_mutations_rejected: mutations.length }) + '\n');
