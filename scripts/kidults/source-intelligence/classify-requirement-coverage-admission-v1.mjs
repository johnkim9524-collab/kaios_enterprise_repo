#!/usr/bin/env node

import fs from 'node:fs';

const SHA_RE = /^[0-9a-f]{40}$/;
const positive = value => Number.isSafeInteger(value) && value > 0;
const ARL_PATH = '.github/workflows/kidults-asi-autonomous-resolution-layer-v1.yml';
const P1_PATH = '.github/workflows/kidults-asi-p1-source-preflight-v1.yml';
const RECOVERY_EVENTS = new Map([
  ['push', 'ARL_PUSH_RECOVERY_NONAUTHORITATIVE'],
  ['schedule', 'ARL_SCHEDULE_RECOVERY_NONAUTHORITATIVE'],
  ['workflow_dispatch', 'ARL_MANUAL_RECOVERY_NONAUTHORITATIVE']
]);

export function classifyRequirementCoverageAdmission({run, classification, repository, executionSha}) {
  const base = {
    id: 'kidults-asi-requirement-coverage-admission-v1', version: '1.0.0',
    state: 'VERIFIED_FAIL', admission: 'INVALID_OR_FAILED', reason: 'UNCLASSIFIED',
    repository, execution_sha: executionSha, arl_run_id: run?.id ?? null,
    arl_run_attempt: run?.run_attempt ?? null, arl_head_sha: run?.head_sha ?? null,
    classification: classification?.classification ?? null,
    classification_reason: classification?.reason ?? null,
    should_run: false, promotion_authority: false,
    production: 'HOLD', public_release: 'HOLD', g5: 'HOLD'
  };
  if (!run || !positive(run.id) || !positive(run.run_attempt)) return {...base, reason: 'ARL_RUN_IDENTITY_INVALID'};
  if (!SHA_RE.test(executionSha ?? '') || !SHA_RE.test(run.head_sha ?? '')) return {...base, reason: 'SHA_INVALID'};
  if (run.repository?.full_name !== repository || run.head_repository?.full_name !== repository) return {...base, reason: 'ARL_REPOSITORY_MISMATCH'};
  if (run.path !== ARL_PATH || run.head_branch !== 'main') return {...base, reason: 'ARL_TRIGGER_IDENTITY_INVALID'};
  if (run.status !== 'completed' || run.conclusion !== 'success') return {...base, reason: 'ARL_NOT_SUCCESS'};
  if (run.head_sha !== executionSha) return {...base, reason: 'ARL_NOT_CURRENT_EXECUTION'};
  if (RECOVERY_EVENTS.has(run.event)) {
    const title = run.display_title ?? run.name ?? '';
    if (title !== `KIDULTS ARL / recovery-${executionSha}` || classification != null) return {...base, reason: 'ARL_RECOVERY_IDENTITY_INVALID'};
    return {...base, state: 'VERIFIED_SKIP', admission: 'EXPECTED_NONAUTHORITATIVE_SKIP', reason: RECOVERY_EVENTS.get(run.event), should_run: false};
  }
  if (run.event !== 'workflow_run') return {...base, reason: 'ARL_TRIGGER_IDENTITY_INVALID'};
  if (!classification || classification.id !== 'kidults-workflow-run-generation-classification-v1' || classification.version !== '1.1.0') return {...base, reason: 'CLASSIFICATION_SCHEMA_INVALID'};
  if (classification.repository !== repository || classification.execution_sha !== executionSha || classification.current_main_sha !== executionSha) return {...base, reason: 'CLASSIFICATION_GENERATION_MISMATCH'};
  if (classification.expected_producer_workflow_path !== P1_PATH || classification.expected_producer_event !== 'workflow_run') return {...base, reason: 'CLASSIFICATION_CONTRACT_MISMATCH'};
  if (!positive(classification.producer_run_id) || !positive(classification.producer_run_attempt)) return {...base, reason: 'CLASSIFICATION_PRODUCER_IDENTITY_INVALID'};
  const title = run.display_title ?? run.name ?? '';
  const match = /^KIDULTS ARL \/ p1-(\d+)$/.exec(title);
  if (!match || Number(match[1]) !== classification.producer_run_id) return {...base, reason: 'CLASSIFICATION_ARL_LINEAGE_MISMATCH'};
  if (classification.classification === 'CURRENT_MAIN_EXACT') {
    if (classification.state !== 'VERIFIED_PASS' || classification.reason !== 'CURRENT_MAIN_PRODUCER_BOUND' || classification.current_main_authority !== true || classification.producer_head_sha !== executionSha || classification.producer_head_branch !== 'main' || classification.producer_workflow_path !== P1_PATH || classification.producer_event !== 'workflow_run' || classification.producer_conclusion !== 'success') return {...base, reason: 'AUTHORITATIVE_CLASSIFICATION_INVALID'};
    return {...base, state: 'VERIFIED_PASS', admission: 'AUTHORITATIVE_REQUIRED', reason: 'CURRENT_MAIN_ARL_ARTIFACT_REQUIRED', should_run: true};
  }
  if (classification.classification === 'EXPECTED_NONAUTHORITATIVE_SKIP') {
    if (classification.state !== 'VERIFIED_SKIP' || classification.current_main_authority !== false || !['PRODUCER_EVENT_MISMATCH', 'UPSTREAM_NON_SUCCESS', 'STALE_PRIOR_MAIN_TRIGGER'].includes(classification.reason)) return {...base, reason: 'EXPECTED_SKIP_CLASSIFICATION_INVALID'};
    return {...base, state: 'VERIFIED_SKIP', admission: 'EXPECTED_NONAUTHORITATIVE_SKIP', reason: classification.reason, should_run: false};
  }
  return {...base, reason: 'CLASSIFICATION_NOT_ADMISSIBLE'};
}

function main() {
  const [runPath, classificationPath, repository, executionSha, outputPath] = process.argv.slice(2);
  if (!runPath || !classificationPath || !repository || !executionSha || !outputPath) throw new Error('REQUIREMENT_COVERAGE_ADMISSION_ARGUMENTS_REQUIRED');
  const result = classifyRequirementCoverageAdmission({
    run: JSON.parse(fs.readFileSync(runPath, 'utf8')),
    classification: classificationPath === '-' ? null : JSON.parse(fs.readFileSync(classificationPath, 'utf8')),
    repository, executionSha
  });
  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.state === 'VERIFIED_FAIL') process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) main();
