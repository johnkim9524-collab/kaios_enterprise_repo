#!/usr/bin/env node
import fs from 'node:fs';

const workflowPath = '.github/workflows/kidults-platform-continuous-assurance-v1.yml';
const text = fs.readFileSync(workflowPath, 'utf8');
const fail = (message) => { throw new Error(message); };

function countMatches(source, regex) {
  return [...source.matchAll(regex)].length;
}

function extractShadowStep(source) {
  const startMarker = '      - name: Validate exact ASI SHADOW upstream evidence binding\n';
  const start = source.indexOf(startMarker);
  if (start < 0) fail('SHADOW_BINDING_STEP_MISSING');
  const next = source.indexOf('\n      - name:', start + startMarker.length);
  return source.slice(start, next < 0 ? source.length : next);
}

function validate(source) {
  const watch = "      - 'KIDULTS ASI SHADOW Operating Evidence v1'";
  if (countMatches(source, new RegExp(watch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) !== 1) {
    fail('SHADOW_WATCH_CARDINALITY_NOT_ONE');
  }

  const block = extractShadowStep(source);
  const required = [
    "if: env.KPMO_EXECUTE_FULL_AUDIT == 'true' && github.event_name == 'workflow_run' && github.event.workflow_run.name == 'KIDULTS ASI SHADOW Operating Evidence v1'",
    'GH_TOKEN: ${{ github.token }}',
    'SHADOW_UPSTREAM_RUN_ID: ${{ github.event.workflow_run.id }}',
    'SHADOW_UPSTREAM_SHA: ${{ github.event.workflow_run.head_sha }}',
    'SHADOW_UPSTREAM_EVENT: ${{ github.event.workflow_run.event }}',
    'SHADOW_UPSTREAM_CONCLUSION: ${{ github.event.workflow_run.conclusion }}',
    '[[ "$SHADOW_UPSTREAM_EVENT" =~ ^(schedule|push|workflow_dispatch)$ ]]',
    'test "$SHADOW_UPSTREAM_CONCLUSION" = "success"',
    '/actions/runs/${SHADOW_UPSTREAM_RUN_ID}',
    '.name=="KIDULTS ASI SHADOW Operating Evidence v1"',
    '.path==".github/workflows/kidults-asi-shadow-operating-evidence-v1.yml"',
    '.repository.full_name==$repo',
    '.head_branch=="main"',
    'and .head_sha==$sha',
    '--arg event "$SHADOW_UPSTREAM_EVENT"',
    'and .event==$event',
    '.status=="completed"',
    '.conclusion=="success"',
    '/actions/runs/${SHADOW_UPSTREAM_RUN_ID}/artifacts?per_page=100',
    'SHADOW_ARTIFACT_COUNT=$(jq',
    'test "$SHADOW_ARTIFACT_COUNT" -eq 1',
    '.name=="kidults-asi-shadow-operating-evidence-v1"',
    '[[ "$SHADOW_ARTIFACT_DIGEST" =~ ^sha256:[0-9a-fA-F]{64}$ ]]'
  ];
  for (const marker of required) {
    if (!block.includes(marker)) fail(`MISSING_IN_SHADOW_BINDING:${marker}`);
  }

  if (block.includes('and .event=="workflow_run"')) {
    fail('HARDCODED_CONSUMER_EVENT_FORBIDDEN');
  }

  const eventArgBindingCount = countMatches(block, /--arg event "\$SHADOW_UPSTREAM_EVENT"/g);
  if (eventArgBindingCount !== 2) fail(`SHADOW_EVENT_ARG_BINDING_CARDINALITY:${eventArgBindingCount}`);

  const runHeadIndex = block.indexOf('and .head_sha==$sha');
  const eventBindingIndex = block.indexOf('and .event==$event', runHeadIndex + 1);
  const runStatusIndex = block.indexOf('and .status=="completed"', eventBindingIndex + 1);
  if (runHeadIndex < 0 || eventBindingIndex <= runHeadIndex || runStatusIndex <= eventBindingIndex) {
    fail('RUN_LEVEL_SHA_EVENT_STATUS_BINDING_MISSING');
  }

  const runBindingCount = countMatches(block, /\.workflow_run\.id==\$run/g);
  const shaBindingCount = countMatches(block, /\.workflow_run\.head_sha==\$sha/g);
  const pairedBindingCount = countMatches(block, /\.workflow_run\.id==\$run[^\n]*\.workflow_run\.head_sha==\$sha/g);
  if (runBindingCount !== 3) fail(`ARTIFACT_RUN_BINDING_CARDINALITY:${runBindingCount}`);
  if (shaBindingCount !== 3) fail(`ARTIFACT_SHA_BINDING_CARDINALITY:${shaBindingCount}`);
  if (pairedBindingCount !== 3) fail(`ARTIFACT_RUN_SHA_PAIR_CARDINALITY:${pairedBindingCount}`);

  const jobHeader = source.match(/^  audit:\n([\s\S]*?)^    concurrency:/m)?.[1] || '';
  if (/workflow_run\.conclusion\s*==\s*['\"]success['\"]/.test(jobHeader)) {
    fail('SUCCESS_ONLY_JOB_FILTER_FORBIDDEN');
  }
  return true;
}

validate(text);

const mutations = [
  ["      - 'KIDULTS ASI SHADOW Operating Evidence v1'\n", ''],
  ['GH_TOKEN: ${{ github.token }}\n', ''],
  ['SHADOW_UPSTREAM_EVENT: ${{ github.event.workflow_run.event }}\n', ''],
  ['[[ "$SHADOW_UPSTREAM_EVENT" =~ ^(schedule|push|workflow_dispatch)$ ]]', '[[ "$SHADOW_UPSTREAM_EVENT" =~ ^(schedule|push|workflow_dispatch|pull_request|workflow_run)$ ]]'],
  ['test "$SHADOW_UPSTREAM_CONCLUSION" = "success"', 'test -n "$SHADOW_UPSTREAM_CONCLUSION"'],
  ['.path==".github/workflows/kidults-asi-shadow-operating-evidence-v1.yml"', '.path!=".github/workflows/kidults-asi-shadow-operating-evidence-v1.yml"'],
  ['and .head_sha==$sha', 'and .head_sha!=$sha'],
  ['--arg event "$SHADOW_UPSTREAM_EVENT"', '--arg event "workflow_run"'],
  ['and .event==$event', 'and .event=="workflow_run"'],
  ['test "$SHADOW_ARTIFACT_COUNT" -eq 1', 'test "$SHADOW_ARTIFACT_COUNT" -ge 1'],
  ['.workflow_run.id==$run', '.workflow_run.id!=$run'],
  ['.workflow_run.head_sha==$sha', '.workflow_run.head_sha!=$sha'],
  ['[[ "$SHADOW_ARTIFACT_DIGEST" =~ ^sha256:[0-9a-fA-F]{64}$ ]]', '[[ "$SHADOW_ARTIFACT_DIGEST" =~ ^md5: ]]']
];

for (const [from, to] of mutations) {
  const block = extractShadowStep(text);
  if (!block.includes(from) && !text.includes(from)) fail(`SELF_TEST_SOURCE_MARKER_MISSING:${from}`);
  const mutated = block.includes(from)
    ? text.replace(block, block.replace(from, to))
    : text.replace(from, to);
  let rejected = false;
  try { validate(mutated); } catch { rejected = true; }
  if (!rejected) fail(`NEGATIVE_MUTATION_NOT_REJECTED:${from}`);
}

const successOnlyMutation = text.replaceAll(
  "(github.event_name != 'workflow_run' ||\n       (github.event.workflow_run.repository.full_name == github.repository &&",
  "(github.event_name != 'workflow_run' ||\n       (github.event.workflow_run.conclusion == 'success' &&\n        github.event.workflow_run.repository.full_name == github.repository &&"
);
if (successOnlyMutation === text) fail('SELF_TEST_SOURCE_MARKER_MISSING:SUCCESS_ONLY_JOB_FILTER');
let successOnlyRejected = false;
try { validate(successOnlyMutation); } catch { successOnlyRejected = true; }
if (!successOnlyRejected) fail('NEGATIVE_MUTATION_NOT_REJECTED:SUCCESS_ONLY_JOB_FILTER');

console.log(JSON.stringify({
  suite: 'KIDULTS_CONTINUOUS_ASSURANCE_SHADOW_EVIDENCE_WATCH_V1',
  result: 'VERIFIED_PASS',
  watch_required: true,
  exact_upstream_run_binding: true,
  exact_upstream_event_binding: true,
  upstream_event_binding_occurrences: 2,
  allowed_producer_events: ['schedule', 'push', 'workflow_dispatch'],
  exact_artifact_cardinality: 1,
  artifact_run_sha_binding_occurrences: pairedBindingCountForReceipt(),
  provider_digest_required: true,
  github_cli_token_explicit: true,
  failed_cancelled_observation_preserved: true,
  requirement_validation_delegated_to: 'validate-requirement-assurance-watch-v1.mjs',
  mutations_rejected: mutations.length + 1,
  production: 'HOLD',
  public: 'HOLD',
  g5: 'EXPLICIT_APPROVAL_REQUIRED'
}, null, 2));

function pairedBindingCountForReceipt() {
  return countMatches(extractShadowStep(text), /\.workflow_run\.id==\$run[^\n]*\.workflow_run\.head_sha==\$sha/g);
}
