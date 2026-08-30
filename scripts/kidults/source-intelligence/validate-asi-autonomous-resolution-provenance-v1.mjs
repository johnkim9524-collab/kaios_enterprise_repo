#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  P1RuntimeLineageValidationError,
  validateP1RuntimeLineageSnapshot
} from './validate-asi-p1-runtime-lineage-v1.mjs';

const workflowPath = '.github/workflows/kidults-asi-autonomous-resolution-layer-v1.yml';
const builderPath = 'scripts/kidults/source-intelligence/build-asi-autonomous-resolution-layer-v1.mjs';

function failuresFor(workflowSource, builderSource) {
  const failures = [];
  const required = [
    "run-name: KIDULTS ARL / ${{ github.event_name == 'workflow_run' && format('p1-{0}', github.event.workflow_run.id) || format('recovery-{0}', github.sha) }}",
    "group: kidults-asi-autonomous-resolution-layer-v1-${{ github.event_name == 'workflow_run' && github.event.workflow_run.id || github.sha }}",
    'cancel-in-progress: false',
    'request-p1-recovery:',
    "if: github.event_name == 'workflow_dispatch' || github.event_name == 'schedule'",
    "artifact_role:'RECOVERY_NON_CONSUMABLE'",
    'authoritative_producer:false',
    'downstream_consumable:false',
    'canonical_artifact_published:false',
    "resolve-current-p1-actions:\n    if: github.event_name == 'workflow_run' && github.event.workflow_run.conclusion == 'success'",
    'UPSTREAM_RUN_ID: ${{ github.event.workflow_run.id }}',
    'UPSTREAM_HEAD_SHA: ${{ github.event.workflow_run.head_sha }}',
    "test \"$UPSTREAM_PATH\" = '.github/workflows/kidults-asi-p1-source-preflight-v1.yml'",
    '/actions/runs/${P1_RUN_ID}',
    '/actions/runs/${P1_RUN_ID}/artifacts?per_page=100',
    'test \"$P1_ARTIFACT_COUNT\" = 1',
    'artifact.workflow_run?.id===Number(process.env.P1_RUN_ID)',
    'artifact.workflow_run?.head_sha===process.env.P1_SOURCE_SHA',
    'artifact_digest:process.env.P1_DIGEST',
    'exact_generation_bound:true',
    "exact_triggering_run_bound:process.env.GITHUB_EVENT_NAME==='workflow_run'",
    'validation_only:process.env.P1_VALIDATION_ONLY',
    'promotion_authority:false',
    'artifact_cardinality:1',
    'Claim single authoritative producer for exact P1 generation',
    'ARL_AUTHORITATIVE_PRODUCER_DUPLICATE',
    "artifact_role:'AUTHORITATIVE_CONSUMABLE'",
    'authoritative_producer:true',
    'downstream_consumable:true',
    'authoritative_generation_key:generationKey'
  ];
  for (const marker of required) {
    if (!workflowSource.includes(marker)) failures.push(`missing provenance marker: ${marker}`);
  }

  const builderRequired = [
    "import { validateP1RuntimeLineageFromEnvironment } from './validate-asi-p1-runtime-lineage-v1.mjs';",
    "process.env.GITHUB_ACTIONS === 'true'",
    'await validateP1RuntimeLineageFromEnvironment({',
    "expandedRoot: '/tmp/p1-expanded'",
    'expectedSourceSha: process.env.GITHUB_SHA'
  ];
  for (const marker of builderRequired) {
    if (!builderSource.includes(marker)) failures.push(`missing runtime-lineage marker: ${marker}`);
  }

  const forbidden = [
    'git merge-base --is-ancestor',
    'source_sha_ancestor_of_consumer:true',
    '/actions/artifacts?per_page=100',
    'group: kidults-asi-autonomous-resolution-layer-v1-${{ github.ref }}',
    "resolve-current-p1-actions:\n    if: github.event_name == 'workflow_dispatch'",
    "artifact_role:'RECOVERY_NON_CONSUMABLE',authoritative_producer:true"
  ];
  for (const marker of forbidden) {
    if (workflowSource.includes(marker)) failures.push(`forbidden provenance marker: ${marker}`);
  }
  if (builderSource.includes('KIDULTS_ARL_RUNTIME_LINEAGE_MODE')) {
    failures.push('forbidden runtime-lineage bypass marker: KIDULTS_ARL_RUNTIME_LINEAGE_MODE');
  }
  return failures;
}

const workflowSource = fs.readFileSync(workflowPath, 'utf8');
const builderSource = fs.readFileSync(builderPath, 'utf8');
const failures = failuresFor(workflowSource, builderSource);
if (failures.length) {
  console.error('Autonomous Resolution provenance validation: FAIL');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const workflowMutations = [
  ['/actions/runs/${P1_RUN_ID}/artifacts?per_page=100', '/actions/artifacts?per_page=100', 'repository-global artifact lookup'],
  ['test "$P1_ARTIFACT_COUNT" = 1', 'test -n "$P1_ARTIFACT_COUNT"', 'artifact exact cardinality'],
  ["test \"$UPSTREAM_PATH\" = '.github/workflows/kidults-asi-p1-source-preflight-v1.yml'", 'test -n "$UPSTREAM_PATH"', 'producer workflow identity'],
  ["github.event_name == 'workflow_run' && github.event.workflow_run.id || github.sha", 'github.sha', 'workflow_run generation leadership'],
  ['artifact.workflow_run?.head_sha===process.env.P1_SOURCE_SHA', 'true', 'artifact source SHA binding'],
  ["artifact_role:'RECOVERY_NON_CONSUMABLE'", "artifact_role:'AUTHORITATIVE_CONSUMABLE'", 'recovery artifact non-consumability'],
  ["resolve-current-p1-actions:\n    if: github.event_name == 'workflow_run' && github.event.workflow_run.conclusion == 'success'", "resolve-current-p1-actions:\n    if: github.event_name == 'workflow_dispatch'", 'canonical producer event boundary'],
  ['ARL_AUTHORITATIVE_PRODUCER_DUPLICATE', 'ARL_DUPLICATE_IGNORED', 'duplicate producer rejection']
];
for (const [from, to, label] of workflowMutations) {
  if (!workflowSource.includes(from)) {
    console.error(`Autonomous Resolution provenance self-test fixture missing: ${label}`);
    process.exit(2);
  }
  if (failuresFor(workflowSource.replace(from, to), builderSource).length === 0) {
    console.error(`Autonomous Resolution provenance self-test failed to reject: ${label}`);
    process.exit(3);
  }
}

const builderMutations = [
  ['await validateP1RuntimeLineageFromEnvironment({', 'void ({', 'runtime lineage invocation'],
  ["process.env.GITHUB_ACTIONS === 'true'", "process.env.GITHUB_ACTIONS === 'false'", 'GitHub Actions fail-closed guard'],
  ["expandedRoot: '/tmp/p1-expanded'", "expandedRoot: '/tmp/nonexistent'", 'exact expanded artifact root']
];
for (const [from, to, label] of builderMutations) {
  if (!builderSource.includes(from)) {
    console.error(`Autonomous Resolution runtime-lineage fixture missing: ${label}`);
    process.exit(4);
  }
  if (failuresFor(workflowSource, builderSource.replace(from, to)).length === 0) {
    console.error(`Autonomous Resolution runtime-lineage self-test failed to reject: ${label}`);
    process.exit(5);
  }
}

const sha = 'a'.repeat(40);
const goodEvent = {
  workflow_run: {
    id: 202,
    event: 'workflow_run',
    name: 'KIDULTS ASI P1 Source Preflight v1',
    path: '.github/workflows/kidults-asi-p1-source-preflight-v1.yml',
    head_branch: 'main',
    head_sha: sha,
    status: 'completed',
    conclusion: 'success'
  }
};
const goodReceipt = {
  id: 'kidults-asi-p1-source-preflight-receipt-v1',
  state: 'VERIFIED_PASS',
  source_sha: sha,
  trigger_event: 'workflow_run',
  p0b_input_mode: 'EXACT_TRIGGERING_WORKFLOW_RUN',
  p0b_origin_run_id: 101,
  p0b_origin_source_sha: sha,
  public_release: 'HOLD',
  production: 'HOLD'
};
assert.equal(validateP1RuntimeLineageSnapshot({
  eventName: 'workflow_run', eventPayload: goodEvent, receipt: goodReceipt, expectedSourceSha: sha
}).state, 'COMPLETE_VERIFIED');
for (const mutation of [
  {eventPayload: {...goodEvent, workflow_run: {...goodEvent.workflow_run, event: 'workflow_dispatch'}}, receipt: goodReceipt},
  {eventPayload: goodEvent, receipt: {...goodReceipt, p0b_input_mode: 'REBUILT_LOCAL_CONTROL'}},
  {eventPayload: goodEvent, receipt: {...goodReceipt, p0b_origin_run_id: 202}},
  {eventPayload: goodEvent, receipt: {...goodReceipt, p0b_origin_source_sha: 'b'.repeat(40)}}
]) {
  assert.throws(() => validateP1RuntimeLineageSnapshot({
    eventName: 'workflow_run',
    eventPayload: mutation.eventPayload,
    receipt: mutation.receipt,
    expectedSourceSha: sha
  }), P1RuntimeLineageValidationError);
}

console.log(JSON.stringify({
  state: 'VERIFIED_PASS',
  control: 'AUTONOMOUS_RESOLUTION_EXACT_PRODUCER_PROVENANCE',
  workflow_run_exact_upstream_id: true,
  exact_head_sha: true,
  exact_artifact_cardinality: true,
  producer_workflow_path_bound: true,
  recovery_artifact_non_consumable: true,
  canonical_producer_event: 'workflow_run',
  exact_generation_leader_serialized: true,
  duplicate_authoritative_producer_rejected: true,
  transitive_p0b_to_p1_to_arl_runtime_lineage: true,
  manual_schedule_push_p1_artifacts_rejected: true,
  ancestor_fallback: false,
  validation_only_non_promotable: true,
  public_release: 'HOLD',
  production: 'HOLD'
}, null, 2));
