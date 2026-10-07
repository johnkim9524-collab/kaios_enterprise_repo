import {spawnSync} from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = file => fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n');
const contract = JSON.parse(read('coordination/kidults/kpmo/post-landing-platform-runtime-terminal-lifecycle-v1.json'));
const apply = read('.github/workflows/kpmo-canonical-generation-v3-apply.yml');
const writer = read('scripts/kidults/kpmo/canonical-generation-v3.mjs');
const truth = read('.github/workflows/kpmo-live-canonical-issue-truth-v1.yml');
const discovery = read('.github/workflows/kidults-asi-global-any-site-hourly-pooling-v2.yml');
const reserve = read('.github/workflows/kidults-asi-sharded-source-reserve-v1.yml');
const sentinel = read('.github/workflows/kpmo-continuous-assurance-sentinel-health-v1.yml');
const sentinelTrigger = read('scripts/kidults/kpmo/validate-sentinel-trigger-v1.mjs');
const assurance = read('.github/workflows/kidults-platform-continuous-assurance-v1.yml');

test('one Program Owner landing approval has a finite automatic terminal path', () => {
  assert.equal(contract.classification, 'DEFECT_REMEDIATED');
  assert.equal(contract.governance_boundary.program_owner_approvals_per_change, 1);
  assert.equal(contract.governance_boundary.canonical_natural_refresh_requires_program_owner_approval, false);
  assert.equal(contract.governance_boundary.canonical_manual_recovery_requires_program_owner_approval, true);
  assert.equal(contract.termination.approval_loop_possible, false);
  assert.deepEqual(contract.terminal_sequence, [
    'ATOMIC_GOVERNED_LANDING', 'PROTECTED_MAIN_PUSH', 'CANONICAL_V3_APPEND_ONLY_REFRESH',
    'LIVE_CANONICAL_TRUTH', 'NATURAL_EXACT_SHA_PRODUCER_CHAIN', 'SHADOW_OPERATING_EVIDENCE',
    'P0B_P1_ARL_REQUIREMENT_COVERAGE', 'ANY_SITE_EXACT_MAIN_DISCOVERY', 'SHARDED_SOURCE_RESERVE',
    'EXACT_MAIN_HEALTH_SENTINEL', 'CONTINUOUS_ASSURANCE', 'CORE_FOUR_CONTROL_GREEN',
    'WHOLE_PLATFORM_OPERATING_PROOF', 'PLATFORM_RUNTIME_GREEN',
  ]);
});

test('core control green cannot certify whole platform runtime',()=>{
  assert.equal(contract.termination.core_four_control_green_is_whole_platform_green,false);
  assert.equal(contract.termination.static_scorecard_pass_is_runtime_proof,false);
  assert.equal(contract.termination.whole_platform_green_requires_all_runtime_checks_and_value_chain_receipts,true);
});

test('natural Canonical refresh is exact-main, first-attempt, append-only and separate from manual recovery', () => {
  assert.match(apply, /^  push:\n    branches: \[main\]/m);
  assert.match(apply, /^  schedule:\n    - cron: '13,43 \* \* \* \*'/m);
  assert.match(apply, /issues:\s*write/);
  assert.match(apply, /github\.event_name == 'push'.*PROTECTED_MAIN_PUSH/);
  assert.match(writer, /\['workflow_dispatch','push','schedule'\]\.includes\(event\)/);
  assert.match(writer, /authority_type:'PROTECTED_MAIN_SCHEDULE'/);
  assert.match(writer, /attempt!==1/);
  assert.match(writer, /authority_type:'PROTECTED_MAIN_PUSH'/);
  assert.match(writer, /authority_type:'PROGRAM_OWNER_MANUAL_RECOVERY'/);
  assert.match(writer, /method:'POST'/);
  assert.doesNotMatch(writer, /method:'(?:PATCH|PUT|DELETE)'/);
});

test('post-landing evidence chain reaches Reserve, Sentinel and terminal Assurance without another approval', () => {
  assert.match(truth, /workflow_run:\n    workflows: \['KPMO Canonical Generation V3 Apply'\]/);
  assert.doesNotMatch(truth, /^  push:/m);
  assert.match(truth, /github\.event\.workflow_run\.head_sha/);
  assert.match(sentinelTrigger, /KPMO Live Canonical Issue Truth V1'.*events:\['workflow_run','workflow_dispatch'\]/);
  assert.equal(discovery.match(/coordination\/kidults\/product\/representative-anchor-input-manifest-v1\.json/g)?.length, 2);
  assert.match(reserve, /workflow_run:\n    workflows:\n      - 'KIDULTS ASI Global Any-Site Hourly Pooling v2'/);
  assert.match(assurance, /- 'KIDULTS ASI Sharded Source Reserve v1'/);
  assert.match(assurance, /- 'KPMO Live Canonical Issue Truth V1'/);
  assert.match(sentinel, /actions:\s*read/);
  assert.match(sentinel, /^  workflow_run:\n    workflows:\n      - 'KIDULTS ASI Requirement-to-Adapter Coverage v1'/m);
  assert.doesNotMatch(sentinel, /      - 'KIDULTS ASI Sharded Source Reserve v1'/m);
  assert.doesNotMatch(sentinel, /^  push:/m);
  assert.doesNotMatch(sentinel, /^  schedule:/m);
  assert.doesNotMatch(sentinel, /Run exact-SHA producer auto-convergence/);
  assert.doesNotMatch(sentinel, /Dispatch exact-main terminal Continuous Assurance/);
  assert.doesNotMatch(sentinel, /gh workflow run kidults-platform-continuous-assurance-v1\.yml/);
  assert.match(assurance, /- 'KIDULTS ASI Requirement-to-Adapter Coverage v1'/);
  assert.match(assurance, /- 'KIDULTS ASI Sharded Source Reserve v1'/);
});

test('automatic closure preserves the protected HOLD boundary', () => {
  assert.equal(contract.authority.append_only, true);
  assert.equal(contract.authority.fail_closed, true);
  assert.equal(contract.authority.promotion_eligible, false);
  assert.equal(contract.authority.production, 'HOLD');
  assert.equal(contract.authority.public, 'HOLD');
  assert.equal(contract.authority.g5, 'HOLD');
  assert.equal(contract.termination.sentinel_read_only, true);
  assert.equal(contract.termination.sentinel_actions_permission, 'read');
  assert.equal(contract.termination.sentinel_dispatches_producers, false);
  assert.equal(contract.termination.sentinel_dispatches_terminal_continuous_assurance, false);
  assert.equal(contract.termination.natural_exact_sha_producer_evidence_required, true);
  assert.equal(contract.termination.manual_dispatch_not_terminal_natural_proof, true);
  assert.equal(contract.termination.producer_mutation_recovery_separate_from_assurance, true);
  assert.equal(contract.termination.main_sha_drift_fails_closed, true);
});


test('PR lifecycle validators accept only the exact non-governed protected-main control status', () => {
  for (const script of [
    'scripts/kidults/kpmo/validate-pr-lifecycle-integrity-v1.mjs',
    'scripts/kidults/kpmo/run-pr-lifecycle-with-native-convergence-v1.mjs',
  ]) {
    const result = spawnSync(process.execPath, [script, '--self-test'], {encoding: 'utf8'});
    assert.equal(result.status, 0, `${script}: ${result.stderr || result.stdout}`);
    assert.match(result.stdout, /self-test: PASS/);
  }
});
