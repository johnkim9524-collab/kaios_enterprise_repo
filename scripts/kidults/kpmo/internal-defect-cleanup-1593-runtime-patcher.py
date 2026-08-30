#!/usr/bin/env python3
from pathlib import Path

BUILDER = Path('scripts/kidults/source-intelligence/build-asi-autonomous-resolution-layer-v1.mjs')
PROVENANCE = Path('scripts/kidults/source-intelligence/validate-asi-autonomous-resolution-provenance-v1.mjs')
RUNTIME = Path('scripts/kidults/source-intelligence/validate-asi-p1-runtime-lineage-v1.mjs')
TEST = Path('tests/kidults/source-intelligence/asi-p1-runtime-lineage-v1.test.mjs')

RUNTIME_SOURCE = r'''#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const SHA_RE = /^[0-9a-f]{40}$/;
const P1_WORKFLOW_NAME = 'KIDULTS ASI P1 Source Preflight v1';
const P1_WORKFLOW_PATH = '.github/workflows/kidults-asi-p1-source-preflight-v1.yml';
const P1_RECEIPT_NAME = 'kidults-asi-p1-source-preflight-receipt-v1.json';

export class P1RuntimeLineageValidationError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'P1RuntimeLineageValidationError';
    this.code = code;
  }
}

function fail(code, detail = '') {
  throw new P1RuntimeLineageValidationError(code, detail);
}

function requireCondition(condition, code, detail = '') {
  if (!condition) fail(code, detail);
}

function positiveInteger(value, code) {
  const parsed = Number(value);
  requireCondition(Number.isSafeInteger(parsed) && parsed > 0, code);
  return parsed;
}

export function validateP1RuntimeLineageSnapshot({
  eventName,
  eventPayload,
  receipt,
  expectedSourceSha
}) {
  requireCondition(eventName === 'workflow_run', 'ARL_EVENT_NOT_WORKFLOW_RUN');
  requireCondition(SHA_RE.test(String(expectedSourceSha || '')), 'ARL_EXPECTED_SOURCE_SHA_INVALID');
  requireCondition(eventPayload && typeof eventPayload === 'object', 'ARL_EVENT_PAYLOAD_REQUIRED');
  const upstream = eventPayload.workflow_run;
  requireCondition(upstream && typeof upstream === 'object', 'ARL_UPSTREAM_WORKFLOW_RUN_REQUIRED');
  const p1RunId = positiveInteger(upstream.id, 'ARL_P1_RUN_ID_INVALID');
  requireCondition(upstream.event === 'workflow_run', 'ARL_P1_UPSTREAM_EVENT_NOT_WORKFLOW_RUN');
  requireCondition(upstream.name === P1_WORKFLOW_NAME, 'ARL_P1_WORKFLOW_NAME_MISMATCH');
  requireCondition(upstream.path === P1_WORKFLOW_PATH, 'ARL_P1_WORKFLOW_PATH_MISMATCH');
  requireCondition(upstream.head_branch === 'main', 'ARL_P1_HEAD_BRANCH_NOT_MAIN');
  requireCondition(upstream.head_sha === expectedSourceSha, 'ARL_P1_HEAD_SHA_MISMATCH');
  requireCondition(upstream.status === 'completed', 'ARL_P1_STATUS_NOT_COMPLETED');
  requireCondition(upstream.conclusion === 'success', 'ARL_P1_CONCLUSION_NOT_SUCCESS');

  requireCondition(receipt && typeof receipt === 'object' && !Array.isArray(receipt), 'ARL_P1_RECEIPT_REQUIRED');
  requireCondition(receipt.id === 'kidults-asi-p1-source-preflight-receipt-v1', 'ARL_P1_RECEIPT_ID_MISMATCH');
  requireCondition(receipt.state === 'VERIFIED_PASS', 'ARL_P1_RECEIPT_STATE_NOT_VERIFIED_PASS');
  requireCondition(receipt.source_sha === expectedSourceSha, 'ARL_P1_RECEIPT_SOURCE_SHA_MISMATCH');
  requireCondition(receipt.trigger_event === 'workflow_run', 'ARL_P1_RECEIPT_TRIGGER_NOT_WORKFLOW_RUN');
  requireCondition(receipt.p0b_input_mode === 'EXACT_TRIGGERING_WORKFLOW_RUN', 'ARL_P0B_INPUT_MODE_NOT_EXACT');
  const p0bRunId = positiveInteger(receipt.p0b_origin_run_id, 'ARL_P0B_ORIGIN_RUN_ID_INVALID');
  requireCondition(p0bRunId !== p1RunId, 'ARL_P0B_ORIGIN_SELF_REFERENCE');
  requireCondition(receipt.p0b_origin_source_sha === expectedSourceSha, 'ARL_P0B_ORIGIN_SOURCE_SHA_MISMATCH');
  requireCondition(receipt.public_release === 'HOLD', 'ARL_P1_PUBLIC_RELEASE_NOT_HOLD');
  requireCondition(receipt.production === 'HOLD', 'ARL_P1_PRODUCTION_NOT_HOLD');

  const authorityFields = [
    receipt.artifact_role,
    receipt.authoritative_producer,
    receipt.downstream_consumable
  ];
  if (authorityFields.some((value) => value !== undefined)) {
    requireCondition(receipt.artifact_role === 'AUTHORITATIVE_P1_PRODUCER', 'ARL_P1_ARTIFACT_ROLE_NOT_AUTHORITATIVE');
    requireCondition(receipt.authoritative_producer === true, 'ARL_P1_AUTHORITATIVE_PRODUCER_FALSE');
    requireCondition(receipt.downstream_consumable === true, 'ARL_P1_DOWNSTREAM_CONSUMABLE_FALSE');
  }

  return {
    id: 'kidults-asi-p1-runtime-lineage-validation-v1',
    state: 'COMPLETE_VERIFIED',
    p1_workflow_run_id: p1RunId,
    p1_source_sha: expectedSourceSha,
    p1_upstream_event: upstream.event,
    p0b_origin_run_id: p0bRunId,
    p0b_origin_source_sha: receipt.p0b_origin_source_sha,
    p0b_input_mode: receipt.p0b_input_mode,
    artifact_role: 'AUTHORITATIVE_ARL_INPUT',
    authoritative_producer: true,
    downstream_consumable: true,
    candidate_created: false,
    evidence_created: false,
    public_release: 'HOLD',
    production: 'HOLD',
    g5: 'HOLD'
  };
}

function findNamedFiles(root, targetName) {
  const matches = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && entry.name === targetName) matches.push(full);
    }
  }
  return matches.sort();
}

export function validateP1RuntimeLineageFromEnvironment({
  eventName = process.env.GITHUB_EVENT_NAME,
  eventPath = process.env.GITHUB_EVENT_PATH,
  expandedRoot = '/tmp/p1-expanded',
  expectedSourceSha = process.env.GITHUB_SHA
} = {}) {
  requireCondition(Boolean(eventPath) && fs.existsSync(eventPath), 'ARL_EVENT_PATH_MISSING');
  requireCondition(fs.existsSync(expandedRoot) && fs.statSync(expandedRoot).isDirectory(), 'ARL_P1_EXPANDED_ROOT_MISSING');
  const receiptPaths = findNamedFiles(expandedRoot, P1_RECEIPT_NAME);
  requireCondition(receiptPaths.length === 1, 'ARL_P1_RECEIPT_CARDINALITY_NOT_ONE', String(receiptPaths.length));
  const eventPayload = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
  const receipt = JSON.parse(fs.readFileSync(receiptPaths[0], 'utf8'));
  return validateP1RuntimeLineageSnapshot({ eventName, eventPayload, receipt, expectedSourceSha });
}
'''

TEST_SOURCE = r'''#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  P1RuntimeLineageValidationError,
  validateP1RuntimeLineageFromEnvironment,
  validateP1RuntimeLineageSnapshot
} from '../../../scripts/kidults/source-intelligence/validate-asi-p1-runtime-lineage-v1.mjs';

const sha = 'a'.repeat(40);
const eventPayload = {
  action: 'completed',
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
const receipt = {
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
  eventName: 'workflow_run', eventPayload, receipt, expectedSourceSha: sha
}).state, 'COMPLETE_VERIFIED');

const authoritativeReceipt = {
  ...receipt,
  artifact_role: 'AUTHORITATIVE_P1_PRODUCER',
  authoritative_producer: true,
  downstream_consumable: true
};
assert.equal(validateP1RuntimeLineageSnapshot({
  eventName: 'workflow_run', eventPayload, receipt: authoritativeReceipt, expectedSourceSha: sha
}).state, 'COMPLETE_VERIFIED');

const rejected = [
  ['manual-p1-run', {...eventPayload, workflow_run: {...eventPayload.workflow_run, event: 'workflow_dispatch'}}, receipt],
  ['scheduled-p1-run', {...eventPayload, workflow_run: {...eventPayload.workflow_run, event: 'schedule'}}, receipt],
  ['push-p1-run', {...eventPayload, workflow_run: {...eventPayload.workflow_run, event: 'push'}}, receipt],
  ['local-control-receipt', eventPayload, {...receipt, trigger_event: 'workflow_dispatch', p0b_input_mode: 'REBUILT_LOCAL_CONTROL'}],
  ['wrong-workflow-path', {...eventPayload, workflow_run: {...eventPayload.workflow_run, path: '.github/workflows/other.yml'}}, receipt],
  ['wrong-head-sha', {...eventPayload, workflow_run: {...eventPayload.workflow_run, head_sha: 'b'.repeat(40)}}, receipt],
  ['p0b-self-reference', eventPayload, {...receipt, p0b_origin_run_id: 202}],
  ['p0b-source-mismatch', eventPayload, {...receipt, p0b_origin_source_sha: 'b'.repeat(40)}],
  ['partial-authority', eventPayload, {...receipt, artifact_role: 'AUTHORITATIVE_P1_PRODUCER'}]
];
for (const [name, mutatedEvent, mutatedReceipt] of rejected) {
  assert.throws(
    () => validateP1RuntimeLineageSnapshot({
      eventName: 'workflow_run',
      eventPayload: mutatedEvent,
      receipt: mutatedReceipt,
      expectedSourceSha: sha
    }),
    P1RuntimeLineageValidationError,
    name
  );
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'asi-p1-runtime-lineage-'));
try {
  const expanded = path.join(temp, 'expanded', 'nested');
  fs.mkdirSync(expanded, { recursive: true });
  const eventPath = path.join(temp, 'event.json');
  fs.writeFileSync(eventPath, JSON.stringify(eventPayload));
  fs.writeFileSync(path.join(expanded, 'kidults-asi-p1-source-preflight-receipt-v1.json'), JSON.stringify(receipt));
  assert.equal(validateP1RuntimeLineageFromEnvironment({
    eventName: 'workflow_run',
    eventPath,
    expandedRoot: path.join(temp, 'expanded'),
    expectedSourceSha: sha
  }).state, 'COMPLETE_VERIFIED');
  fs.writeFileSync(path.join(temp, 'expanded', 'kidults-asi-p1-source-preflight-receipt-v1.json'), JSON.stringify(receipt));
  assert.throws(() => validateP1RuntimeLineageFromEnvironment({
    eventName: 'workflow_run',
    eventPath,
    expandedRoot: path.join(temp, 'expanded'),
    expectedSourceSha: sha
  }), P1RuntimeLineageValidationError);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}

console.log(JSON.stringify({
  suite: 'KIDULTS_ASI_P1_RUNTIME_LINEAGE_V1',
  result: 'PASS',
  exact_p0b_to_p1_to_arl_lineage: true,
  manual_schedule_push_p1_artifacts_rejected: true,
  p1_receipt_cardinality_enforced: true,
  self_origin_rejected: true,
  candidate_created: false,
  evidence_created: false,
  public_release: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD'
}, null, 2));
'''

PROVENANCE_SOURCE = r'''#!/usr/bin/env node
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
'''


def patch_builder(source: str) -> str:
    import_marker = "import { buildReplacement } from './lib/asi-autonomous-resolution-replacement-v1.mjs';\n"
    import_line = "import { validateP1RuntimeLineageFromEnvironment } from './validate-asi-p1-runtime-lineage-v1.mjs';\n"
    if import_line not in source:
        if source.count(import_marker) != 1:
            raise RuntimeError('builder import marker mismatch')
        source = source.replace(import_marker, import_marker + import_line)

    guard_marker = "if (![candidateRegistryPath,bindingLedgerPath,gate1Path,admissionPath,actionQueuePath,frontierPath,crosswalkPath,adapterContractPath,contractPath,rightsPreflightPath,outputDir].every(Boolean)) throw new Error('AUTONOMOUS_RESOLUTION_ARGUMENTS_REQUIRED');\n"
    guard_block = """if (process.env.GITHUB_ACTIONS === 'true') {\n  await validateP1RuntimeLineageFromEnvironment({\n    eventName: process.env.GITHUB_EVENT_NAME,\n    eventPath: process.env.GITHUB_EVENT_PATH,\n    expandedRoot: '/tmp/p1-expanded',\n    expectedSourceSha: process.env.GITHUB_SHA\n  });\n}\n"""
    if guard_block not in source:
        if source.count(guard_marker) != 1:
            raise RuntimeError('builder guard marker mismatch')
        source = source.replace(guard_marker, guard_marker + guard_block)
    return source


def main() -> None:
    RUNTIME.parent.mkdir(parents=True, exist_ok=True)
    TEST.parent.mkdir(parents=True, exist_ok=True)
    RUNTIME.write_text(RUNTIME_SOURCE, encoding='utf-8')
    TEST.write_text(TEST_SOURCE, encoding='utf-8')
    BUILDER.write_text(patch_builder(BUILDER.read_text(encoding='utf-8')), encoding='utf-8')
    PROVENANCE.write_text(PROVENANCE_SOURCE, encoding='utf-8')


if __name__ == '__main__':
    main()
