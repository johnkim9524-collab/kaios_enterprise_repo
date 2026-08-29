#!/usr/bin/env node
import fs from 'node:fs';

const workflowPath = '.github/workflows/kidults-asi-autonomous-resolution-layer-v1.yml';

function failuresFor(source) {
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
    if (!source.includes(marker)) failures.push(`missing provenance marker: ${marker}`);
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
    if (source.includes(marker)) failures.push(`forbidden provenance marker: ${marker}`);
  }

  return failures;
}

const source = fs.readFileSync(workflowPath, 'utf8');
const failures = failuresFor(source);
if (failures.length) {
  console.error('Autonomous Resolution provenance validation: FAIL');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const mutations = [
  ['/actions/runs/${P1_RUN_ID}/artifacts?per_page=100', '/actions/artifacts?per_page=100', 'repository-global artifact lookup'],
  ['test "$P1_ARTIFACT_COUNT" = 1', 'test -n "$P1_ARTIFACT_COUNT"', 'artifact exact cardinality'],
  ["test \"$UPSTREAM_PATH\" = '.github/workflows/kidults-asi-p1-source-preflight-v1.yml'", 'test -n "$UPSTREAM_PATH"', 'producer workflow identity'],
  ["github.event_name == 'workflow_run' && github.event.workflow_run.id || github.sha", 'github.sha', 'workflow_run generation leadership'],
  ['artifact.workflow_run?.head_sha===process.env.P1_SOURCE_SHA', 'true', 'artifact source SHA binding'],
  ["artifact_role:'RECOVERY_NON_CONSUMABLE'", "artifact_role:'AUTHORITATIVE_CONSUMABLE'", 'recovery artifact non-consumability'],
  ["resolve-current-p1-actions:\n    if: github.event_name == 'workflow_run' && github.event.workflow_run.conclusion == 'success'", "resolve-current-p1-actions:\n    if: github.event_name == 'workflow_dispatch'", 'canonical producer event boundary'],
  ['ARL_AUTHORITATIVE_PRODUCER_DUPLICATE', 'ARL_DUPLICATE_IGNORED', 'duplicate producer rejection']
];

for (const [from, to, label] of mutations) {
  if (!source.includes(from)) {
    console.error(`Autonomous Resolution provenance self-test fixture missing: ${label}`);
    process.exit(2);
  }
  if (failuresFor(source.replace(from, to)).length === 0) {
    console.error(`Autonomous Resolution provenance self-test failed to reject: ${label}`);
    process.exit(3);
  }
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
  ancestor_fallback: false,
  validation_only_non_promotable: true,
  public_release: 'HOLD',
  production: 'HOLD'
}, null, 2));
