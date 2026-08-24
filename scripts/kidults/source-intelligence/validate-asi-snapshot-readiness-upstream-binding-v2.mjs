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
  } else {
    requireCondition(binding.event_upstream_run_id === null && binding.event_upstream_head_sha === null, 'NON_WORKFLOW_RUN_EVENT_BINDING_FORBIDDEN');
  }

  const { p0b, p1, p2 } = binding.artifacts || {};
  requireCondition(artifactValid(p2, NAMES.p2), 'P2_ARTIFACT_METADATA_INVALID');
  requireCondition(String(p2.workflow_run.id) === String(run.id) && p2.workflow_run.head_sha === run.head_sha, 'P2_ARTIFACT_RUN_HEAD_MISMATCH');
  requireCondition(artifactValid(p0b, NAMES.p0b), 'P0B_ARTIFACT_METADATA_INVALID');
  requireCondition(artifactValid(p1, NAMES.p1), 'P1_ARTIFACT_METADATA_INVALID');

  const { p0Registry, p0Bindings, p1Gate, p1Admission, p1Actions, p2Graph, p2Lineage, p2Manifest, p2Receipt } = documents;
  requireCondition(p2Receipt.id === 'kidults-asi-owned-source-intelligence-graph-kpmo-receipt-v2', 'P2_RECEIPT_ID_INVALID');
  requireCondition(p2Receipt.source_sha === run.head_sha, 'P2_RECEIPT_SOURCE_SHA_MISMATCH');
  requireCondition(String(p2Receipt.p0b_artifact_id) === String(p0b.id), 'P0B_ARTIFACT_NOT_BOUND_BY_P2_RECEIPT');
  requireCondition(String(p2Receipt.p1_artifact_id) === String(p1.id), 'P1_ARTIFACT_NOT_BOUND_BY_P2_RECEIPT');
  requireCondition(p2Receipt.graph_digest === p2Manifest.graph_digest, 'P2_RECEIPT_GRAPH_DIGEST_MISMATCH');
  requireCondition(p2Lineage.graph?.digest === p2Manifest.graph_digest && p2Lineage.graph.digest === hashText(stableJson(p2Graph)), 'P2_GRAPH_LINEAGE_DIGEST_MISMATCH');
  const lineageInputs = new Map((p2Lineage.inputs || []).map((entry) => [entry.id, entry.digest]));
  for (const value of [p0Registry, p0Bindings, p1Gate, p1Admission, p1Actions]) {
    requireCondition(lineageInputs.get(value.id) === hashText(stableJson(value)), `P2_LINEAGE_INPUT_DIGEST_MISMATCH:${value.id}`);
  }
  return {
    id: 'kidults-asi-snapshot-readiness-upstream-binding-v2',
    version: '2.1.0',
    state: 'VERIFIED_EXACT_UPSTREAM_CHAIN',
    repository: binding.repository,
    trigger_event: binding.trigger_event,
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
    graph_digest: p2Manifest.graph_digest,
    p0b_and_p1_selected_from_p2_receipt: true,
    global_artifact_scan_used: false,
    any_branch_fallback_used: false,
    public_release: 'HOLD',
    production: 'HOLD',
  };
}

function documentsFromDirectories(p0bDir, p1Dir, p2Dir) {
  return {
    p0Registry: readJson(path.join(p0bDir, 'p0b-source-candidate-registry-v1.json')),
    p0Bindings: readJson(path.join(p0bDir, 'p0b-mission-candidate-binding-ledger-v1.json')),
    p1Gate: readJson(path.join(p1Dir, 'p1-gate1-source-safety-decisions-v1.json')),
    p1Admission: readJson(path.join(p1Dir, 'p1-evidence-admission-candidate-register-v1.json')),
    p1Actions: readJson(path.join(p1Dir, 'p1-preflight-action-queue-v1.json')),
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
  const artifact = (id, name) => {
    const digest = `sha256:${String(id).padStart(64, '1').slice(-64)}`;
    return { id, name, expired: false, digest, downloaded_archive_sha256: digest, workflow_run: { id: 30, head_branch: 'main', head_sha: head } };
  };
  const binding = {
    repository: 'owner/repo',
    trigger_event: 'workflow_run',
    event_upstream_run_id: 30,
    event_upstream_head_sha: head,
    readback_observed_at: '2026-08-24T00:10:00.000Z',
    observed_main_head_sha: head,
    p2_run: { id: 30, path: P2_WORKFLOW_PATH, head_branch: 'main', head_sha: head, conclusion: 'success', completed_at: '2026-08-24T00:05:00.000Z', repository: { full_name: 'owner/repo' } },
    artifacts: { p0b: artifact(10, NAMES.p0b), p1: artifact(20, NAMES.p1), p2: artifact(30, NAMES.p2) },
  };
  const documents = {
    ...objects,
    p2Graph: graph,
    p2Lineage: {
      graph: { digest: graphDigest },
      inputs: Object.values(objects).map((value) => ({ id: value.id, digest: hashText(stableJson(value)) })),
    },
    p2Manifest: { graph_digest: graphDigest },
    p2Receipt: { id: 'kidults-asi-owned-source-intelligence-graph-kpmo-receipt-v2', source_sha: head, p0b_artifact_id: 10, p1_artifact_id: 20, graph_digest: graphDigest },
  };
  validate(binding, documents);
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
    ['lineage-content-mismatch', (b, d) => { d.p0Registry.version = 'tampered'; }],
  ];
  for (const [id, mutate] of mutations) {
    const candidateBinding = clone(binding);
    const candidateDocuments = clone(documents);
    mutate(candidateBinding, candidateDocuments);
    let rejected = false;
    try { validate(candidateBinding, candidateDocuments); } catch { rejected = true; }
    requireCondition(rejected, `UPSTREAM_BINDING_MUTATION_ESCAPED:${id}`);
  }
  return { state: 'VERIFIED_PASS', mutation_cases: mutations.length };
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
