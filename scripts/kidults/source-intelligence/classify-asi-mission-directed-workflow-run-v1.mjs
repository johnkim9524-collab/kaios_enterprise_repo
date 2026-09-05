#!/usr/bin/env node

import fs from 'node:fs';
import process from 'node:process';

export const EXPECTED_PRODUCER_WORKFLOW_PATH = '.github/workflows/kidults-asi-mission-consumption-v1.yml';

const SHA_RE = /^[0-9a-f]{40}$/;

export function classifyMissionConsumptionWorkflowRun({ event, currentMainSha, repository }) {
  const run = event?.workflow_run;
  const base = {
    id: 'kidults-asi-mission-directed-workflow-run-classification-v1',
    version: '1.0.0',
    state: 'VERIFIED_FAIL',
    classification: 'INVALID_TRIGGER',
    reason: 'UNCLASSIFIED',
    repository,
    current_main_sha: currentMainSha,
    producer_workflow_path: run?.path ?? null,
    producer_run_id: Number.isInteger(run?.id) ? run.id : null,
    producer_run_attempt: Number.isInteger(run?.run_attempt) ? run.run_attempt : null,
    producer_head_repository: run?.head_repository?.full_name ?? null,
    producer_head_branch: run?.head_branch ?? null,
    producer_head_sha: run?.head_sha ?? null,
    producer_conclusion: run?.conclusion ?? null,
    current_main_authority: false,
    promotion_eligible: false,
    promotion_authority: false,
    public_release: 'HOLD',
    production: 'HOLD',
    g5: 'HOLD'
  };

  if (!run || !Number.isInteger(run.id)) {
    return { ...base, reason: 'WORKFLOW_RUN_EVENT_MISSING' };
  }
  if (!SHA_RE.test(currentMainSha ?? '')) {
    return { ...base, reason: 'CURRENT_MAIN_SHA_INVALID' };
  }
  if (!repository || run.head_repository?.full_name !== repository) {
    return { ...base, reason: 'PRODUCER_REPOSITORY_MISMATCH' };
  }
  if (run.head_branch !== 'main') {
    return { ...base, reason: 'PRODUCER_BRANCH_MISMATCH' };
  }
  if (run.path !== EXPECTED_PRODUCER_WORKFLOW_PATH) {
    return { ...base, reason: 'PRODUCER_WORKFLOW_PATH_MISMATCH' };
  }
  if (!SHA_RE.test(run.head_sha ?? '')) {
    return { ...base, reason: 'PRODUCER_HEAD_SHA_INVALID' };
  }

  if (run.conclusion !== 'success') {
    return {
      ...base,
      state: 'VERIFIED_SKIP',
      classification: 'EXPECTED_NONAUTHORITATIVE_SKIP',
      reason: 'UPSTREAM_NON_SUCCESS',
      producer_conclusion: run.conclusion ?? 'UNKNOWN'
    };
  }

  if (run.head_sha !== currentMainSha) {
    return {
      ...base,
      state: 'VERIFIED_SKIP',
      classification: 'EXPECTED_NONAUTHORITATIVE_SKIP',
      reason: 'STALE_PRIOR_MAIN_TRIGGER'
    };
  }

  return {
    ...base,
    state: 'VERIFIED_PASS',
    classification: 'CURRENT_MAIN_EXACT',
    reason: 'CURRENT_MAIN_PRODUCER_BOUND',
    current_main_authority: true
  };
}

function main() {
  const [eventPath, currentMainSha, repository, outputPath] = process.argv.slice(2);
  if (!eventPath || !currentMainSha || !repository || !outputPath) {
    throw new Error('USAGE: classify-asi-mission-directed-workflow-run-v1.mjs <event-json> <current-main-sha> <repository> <output-json>');
  }
  const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
  const result = classifyMissionConsumptionWorkflowRun({ event, currentMainSha, repository });
  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main();
}
