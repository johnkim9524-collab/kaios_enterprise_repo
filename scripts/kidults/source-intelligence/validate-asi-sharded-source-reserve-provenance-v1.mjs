#!/usr/bin/env node
import fs from 'node:fs';

const workflowPath = '.github/workflows/kidults-asi-sharded-source-reserve-v1.yml';
const expectedShaBinding = "EXPECTED_SHA: ${{ github.event.pull_request.head.sha || github.sha }}";
const exactUpstreamBinding = 'test "$UPSTREAM_HEAD_SHA" = "$EXPECTED_SHA"';

function failuresFor(text) {
  const failures = [];
  const required = [
    "github.event_name == 'workflow_run' && github.event.workflow_run.id || github.ref",
    expectedShaBinding,
    "UPSTREAM_RUN_ID: ${{ github.event.workflow_run.id || '' }}",
    "UPSTREAM_HEAD_SHA: ${{ github.event.workflow_run.head_sha || '' }}",
    "UPSTREAM_HEAD_BRANCH: ${{ github.event.workflow_run.head_branch || '' }}",
    "UPSTREAM_REPOSITORY: ${{ github.event.workflow_run.repository.full_name || '' }}",
    "PR_BASE_SHA: ${{ github.event.pull_request.base.sha || '' }}",
    'test "$UPSTREAM_REPOSITORY" = "$GITHUB_REPOSITORY"',
    'test "$UPSTREAM_HEAD_BRANCH" = "main"',
    exactUpstreamBinding,
    '/actions/runs/${run_id}/artifacts?per_page=100',
    'expected exactly one producer-bound v2 discovery artifact',
    'kidults-asi-global-any-site-hourly-cycle-v2',
    '.path==".github/workflows/kidults-asi-global-any-site-hourly-pooling-v2.yml"',
    'TARGET_SHA="$PR_BASE_SHA"',
    'no successful v2 discovery producer exists on exact target SHA',
    'KIDULTS_RESERVE_DISCOVERY_RUN_ID=',
    'KIDULTS_RESERVE_DISCOVERY_HEAD_SHA=',
    'exact_generation_bound:true'
  ];
  for (const marker of required) {
    if (!text.includes(marker)) failures.push(`missing provenance marker: ${marker}`);
  }

  const expectedShaBindingCount = text.split(expectedShaBinding).length - 1;
  if (expectedShaBindingCount < 2) {
    failures.push(`trusted EXPECTED_SHA binding must cover both jobs; observed ${expectedShaBindingCount}`);
  }

  const workflowRunBlock = text.match(/if \[ "\$GITHUB_EVENT_NAME" = "workflow_run" \]; then([\s\S]*?)else/);
  if (!workflowRunBlock) {
    failures.push('workflow_run producer-binding block missing');
  } else {
    const block = workflowRunBlock[1];
    for (const marker of [
      'DISCOVERY_RUN_ID="$UPSTREAM_RUN_ID"',
      'test "$UPSTREAM_REPOSITORY" = "$GITHUB_REPOSITORY"',
      'test "$UPSTREAM_HEAD_BRANCH" = "main"',
      exactUpstreamBinding
    ]) {
      if (!block.includes(marker)) failures.push(`workflow_run exact binding missing: ${marker}`);
    }
  }

  const scopedArtifactCall = text.match(/exact_discovery_artifact\(\)[\s\S]*?\/actions\/runs\/\$\{run_id\}\/artifacts\?per_page=100[\s\S]*?^\s*\}/m);
  if (!scopedArtifactCall) failures.push('run-scoped discovery artifact lookup missing');

  if (/DISCOVERY_ID=.*find_main_artifact/.test(text)) {
    failures.push('repository-global discovery artifact selection reintroduced');
  }

  for (const marker of [
    'mapfile -t PREV_CANDIDATES',
    'PREV_RUN_ID="$CANDIDATE_RUN_ID"',
    'if [ "$PREV_COUNT" -gt 1 ]; then',
    'if [ "$PREV_COUNT" -eq 1 ]; then'
  ]) {
    if (!text.includes(marker)) failures.push(`previous reserve exact-artifact selection missing: ${marker}`);
  }

  return failures;
}

const current = fs.readFileSync(workflowPath, 'utf8');
const failures = failuresFor(current);
if (failures.length) {
  console.error('Sharded Source Reserve provenance validation: FAIL');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const mutations = [
  [
    '/actions/runs/${run_id}/artifacts?per_page=100',
    '/actions/artifacts?per_page=100',
    'repository-global artifact lookup'
  ],
  [
    exactUpstreamBinding,
    'test -n "$UPSTREAM_HEAD_SHA"',
    'exact upstream SHA binding'
  ],
  [
    expectedShaBinding,
    "EXPECTED_SHA: ${{ github.event.workflow_run.head_sha || github.sha }}",
    'trusted execution SHA source binding'
  ],
  [
    'TARGET_SHA="$PR_BASE_SHA"',
    'TARGET_SHA="$GITHUB_SHA"',
    'pull request base-generation compatibility binding'
  ],
  [
    "github.event_name == 'workflow_run' && github.event.workflow_run.id || github.ref",
    'github.ref',
    'workflow_run concurrency isolation'
  ],
  [
    'expected exactly one producer-bound v2 discovery artifact',
    'producer-bound v2 discovery artifact',
    'artifact exact cardinality'
  ],
  [
    '.path==".github/workflows/kidults-asi-global-any-site-hourly-pooling-v2.yml"',
    'true',
    'producer workflow-path binding'
  ],
  [
    'if [ "$PREV_COUNT" -eq 1 ]; then',
    'if [ "$PREV_COUNT" -ge 0 ]; then',
    'previous reserve exact-artifact eligibility'
  ]
];

for (const [from, to, label] of mutations) {
  if (!current.includes(from)) {
    console.error(`Sharded Source Reserve provenance self-test fixture missing: ${label}`);
    process.exit(2);
  }
  const mutated = current.replaceAll(from, to);
  if (failuresFor(mutated).length === 0) {
    console.error(`Sharded Source Reserve provenance self-test failed to reject: ${label}`);
    process.exit(3);
  }
}

console.log(JSON.stringify({
  status: 'PASS',
  control: 'SHARDED_SOURCE_RESERVE_EXACT_PRODUCER_PROVENANCE',
  workflow_run_exact_upstream_id: true,
  exact_head_sha: true,
  exact_head_binding_symbol: 'EXPECTED_SHA',
  exact_artifact_cardinality: true,
  producer_workflow_path_bound: true,
  concurrency_isolated_by_upstream_run: true,
  previous_reserve_bound_to_successful_run: true,
  public_release: 'HOLD',
  production: 'HOLD'
}));
