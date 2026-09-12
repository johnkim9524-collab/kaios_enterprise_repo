#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { hashText, stableJson } from './lib/asi-snapshot-readiness-factory-v2.mjs';

const P2_WORKFLOW_PATH = '.github/workflows/kidults-asi-owned-source-intelligence-graph-v2.yml';
const NAMES = {
  p0b: 'kidults-asi-p0b-bounded-discovery-candidates-v1',
  p1: 'kidults-asi-p1-source-preflight-v1',
  p2: 'kidults-asi-owned-source-intelligence-graph-v2',
};
const SHA = /^[0-9a-f]{40}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const POSITIVE_INTEGER = /^[1-9][0-9]*$/;
const STRICT_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const MAXIMUM_UPSTREAM_AGE_MS = 24 * 60 * 60 * 1000;
const requireCondition = (condition, code) => { if (!condition) throw new Error(code); };
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const clone = (value) => JSON.parse(JSON.stringify(value));
const strictTime = (value) => {
  if (typeof value !== 'string' || !STRICT_UTC.test(value) || !Number.isFinite(Date.parse(value))) return false;
  const canonical = new Date(value).toISOString();
  return value === canonical || value === canonical.replace('.000Z', 'Z');
};

function artifactValid(artifact, name) {
  return artifact && POSITIVE_INTEGER.test(String(artifact.id)) && artifact.name === name && artifact.expired === false
    && DIGEST.test(artifact.digest || '') && !/^sha256:0{64}$/.test(artifact.digest)
    && artifact.downloaded_archive_sha256 === artifact.digest
    && POSITIVE_INTEGER.test(String(artifact.workflow_run?.id || ''))
    && artifact.workflow_run?.head_branch === 'main' && SHA.test(artifact.workflow_run?.head_sha || '');
}

function validate(binding, documents) {
  requireCondition(typeof binding.repository === 'string' && binding.repository.includes('/'), 'BINDING_REPOSITORY_INVALID');
  const run = binding.p2_run;
  requireCondition(run && POSITIVE_INTEGER.test(String(run.id)), 'P2_RUN_ID_MISSING');
  requireCondition(run.path === P2_WORKFLOW_PATH, 'P2_RUN_WORKFLOW_PATH_MISMATCH');
  requireCondition(run.head_branch === 'main' && SHA.test(run.head_sha || ''), 'P2_RUN_MAIN_HEAD_INVALID');
  requireCondition(run.conclusion === 'success', 'P2_RUN_NOT_SUCCESSFUL');
  requireCondition(run.repository?.full_name === binding.repository, 'P2_RUN_REPOSITORY_MISMATCH');
  requireCondition(strictTime(run.completed_at) && strictTime(binding.readback_observed_at), 'P2_RUN_FRESHNESS_TIME_INVALID');
  requireCondition(binding.observed_main_head_sha === run.head_sha, 'P2_RUN_NOT_CURRENT_OBSERVED_MAIN_HEAD');
  const ageMs = Date.parse(binding.readback_observed_at) - Date.parse(run.completed_at);
  requireCondition(ageMs >= 0 && ageMs <= MAXIMUM_UPSTREAM_AGE_MS, 'P2_RUN_STALE');
  if (binding.trigger_event === 'workflow_run') {
    requireCondition(String(binding.event_upstream_run_id) === String(run.id), 'WORKFLOW_RUN_EVENT_ID_MISMATCH');
    requireCondition(binding.event_upstream_head_sha === run.head_sha, 'WORKFLOW_RUN_EVENT_HEAD_MISMATCH');
  } else if (binding.trigger_event === 'schedule' || binding.trigger_event === 'workflow_dispatch') {
    requireCondition(String(binding.event_upstream_run_id) === String(run.id), 'RECOVERY_EVENT_RUN_ID_MISMATCH');
    requireCondition(binding.event_upstream_head_sha === run.head_sha, 'RECOVERY_EVENT_HEAD_MISMATCH');
  } else {
    requireCondition(false, 'UNSUPPORTED_UPSTREAM_BINDING_EVENT');
  }

  const { p0b, p1, p2 } = binding.artifacts || {};
  requireCondition(artifactValid(p2, NAMES.p2), 'P2_ARTIFACT_METADATA_INVALID');
  requireCondition(String(p2.workflow_run.id) === String(run.id) && p2.workflow_run.head_sha === run.head_sha, 'P2_ARTIFACT_RUN_HEAD_MISMATCH');
  requireCondition(artifactValid(p0b, NAMES.p0b), 'P0B_ARTIFACT_METADATA_INVALID');
  requireCondition(artifactValid(p1, NAMES.p1), 'P1_ARTIFACT_METADATA_INVALID');
  requireCondition(String(p0b.workflow_run.id) === String(p1.workflow_run.id), 'P0B_P1_ARTIFACT_RUN_MISMATCH');
  requireCondition(p0b.workflow_run.head_sha === run.head_sha && p1.workflow_run.head_sha === run.head_sha, 'P0B_P1_ARTIFACT_HEAD_MISMATCH');

  const { p0Registry, p0Bindings, p1Gate, p1Admission, p1Actions, p1Receipt, p2Graph, p2Lineage, p2Manifest, p2Receipt } = documents;
  requireCondition(p2Receipt.id === 'kidults-asi-owned-source-intelligence-graph-kpmo-receipt-v2', 'P2_RECEIPT_ID_INVALID');
  requireCondition(p2Receipt.source_sha === run.head_sha, 'P2_RECEIPT_SOURCE_SHA_MISMATCH');
  requireCondition(String(p2Receipt.p0b_artifact_id) === String(p0b.id), 'P0B_ARTIFACT_NOT_BOUND_BY_P2_RECEIPT');
  requireCondition(String(p2Receipt.p1_artifact_id) === String(p1.id), 'P1_ARTIFACT_NOT_BOUND_BY_P2_RECEIPT');
  requireCondition(String(p2Receipt.p1_workflow_run_id) === String(p1.workflow_run.id), 'P1_RUN_NOT_BOUND_BY_P2_RECEIPT');
  requireCondition(p2Receipt.p1_source_sha === p1.workflow_run.head_sha, 'P1_HEAD_NOT_BOUND_BY_P2_RECEIPT');
  requireCondition(p2Receipt.p0b_p1_pair_binding === 'SAME_SUCCESSFUL_P1_WORKFLOW_RUN', 'P0B_P1_PAIR_BINDING_INVALID');

  requireCondition(p1Receipt.id === 'kidults-asi-p1-source-preflight-receipt-v1', 'P1_RECEIPT_ID_INVALID');
  requireCondition(p1Receipt.state === 'VERIFIED_PASS', 'P1_RECEIPT_STATE_INVALID');
  requireCondition(p1Receipt.source_sha === p1.workflow_run.head_sha && p1Receipt.source_sha === run.head_sha, 'P1_RECEIPT_SOURCE_SHA_MISMATCH');
  requireCondition(p1Receipt.trigger_event === 'workflow_run', 'P1_RECEIPT_TRIGGER_NOT_WORKFLOW_RUN');
  requireCondition(p1Receipt.p0b_input_mode === 'EXACT_TRIGGERING_WORKFLOW_RUN', 'P1_RECEIPT_P0B_MODE_NOT_EXACT');
  requireCondition(POSITIVE_INTEGER.test(String(p1Receipt.p0b_origin_run_id || '')), 'P1_RECEIPT_P0B_ORIGIN_RUN_INVALID');
  requireCondition(String(p1Receipt.p0b_origin_run_id) !== String(p1.workflow_run.id), 'P1_RECEIPT_P0B_SELF_ORIGIN_FORBIDDEN');
  requireCondition(p1Receipt.p0b_origin_source_sha === run.head_sha, 'P1_RECEIPT_P0B_ORIGIN_SHA_MISMATCH');
  requireCondition(p1Receipt.public_release === 'HOLD' && p1Receipt.production === 'HOLD', 'P1_RECEIPT_HOLD_INVARIANT_MISSING');

  requireCondition(p2Receipt.graph_digest === p2Manifest.graph_digest, 'P2_RECEIPT_GRAPH_DIGEST_MISMATCH');
  requireCondition(p2Lineage.graph?.digest === p2Manifest.graph_digest && p2Lineage.graph.digest === hashText(stableJson(p2Graph)), 'P2_GRAPH_LINEAGE_DIGEST_MISMATCH');
  const lineageInputs = new Map((p2Lineage.inputs || []).map((entry) => [entry.id, entry.digest]));
  for (const value of [p0Registry, p0Bindings, p1Gate, p1Admission, p1Actions]) {
    requireCondition(lineageInputs.get(value.id) === hashText(stableJson(value)), `P2_LINEAGE_INPUT_DIGEST_MISMATCH:${value.id}`);
  }
  return {
    id: 'kidults-asi-snapshot-readiness-upstream-binding-v2',
    version: '2.2.0',
    state: 'VERIFIED_EXACT_UPSTREAM_CHAIN',
    repository: binding.repository,
    trigger_event: binding.trigger_event,
    exact_main_recovery_event: binding.trigger_event === 'schedule' || binding.trigger_event === 'workflow_dispatch',
    p2_workflow_path: P2_WORKFLOW_PATH,
    p2_run_id: String(run.id),
    p2_head_sha: run.head_sha,
    observed_main_head_sha: binding.observed_main_head_sha,
    p2_completed_at: run.completed_at,
    readback_observed_at: binding.readback_observed_at,
    p2_artifact_id: String(p2.id),
    p2_artifact_digest: p2.digest,
    p2_downloaded_archive_sha256: p2.downloaded_archive_sha256,
    p0b_artifact_id: String(p0b.id),
    p0b_workflow_run_id: String(p0b.workflow_run.id),
    p0b_head_sha: p0b.workflow_run.head_sha,
    p0b_artifact_digest: p0b.digest,
    p0b_downloaded_archive_sha256: p0b.downloaded_archive_sha256,
    p1_artifact_id: String(p1.id),
    p1_workflow_run_id: String(p1.workflow_run.id),
    p1_head_sha: p1.workflow_run.head_sha,
    p1_artifact_digest: p1.digest,
    p1_downloaded_archive_sha256: p1.downloaded_archive_sha256,
    p1_trigger_event: p1Receipt.trigger_event,
    p1_p0b_input_mode: p1Receipt.p0b_input_mode,
    p0b_origin_run_id: String(p1Receipt.p0b_origin_run_id),
    p0b_origin_source_sha: p1Receipt.p0b_origin_source_sha,
    graph_digest: p2Manifest.graph_digest,
    p0b_and_p1_selected_from_p2_receipt: true,
    p1_transitive_origin_receipt_verified: true,
    local_rebuild_p1_accepted: false,
    global_artifact_scan_used: false,
    any_branch_fallback_used: false,
    public_release: 'HOLD',
    production: 'HOLD',
  };
}

function findUniqueFile(root, name) {
  requireCondition(fs.existsSync(root), `ARTIFACT_EXPANDED_ROOT_MISSING:${root}`);
  const matches = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name === name) matches.push(full);
    }
  };
  walk(root);
  requireCondition(matches.length === 1, `ARTIFACT_FILE_CARDINALITY_INVALID:${name}:${matches.length}`);
  return matches[0];
}

function documentsFromDirectories(p0bDir, p1Dir, p2Dir) {
  const p1ExpandedDir = path.join(path.dirname(p1Dir), `${path.basename(p1Dir)}-expanded`);
  return {
    p0Registry: readJson(path.join(p0bDir, 'p0b-source-candidate-registry-v1.json')),
    p0Bindings: readJson(path.join(p0bDir, 'p0b-mission-candidate-binding-ledger-v1.json')),
    p1Gate: readJson(path.join(p1Dir, 'p1-gate1-source-safety-decisions-v1.json')),
    p1Admission: readJson(path.join(p1Dir, 'p1-evidence-admission-candidate-register-v1.json')),
    p1Actions: readJson(path.join(p1Dir, 'p1-preflight-action-queue-v1.json')),
    p1Receipt: readJson(findUniqueFile(p1ExpandedDir, 'kidults-asi-p1-source-preflight-receipt-v1.json')),
    p2Graph: readJson(path.join(p2Dir, 'owned-source-intelligence-graph-v2.json')),
    p2Lineage: readJson(path.join(p2Dir, 'owned-source-intelligence-lineage-v2.json')),
    p2Manifest: readJson(path.join(p2Dir, 'owned-source-intelligence-manifest-v2.json')),
    p2Receipt: readJson(path.join(p2Dir, 'kidults-asi-owned-source-intelligence-graph-kpmo-receipt-v2.json')),
  };
}

function selfTest() {
  const objects = {
    p0Registry: { id: 'kidults-asi-p0b-source-candidate-registry-v1', version: '1' },
    p0Bindings: { id: 'kidults-asi-p0b-mission-candidate-binding-ledger-v1', version: '1' },
    p1Gate: { id: 'kidults-asi-p1-gate1-source-safety-decisions-v1', version: '1' },
    p1Admission: { id: 'kidults-asi-p1-evidence-admission-candidate-register-v1', version: '1' },
    p1Actions: { id: 'kidults-asi-p1-preflight-action-queue-v1', version: '1' },
  };
  const graph = { id: 'kidults-owned-source-intelligence-graph-v2', version: '2.0.0' };
  const graphDigest = hashText(stableJson(graph));
  const head = '1'.repeat(40);
  const artifact = (id, name, runId) => {
    const digest = `sha256:${String(id).padStart(64, '1').slice(-64)}`;
    return { id, name, expired: false, digest, downloaded_archive_sha256: digest, workflow_run: { id: runId, head_branch: 'main', head_sha: head } };
  };
  const binding = {
    repository: 'owner/repo',
    trigger_event: 'workflow_run',
    event_upstream_run_id: 30,
    event_upstream_head_sha: head,
    readback_observed_at: '2026-08-24T00:10:00.000Z',
    observed_main_head_sha: head,
    p2_run: { id: 30, path: P2_WORKFLOW_PATH, head_branch: 'main', head_sha: head, conclusion: 'success', completed_at: '2026-08-24T00:05:00.000Z', repository: { full_name: 'owner/repo' } },
    artifacts: { p0b: artifact(10, NAMES.p0b, 20), p1: artifact(20, NAMES.p1, 20), p2: artifact(30, NAMES.p2, 30) },
  };
  const documents = {
    ...objects,
    p1Receipt: {
      id: 'kidults-asi-p1-source-preflight-receipt-v1',
      state: 'VERIFIED_PASS',
      source_sha: head,
      trigger_event: 'workflow_run',
      p0b_input_mode: 'EXACT_TRIGGERING_WORKFLOW_RUN',
      p0b_origin_run_id: 10,
      p0b_origin_source_sha: head,
      public_release: 'HOLD',
      production: 'HOLD',
    },
    p2Graph: graph,
    p2Lineage: {
      graph: { digest: graphDigest },
      inputs: Object.values(objects).map((value) => ({ id: value.id, digest: hashText(stableJson(value)) })),
    },
    p2Manifest: { graph_digest: graphDigest },
    p2Receipt: {
      id: 'kidults-asi-owned-source-intelligence-graph-kpmo-receipt-v2',
      source_sha: head,
      p0b_artifact_id: 10,
      p1_artifact_id: 20,
      p0b_p1_pair_binding: 'SAME_SUCCESSFUL_P1_WORKFLOW_RUN',
      p1_workflow_run_id: 20,
      p1_source_sha: head,
      graph_digest: graphDigest,
    },
  };
  validate(binding, documents);
  for (const triggerEvent of ['schedule', 'workflow_dispatch']) {
    const recoveryBinding = clone(binding);
    recoveryBinding.trigger_event = triggerEvent;
    validate(recoveryBinding, documents);
  }
  const mutations = [
    ['wrong-event-run', (b) => { b.event_upstream_run_id = 31; }],
    ['wrong-event-head', (b) => { b.event_upstream_head_sha = '2'.repeat(40); }],
    ['not-current-main-head', (b) => { b.observed_main_head_sha = '2'.repeat(40); }],
    ['stale-run', (b) => { b.readback_observed_at = '2026-08-26T00:10:00.000Z'; }],
    ['invalid-calendar-time', (b) => { b.p2_run.completed_at = '2026-02-31T00:05:00.000Z'; }],
    ['non-main-run', (b) => { b.p2_run.head_branch = 'feature'; }],
    ['failed-run', (b) => { b.p2_run.conclusion = 'failure'; }],
    ['expired-p2-artifact', (b) => { b.artifacts.p2.expired = true; }],
    ['non-numeric-artifact-id', (b) => { b.artifacts.p1.id = '../arbitrary'; }],
    ['downloaded-archive-digest-mismatch', (b) => { b.artifacts.p2.downloaded_archive_sha256 = `sha256:${'0'.repeat(64)}`; }],
    ['artifact-run-mismatch', (b) => { b.artifacts.p2.workflow_run.id = 31; }],
    ['p0-id-not-from-receipt', (b, d) => { d.p2Receipt.p0b_artifact_id = 11; }],
    ['p1-name-mismatch', (b) => { b.artifacts.p1.name = 'wrong'; }],
    ['p0b-p1-run-mismatch', (b) => { b.artifacts.p0b.workflow_run.id = 21; }],
    ['p1-run-not-from-p2-receipt', (b, d) => { d.p2Receipt.p1_workflow_run_id = 21; }],
    ['p1-head-not-from-p2-receipt', (b, d) => { d.p2Receipt.p1_source_sha = '2'.repeat(40); }],
    ['p1-trigger-schedule', (b, d) => { d.p1Receipt.trigger_event = 'schedule'; }],
    ['p1-trigger-manual', (b, d) => { d.p1Receipt.trigger_event = 'workflow_dispatch'; }],
    ['p1-local-rebuild-mode', (b, d) => { d.p1Receipt.p0b_input_mode = 'REBUILT_LOCAL_CONTROL'; }],
    ['p1-null-p0b-origin', (b, d) => { d.p1Receipt.p0b_origin_run_id = null; }],
    ['p1-self-p0b-origin', (b, d) => { d.p1Receipt.p0b_origin_run_id = 20; }],
    ['p1-wrong-p0b-origin-sha', (b, d) => { d.p1Receipt.p0b_origin_source_sha = '2'.repeat(40); }],
    ['p1-hold-stripped', (b, d) => { d.p1Receipt.production = 'READY'; }],
    ['lineage-content-mismatch', (b, d) => { d.p0Registry.version = 'tampered'; }],
    ['unsupported-trigger-event', (b) => { b.trigger_event = 'push'; }],
    ['recovery-run-mismatch', (b) => { b.trigger_event = 'workflow_dispatch'; b.event_upstream_run_id = 31; }],
    ['recovery-head-mismatch', (b) => { b.trigger_event = 'schedule'; b.event_upstream_head_sha = '2'.repeat(40); }],
  ];
  for (const [id, mutate] of mutations) {
    const candidateBinding = clone(binding);
    const candidateDocuments = clone(documents);
    mutate(candidateBinding, candidateDocuments);
    let rejected = false;
    try { validate(candidateBinding, candidateDocuments); } catch { rejected = true; }
    requireCondition(rejected, `UPSTREAM_BINDING_MUTATION_ESCAPED:${id}`);
  }
  return { state: 'VERIFIED_PASS', mutation_cases: mutations.length, transitive_p1_origin_enforced: true };
}

const args = process.argv.slice(2);
const noArgumentSelfTest = args.length === 0;
const explicitSelfTest = args.length === 1 && args[0] === '--self-test';
if (noArgumentSelfTest || explicitSelfTest) {
  console.log(JSON.stringify({
    id: 'kidults-asi-snapshot-readiness-upstream-binding-self-test-v2',
    invocation_mode: noArgumentSelfTest ? 'NO_ARGUMENT_SAFE_SELF_TEST' : 'EXPLICIT_SELF_TEST',
    ...selfTest(),
  }, null, 2));
} else {
  const [bindingPath, p0bDir, p1Dir, p2Dir, outputPath = '/tmp/kidults-asi-snapshot-readiness-upstream-binding-v2.json'] = args;
  requireCondition(Boolean(bindingPath && p0bDir && p1Dir && p2Dir), 'UPSTREAM_BINDING_ARGUMENTS_REQUIRED');
  const receipt = validate(readJson(bindingPath), documentsFromDirectories(p0bDir, p1Dir, p2Dir));
  fs.writeFileSync(outputPath, stableJson(receipt));
  console.log(JSON.stringify(receipt, null, 2));
}
