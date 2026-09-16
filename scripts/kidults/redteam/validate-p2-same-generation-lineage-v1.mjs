#!/usr/bin/env node
import fs from 'node:fs';

const workflowPath = '.github/workflows/kidults-asi-owned-source-intelligence-graph-v2.yml';
const p1WorkflowPath = '.github/workflows/kidults-asi-p1-source-preflight-v1.yml';
const text = fs.readFileSync(workflowPath, 'utf8');
const p1Text = fs.readFileSync(p1WorkflowPath, 'utf8');

const SHA = /^[0-9a-f]{40}$/;
const POSITIVE_INTEGER = /^[1-9][0-9]*$/;
const P1_WORKFLOW_NAME = 'KIDULTS ASI P1 Source Preflight v1';
const P1_WORKFLOW_PATH = '.github/workflows/kidults-asi-p1-source-preflight-v1.yml';

function requireCondition(condition, code) {
  if (!condition) throw new Error(code);
}

function validateAuthoritativeP1Trigger(event) {
  const run = event?.workflow_run;
  requireCondition(run && POSITIVE_INTEGER.test(String(run.id || '')), 'P2_P1_UPSTREAM_RUN_ID_INVALID');
  requireCondition(run.name === P1_WORKFLOW_NAME, 'P2_P1_UPSTREAM_NAME_INVALID');
  requireCondition(run.path === P1_WORKFLOW_PATH, 'P2_P1_UPSTREAM_PATH_INVALID');
  requireCondition(run.event === 'workflow_run', 'P2_P1_UPSTREAM_EVENT_NOT_WORKFLOW_RUN');
  requireCondition(run.head_branch === 'main', 'P2_P1_UPSTREAM_BRANCH_NOT_MAIN');
  requireCondition(SHA.test(run.head_sha || ''), 'P2_P1_UPSTREAM_SHA_INVALID');
  requireCondition(run.status === 'completed' && run.conclusion === 'success', 'P2_P1_UPSTREAM_NOT_SUCCESSFUL');
  return run;
}

const required = [
  'P1_SOURCE_SHA="$CURRENT_SHA"',
  'test "$P1_SOURCE_SHA" = "$CURRENT_SHA"',
  '.head_sha==$sha',
  'P1_EVENT_SOURCE_SHA" == "$CURRENT_SHA',
  'github.event_name',
  'github.event.workflow_run.id',
];
for (const marker of required) {
  if (!text.includes(marker)) {
    console.error(`missing exact-generation marker: ${marker}`);
    process.exit(2);
  }
}

const p1Required = [
  "if: github.event_name == 'workflow_run'",
  'P0B_INPUT_MODE=EXACT_TRIGGERING_WORKFLOW_RUN',
  "trigger_event:process.env.GITHUB_EVENT_NAME",
  "p0b_input_mode:process.env.P0B_INPUT_MODE",
  "p0b_origin_run_id:process.env.P0B_ORIGIN_RUN_ID||null",
  'P0B_ORIGIN_RUN_ID=$P0B_EVENT_RUN_ID',
];
for (const marker of p1Required) {
  if (!p1Text.includes(marker)) {
    console.error(`missing P1 transitive-provenance marker: ${marker}`);
    process.exit(3);
  }
}

const forbidden = [
  'git merge-base --is-' + 'ancestor "$P1_SOURCE_SHA" "$CURRENT_SHA"',
  '(.head_sha==$sha or (.head_sha | type=="string"))',
];
for (const marker of forbidden) {
  if (text.includes(marker)) {
    console.error(`forbidden ancestor-generation fallback: ${marker}`);
    process.exit(4);
  }
}

const concurrency = text.match(/concurrency:\n([\s\S]*?)\n\njobs:/)?.[1] ?? '';
if (!concurrency.includes('github.event_name') || !concurrency.includes('github.event.workflow_run.id')) {
  console.error('P2 concurrency is not isolated by trigger source/upstream run id');
  process.exit(5);
}

const validSynthetic = {
  workflow_run: {
    id: 101,
    name: P1_WORKFLOW_NAME,
    path: P1_WORKFLOW_PATH,
    event: 'workflow_run',
    head_branch: 'main',
    head_sha: '1'.repeat(40),
    status: 'completed',
    conclusion: 'success',
  },
};
validateAuthoritativeP1Trigger(validSynthetic);
for (const [name, mutate] of [
  ['schedule-origin', (x) => { x.workflow_run.event = 'schedule'; }],
  ['manual-origin', (x) => { x.workflow_run.event = 'workflow_dispatch'; }],
  ['push-origin', (x) => { x.workflow_run.event = 'push'; }],
  ['wrong-path', (x) => { x.workflow_run.path = '.github/workflows/other.yml'; }],
  ['wrong-branch', (x) => { x.workflow_run.head_branch = 'feature'; }],
  ['failed-upstream', (x) => { x.workflow_run.conclusion = 'failure'; }],
]) {
  const candidate = JSON.parse(JSON.stringify(validSynthetic));
  mutate(candidate);
  let rejected = false;
  try { validateAuthoritativeP1Trigger(candidate); } catch { rejected = true; }
  requireCondition(rejected, `P2_TRANSITIVE_P1_NEGATIVE_ESCAPED:${name}`);
}

if (process.env.GITHUB_ACTIONS === 'true') {
  if (process.env.GITHUB_EVENT_NAME === 'workflow_run') {
    requireCondition(Boolean(process.env.GITHUB_EVENT_PATH), 'P2_GITHUB_EVENT_PATH_MISSING');
    const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
    validateAuthoritativeP1Trigger(event);
  } else if (process.env.GITHUB_EVENT_NAME === 'workflow_dispatch') {
    throw new Error('P2_DIRECT_DISPATCH_NONAUTHORITATIVE');
  }
}

console.log(JSON.stringify({
  id: 'kidults-p2-same-generation-lineage-validation-v1',
  state: 'VERIFIED_PASS',
  exact_current_generation_required: true,
  ancestor_generation_fallback_allowed: false,
  trigger_scoped_concurrency_required: true,
  authoritative_p1_origin_event_required: 'workflow_run',
  local_rebuild_p1_authoritative_consumption_allowed: false,
  direct_p2_dispatch_authoritative_publication_allowed: false,
  negative_cases: 6,
  production: 'HOLD',
  public_release: 'HOLD',
  g5: 'HOLD',
}, null, 2));
