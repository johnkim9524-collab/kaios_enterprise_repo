import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyRequirementCoverageAdmission as classify} from '../../../scripts/kidults/source-intelligence/classify-requirement-coverage-admission-v1.mjs';

const repo = 'johnkim9524-collab/kaios_enterprise_repo';
const sha = 'a'.repeat(40);
const p1 = 34045525413;
const run = {id: 34045595210, run_attempt: 1, name: `KIDULTS ARL / p1-${p1}`, display_title: `KIDULTS ARL / p1-${p1}`, path: '.github/workflows/kidults-asi-autonomous-resolution-layer-v1.yml', event: 'workflow_run', head_branch: 'main', head_sha: sha, status: 'completed', conclusion: 'success', repository: {full_name: repo}, head_repository: {full_name: repo}};
const receipt = {id: 'kidults-workflow-run-generation-classification-v1', version: '1.1.0', state: 'VERIFIED_PASS', classification: 'CURRENT_MAIN_EXACT', reason: 'CURRENT_MAIN_PRODUCER_BOUND', repository: repo, current_main_sha: sha, execution_sha: sha, expected_producer_workflow_path: '.github/workflows/kidults-asi-p1-source-preflight-v1.yml', expected_producer_event: 'workflow_run', producer_workflow_path: '.github/workflows/kidults-asi-p1-source-preflight-v1.yml', producer_event: 'workflow_run', producer_run_id: p1, producer_run_attempt: 1, producer_head_repository: repo, producer_head_branch: 'main', producer_head_sha: sha, producer_conclusion: 'success', current_main_authority: true};
const classifyWith = (r = run, c = receipt, executionSha = sha) => classify({run: structuredClone(r), classification: structuredClone(c), repository: repo, executionSha});

test('admits only exact current-main ARL producer', () => {
  const result = classifyWith();
  assert.equal(result.state, 'VERIFIED_PASS');
  assert.equal(result.admission, 'AUTHORITATIVE_REQUIRED');
  assert.equal(result.should_run, true);
});

for (const [event, reason] of [
  ['push', 'ARL_PUSH_RECOVERY_NONAUTHORITATIVE'],
  ['schedule', 'ARL_SCHEDULE_RECOVERY_NONAUTHORITATIVE'],
  ['workflow_dispatch', 'ARL_MANUAL_RECOVERY_NONAUTHORITATIVE']
]) {
  test(`terminates exact ${event} ARL recovery as proven nonauthority without classification artifact`, () => {
    const recovery = {...structuredClone(run), event, name: `KIDULTS ARL / recovery-${sha}`, display_title: `KIDULTS ARL / recovery-${sha}`};
    const result = classify({run: recovery, classification: null, repository: repo, executionSha: sha});
    assert.equal(result.state, 'VERIFIED_SKIP');
    assert.equal(result.admission, 'EXPECTED_NONAUTHORITATIVE_SKIP');
    assert.equal(result.reason, reason);
    assert.equal(result.should_run, false);
  });

  test(`rejects forged ${event} ARL recovery identity`, () => {
    const recovery = {...structuredClone(run), event, name: 'KIDULTS ARL / recovery-forged', display_title: 'KIDULTS ARL / recovery-forged'};
    const result = classify({run: recovery, classification: null, repository: repo, executionSha: sha});
    assert.equal(result.state, 'VERIFIED_FAIL');
    assert.equal(result.reason, 'ARL_RECOVERY_IDENTITY_INVALID');
  });
}

test('rejects classification artifact attached to scheduled recovery', () => {
  const recovery = {...structuredClone(run), event: 'schedule', name: `KIDULTS ARL / recovery-${sha}`, display_title: `KIDULTS ARL / recovery-${sha}`};
  const result = classify({run: recovery, classification: structuredClone(receipt), repository: repo, executionSha: sha});
  assert.equal(result.state, 'VERIFIED_FAIL');
  assert.equal(result.reason, 'ARL_RECOVERY_IDENTITY_INVALID');
});

test('rejects unallowlisted non-artifact event instead of silently skipping', () => {
  const recovery = {...structuredClone(run), event: 'pull_request', name: `KIDULTS ARL / recovery-${sha}`, display_title: `KIDULTS ARL / recovery-${sha}`};
  const result = classify({run: recovery, classification: null, repository: repo, executionSha: sha});
  assert.equal(result.state, 'VERIFIED_FAIL');
  assert.equal(result.reason, 'ARL_TRIGGER_IDENTITY_INVALID');
});

for (const reason of ['PRODUCER_EVENT_MISMATCH', 'UPSTREAM_NON_SUCCESS', 'STALE_PRIOR_MAIN_TRIGGER']) test(`expected skip is terminal nonauthority: ${reason}`, () => {
  const result = classifyWith(run, {...receipt, state: 'VERIFIED_SKIP', classification: 'EXPECTED_NONAUTHORITATIVE_SKIP', reason, current_main_authority: false});
  assert.equal(result.state, 'VERIFIED_SKIP');
  assert.equal(result.admission, 'EXPECTED_NONAUTHORITATIVE_SKIP');
  assert.equal(result.should_run, false);
});

for (const [label, mutate, reason] of [
  ['ARL lineage', (r) => {r.display_title = 'KIDULTS ARL / p1-1';}, 'CLASSIFICATION_ARL_LINEAGE_MISMATCH'],
  ['classification SHA', (_r, c) => {c.current_main_sha = 'b'.repeat(40);}, 'CLASSIFICATION_GENERATION_MISMATCH'],
  ['producer path', (_r, c) => {c.expected_producer_workflow_path = '.github/workflows/other.yml';}, 'CLASSIFICATION_CONTRACT_MISMATCH'],
  ['false PASS', (_r, c) => {c.current_main_authority = false;}, 'AUTHORITATIVE_CLASSIFICATION_INVALID'],
  ['unknown classification', (_r, c) => {c.classification = 'UNKNOWN';}, 'CLASSIFICATION_NOT_ADMISSIBLE'],
  ['failed ARL', (r) => {r.conclusion = 'failure';}, 'ARL_NOT_SUCCESS']
]) test(`fails closed on ${label}`, () => {
  const r = structuredClone(run), c = structuredClone(receipt); mutate(r, c);
  const result = classifyWith(r, c);
  assert.equal(result.state, 'VERIFIED_FAIL');
  assert.equal(result.reason, reason);
  assert.equal(result.should_run, false);
});
