#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const SHA40 = /^[0-9a-f]{40}$/;
const SHA256 = /^sha256:[0-9a-f]{64}$/;
const TERMINAL_CONTEXT = 'KIDULTS Atomic Landing Terminal V2';
const POST_CONTEXT = 'KIDULTS Current-SOLD Post-Landing V1';

function fail(code, detail = '') {
  const error = new Error(detail ? `${code}:${detail}` : code);
  error.code = code;
  throw error;
}
function assert(value, code, detail = '') { if (!value) fail(code, detail); }
const hash = bytes => `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  fs.renameSync(temp, file);
  fs.chmodSync(file, 0o600);
}

function finalizerEnv(workflow) {
  const marker = '- name: Reconcile durable atomic landing terminal receipt';
  const start = workflow.indexOf(marker);
  assert(start >= 0, 'ATOMIC_TERMINAL_FINALIZER_STEP_MISSING');
  const end = workflow.indexOf('\n      - name:', start + marker.length);
  const block = workflow.slice(start, end < 0 ? workflow.length : end);
  return new Set([...block.matchAll(/^\s{10}([A-Z][A-Z0-9_]+):\s*/gm)].map(match => match[1]));
}
function requiredHandoffs(reconciler) {
  const assignments = [...reconciler.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*process\.env\.([A-Z][A-Z0-9_]*)\s*\|\|\s*null\s*;/g)];
  return [...new Set(assignments.filter(match => {
    const variable = match[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`assert\\([^;]*\\b${variable}\\b[^;]*,[\\s\\n]*['\"][A-Z0-9_]*OUTPUT_INVALID['\"]\\s*\\);`, 'm').test(reconciler);
  }).map(match => match[2]))].sort();
}
export function validateBootstrapContract(baseWorkflow, candidateWorkflow, candidateReconciler) {
  const required = requiredHandoffs(candidateReconciler);
  assert(required.length > 0, 'ATOMIC_TERMINAL_HARD_REQUIRED_HANDOFF_SET_EMPTY');
  const base = finalizerEnv(baseWorkflow);
  const candidate = finalizerEnv(candidateWorkflow);
  for (const key of required) {
    assert(candidate.has(key), 'ATOMIC_TERMINAL_CANDIDATE_WORKFLOW_HANDOFF_MISSING', key);
    assert(base.has(key), 'ATOMIC_TERMINAL_BASE_WORKFLOW_HANDOFF_MISSING', key);
  }
  return {
    state: 'VERIFIED_PASS',
    required_terminal_handoffs: required,
    same_pr_hard_requirement_bootstrap_forbidden: true,
  };
}

function validateManifest(manifest) {
  assert(manifest?.id === 'kidults-atomic-terminal-recovery-manifest-v1', 'ATOMIC_RECOVERY_MANIFEST_ID_INVALID');
  assert(manifest?.version === '1.0.0' && manifest?.state === 'PENDING_DURABLE_RECOVERY', 'ATOMIC_RECOVERY_MANIFEST_STATE_INVALID');
  assert(manifest?.repository === 'johnkim9524-collab/kaios_enterprise_repo', 'ATOMIC_RECOVERY_REPOSITORY_INVALID');
  assert(manifest?.cause === 'BASE_WORKFLOW_CANDIDATE_TERMINAL_HANDOFF_BOOTSTRAP_MISMATCH', 'ATOMIC_RECOVERY_CAUSE_INVALID');
  const pr = manifest.predecessor_pull_request;
  assert(Number.isInteger(pr?.number) && SHA40.test(pr.exact_base_sha) && SHA40.test(pr.exact_head_sha), 'ATOMIC_RECOVERY_PR_BINDING_INVALID');
  assert(SHA40.test(pr.merge_commit_sha) && SHA40.test(pr.merge_tree_sha), 'ATOMIC_RECOVERY_MERGE_BINDING_INVALID');
  const run = manifest.atomic_run;
  assert(Number.isInteger(run?.id) && run.attempt === 1 && Number.isInteger(run.workflow_id), 'ATOMIC_RECOVERY_RUN_BINDING_INVALID');
  assert(run.expected_conclusion === 'failure' && SHA256.test(run.authorization_id_sha256), 'ATOMIC_RECOVERY_RUN_POLICY_INVALID');
  for (const artifact of [manifest.postlanding_artifact, manifest.failed_terminal_artifact]) {
    assert(Number.isInteger(artifact?.id) && artifact.id > 0 && typeof artifact.name === 'string' && SHA256.test(artifact.digest), 'ATOMIC_RECOVERY_ARTIFACT_BINDING_INVALID');
  }
  assert(manifest.expected_terminal_failure_class === 'ATOMIC_TERMINAL_CURRENT_SOLD_OUTPUT_INVALID', 'ATOMIC_RECOVERY_FAILURE_CLASS_INVALID');
  assert(manifest.public === 'HOLD' && manifest.production === 'HOLD' && manifest.g5 === 'HOLD', 'ATOMIC_RECOVERY_HOLD_INVALID');
  return manifest;
}
function latestStatus(payload, context) {
  return (Array.isArray(payload?.statuses) ? payload.statuses : []).find(item => item?.context === context) || null;
}
function exactArtifact(artifacts, expected, label) {
  const matches = (Array.isArray(artifacts) ? artifacts : []).filter(item => Number(item?.id) === expected.id);
  assert(matches.length === 1, `${label}_CARDINALITY`, String(matches.length));
  const artifact = matches[0];
  assert(artifact.name === expected.name && artifact.digest === expected.digest && artifact.expired === false, `${label}_BINDING_INVALID`);
  return artifact;
}
function runClassifier() {
  const result = spawnSync(process.execPath, ['scripts/kidults/kpmo/validate-workflow-repository-mutation-boundary-v1.mjs'], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    fail('ATOMIC_RECOVERY_CLASSIFIER_COMMAND_FAILED');
  }
  try { return JSON.parse(result.stdout); } catch { fail('ATOMIC_RECOVERY_CLASSIFIER_OUTPUT_INVALID'); }
}
function allowedRedirect(location) {
  const url = new URL(location);
  const host = url.hostname.toLowerCase();
  assert(url.protocol === 'https:', 'ATOMIC_RECOVERY_ARTIFACT_REDIRECT_PROTOCOL_INVALID');
  assert(host.endsWith('.blob.core.windows.net') || host.endsWith('.githubusercontent.com') || host.endsWith('.github.com'), 'ATOMIC_RECOVERY_ARTIFACT_REDIRECT_HOST_INVALID', host);
  return url.toString();
}

async function recover(manifestFile) {
  const manifest = validateManifest(readJson(manifestFile));
  const repository = process.env.GH_REPOSITORY || process.env.GITHUB_REPOSITORY || '';
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
  const runId = process.env.GITHUB_RUN_ID || '';
  const runAttempt = process.env.GITHUB_RUN_ATTEMPT || '';
  const output = process.env.ATOMIC_TERMINAL_RECOVERY_RECEIPT_PATH || 'out/atomic-terminal-recovery/receipt.json';
  assert(repository === manifest.repository && token, 'ATOMIC_RECOVERY_RUNTIME_BINDING_INVALID');
  assert(/^\d+$/.test(runId) && /^\d+$/.test(runAttempt), 'ATOMIC_RECOVERY_EXECUTOR_IDENTITY_INVALID');
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'kidults-atomic-terminal-recovery-v1',
  };
  const api = async (route, options = {}) => {
    const response = await fetch(`https://api.github.com/repos/${repository}${route}`, { ...options, headers: { ...headers, ...(options.headers || {}) }, redirect: 'error' });
    const payload = response.status === 204 ? null : await response.json().catch(() => null);
    assert(response.ok, `ATOMIC_RECOVERY_GITHUB_API_${response.status}`, route);
    return payload;
  };
  const artifactReceipt = async expected => {
    const first = await fetch(`https://api.github.com/repos/${repository}/actions/artifacts/${expected.id}/zip`, { headers, redirect: 'manual' });
    let response = first;
    if (first.status >= 300 && first.status < 400) response = await fetch(allowedRedirect(first.headers.get('location') || ''), { redirect: 'error' });
    assert(response.ok, `ATOMIC_RECOVERY_ARTIFACT_DOWNLOAD_${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert(hash(bytes) === expected.digest, 'ATOMIC_RECOVERY_ARTIFACT_ARCHIVE_DIGEST_MISMATCH');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-terminal-recovery-'));
    const zip = path.join(directory, 'artifact.zip');
    fs.writeFileSync(zip, bytes, { mode: 0o600, flag: 'wx' });
    const unzip = spawnSync('unzip', ['-p', zip, 'receipt.json'], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
    fs.rmSync(directory, { recursive: true, force: true });
    assert(!unzip.error && unzip.status === 0, 'ATOMIC_RECOVERY_ARTIFACT_EXTRACTION_FAILED');
    try { return JSON.parse(unzip.stdout); } catch { fail('ATOMIC_RECOVERY_ARTIFACT_RECEIPT_INVALID'); }
  };

  const expectedPr = manifest.predecessor_pull_request;
  const expectedRun = manifest.atomic_run;
  const [repo, pr, merge, originalRun, artifactPayload, main, mergeStatus] = await Promise.all([
    api(''), api(`/pulls/${expectedPr.number}`), api(`/commits/${expectedPr.merge_commit_sha}`),
    api(`/actions/runs/${expectedRun.id}`), api(`/actions/runs/${expectedRun.id}/artifacts?per_page=100`),
    api('/branches/main'), api(`/commits/${expectedPr.merge_commit_sha}/status`),
  ]);
  const mainSha = main?.commit?.sha;
  assert(SHA40.test(mainSha || ''), 'ATOMIC_RECOVERY_MAIN_SHA_INVALID');
  const [ancestry, postReceipt, terminalReceipt] = await Promise.all([
    api(`/compare/${expectedPr.merge_commit_sha}...${mainSha}`),
    artifactReceipt(manifest.postlanding_artifact), artifactReceipt(manifest.failed_terminal_artifact),
  ]);
  const classifier = runClassifier();
  const owner = repo?.owner?.login;

  assert(pr?.state === 'closed' && pr?.merged === true && pr?.user?.login === owner, 'ATOMIC_RECOVERY_PR_STATE_INVALID');
  assert(pr?.head?.sha === expectedPr.exact_head_sha && pr?.base?.sha === expectedPr.exact_base_sha && pr?.merge_commit_sha === expectedPr.merge_commit_sha, 'ATOMIC_RECOVERY_PR_TUPLE_MISMATCH');
  assert(merge?.sha === expectedPr.merge_commit_sha && merge?.commit?.tree?.sha === expectedPr.merge_tree_sha, 'ATOMIC_RECOVERY_MERGE_IDENTITY_MISMATCH');
  assert(Array.isArray(merge?.parents) && merge.parents.length === 2 && merge.parents[0]?.sha === expectedPr.exact_base_sha && merge.parents[1]?.sha === expectedPr.exact_head_sha, 'ATOMIC_RECOVERY_MERGE_PARENTS_MISMATCH');
  assert(Number(originalRun?.id) === expectedRun.id && Number(originalRun?.run_attempt) === 1 && Number(originalRun?.workflow_id) === expectedRun.workflow_id, 'ATOMIC_RECOVERY_RUN_IDENTITY_MISMATCH');
  assert(originalRun?.display_title === expectedRun.display_title && originalRun?.event === 'workflow_dispatch' && originalRun?.conclusion === 'failure', 'ATOMIC_RECOVERY_RUN_STATE_MISMATCH');
  assert(originalRun?.head_sha === expectedPr.exact_base_sha && originalRun?.actor?.login === owner && originalRun?.triggering_actor?.login === owner, 'ATOMIC_RECOVERY_RUN_ACTOR_OR_BASE_MISMATCH');
  const postArtifact = exactArtifact(artifactPayload?.artifacts, manifest.postlanding_artifact, 'ATOMIC_RECOVERY_POST_ARTIFACT');
  const failedArtifact = exactArtifact(artifactPayload?.artifacts, manifest.failed_terminal_artifact, 'ATOMIC_RECOVERY_TERMINAL_ARTIFACT');
  assert(postReceipt?.id === 'kidults-current-sold-postlanding-receipt-v1' && postReceipt?.state === 'VERIFIED_PASS', 'ATOMIC_RECOVERY_POST_RECEIPT_STATE_INVALID');
  assert(Number(postReceipt?.pull_request) === expectedPr.number && postReceipt?.exact_merge_sha === expectedPr.merge_commit_sha && postReceipt?.premerge_main_sha === expectedPr.exact_base_sha && postReceipt?.merged_pr_head_sha === expectedPr.exact_head_sha, 'ATOMIC_RECOVERY_POST_RECEIPT_TUPLE_MISMATCH');
  assert(Number(postReceipt?.landing_workflow_run_id) === expectedRun.id && Number(postReceipt?.landing_workflow_run_attempt) === 1, 'ATOMIC_RECOVERY_POST_RECEIPT_RUN_MISMATCH');
  assert(postReceipt?.tests_passed === 56 && postReceipt?.tests_failed === 0 && postReceipt?.merge_parent_binding_verified === true, 'ATOMIC_RECOVERY_POST_RECEIPT_PROOF_INVALID');
  assert(postReceipt?.control_smoke === 'PASS' && postReceipt?.raw_persistence_guard === 'PASS' && postReceipt?.postgres_append_only_static_guard === 'PASS', 'ATOMIC_RECOVERY_POST_RECEIPT_GUARDS_INVALID');
  assert(postReceipt?.provider_calls === 0 && postReceipt?.postgres_rows_written === 0 && postReceipt?.deployment === false, 'ATOMIC_RECOVERY_EXTERNAL_MUTATION_INVALID');
  assert(postReceipt?.public === 'HOLD' && postReceipt?.production === 'HOLD' && postReceipt?.g5 === 'HOLD', 'ATOMIC_RECOVERY_POST_RECEIPT_HOLD_INVALID');
  assert(terminalReceipt?.id === 'kidults-atomic-governed-landing-terminal-receipt-v2' && terminalReceipt?.state === 'VERIFIED_FAIL', 'ATOMIC_RECOVERY_FAILED_TERMINAL_STATE_INVALID');
  assert(terminalReceipt?.terminal_class === manifest.expected_terminal_failure_class && Number(terminalReceipt?.landing_workflow_run_id) === expectedRun.id, 'ATOMIC_RECOVERY_FAILED_TERMINAL_BINDING_INVALID');
  assert(terminalReceipt?.landing_step_outcome === 'success' && terminalReceipt?.current_sold_postlanding_outcome === 'success', 'ATOMIC_RECOVERY_PRIOR_STEP_OUTCOMES_INVALID');
  assert(terminalReceipt?.authorization_id_sha256 === expectedRun.authorization_id_sha256.slice(7), 'ATOMIC_RECOVERY_AUTHORIZATION_DIGEST_MISMATCH');
  const postStatus = latestStatus(mergeStatus, POST_CONTEXT);
  assert(postStatus?.state === 'success' && String(postStatus?.target_url || '').includes(`/actions/runs/${expectedRun.id}`), 'ATOMIC_RECOVERY_REMOTE_POST_STATUS_INVALID');
  assert(ancestry?.status === 'ahead' || ancestry?.status === 'identical', 'ATOMIC_RECOVERY_MAIN_ANCESTRY_INVALID');
  assert(classifier?.result === 'PASS' && classifier?.current_sold_matcher_surfaces_verified === 3 && Array.isArray(classifier?.findings) && classifier.findings.length === 0, 'ATOMIC_RECOVERY_CLASSIFIER_INVALID');

  const before = await api(`/commits/${expectedPr.exact_head_sha}/status`);
  const recoveryUrl = `${process.env.GITHUB_SERVER_URL || 'https://github.com'}/${repository}/actions/runs/${runId}`;
  let publication = 'ALREADY_SUCCESS';
  if (latestStatus(before, TERMINAL_CONTEXT)?.state !== 'success') {
    await api(`/statuses/${expectedPr.exact_head_sha}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: 'success', context: TERMINAL_CONTEXT, description: 'Recovered: merge committed and 56/56 exact-main proof verified', target_url: recoveryUrl }),
    });
    publication = 'SUCCESS_PUBLISHED';
  }
  const after = await api(`/commits/${expectedPr.exact_head_sha}/status`);
  const recovered = latestStatus(after, TERMINAL_CONTEXT);
  assert(recovered?.state === 'success', 'ATOMIC_RECOVERY_TERMINAL_STATUS_READBACK_INVALID');

  const receipt = {
    id: 'kidults-atomic-terminal-recovery-receipt-v1', version: '1.0.0', state: 'VERIFIED_PASS',
    recovery_class: 'DURABLE_EVIDENCE_RECONCILIATION_WITHOUT_REMERGE', cause: manifest.cause,
    repository, source_issue: manifest.source_issue, predecessor_pull_request: expectedPr.number,
    predecessor_exact_base_sha: expectedPr.exact_base_sha, predecessor_exact_head_sha: expectedPr.exact_head_sha,
    predecessor_merge_commit_sha: expectedPr.merge_commit_sha, predecessor_atomic_run_id: expectedRun.id,
    predecessor_atomic_run_conclusion: originalRun.conclusion, authorization_id_sha256: expectedRun.authorization_id_sha256,
    authorization_reused: false, merge_reexecuted: false, current_protected_main_sha: mainSha,
    current_main_descends_from_predecessor_merge: true, exact_merge_parent_binding_verified: true,
    postlanding_tests_passed: 56, postlanding_tests_failed: 0,
    evidence: {
      postlanding_artifact: { id: postArtifact.id, name: postArtifact.name, digest: postArtifact.digest },
      failed_terminal_artifact: { id: failedArtifact.id, name: failedArtifact.name, digest: failedArtifact.digest },
      inferred_landing_current_sold_changed: true,
      inference_basis: 'POSTLANDING_STEP_EXECUTED_SUCCESSFULLY_AND_EXACT_RECEIPT_VERIFIED',
    },
    classifier: {
      result: classifier.result, policy_version: classifier.policy_version,
      current_sold_matcher_surfaces_verified: classifier.current_sold_matcher_surfaces_verified,
      current_sold_matcher_mutation_cases_detected: classifier.current_sold_matcher_mutation_cases_detected,
      findings: classifier.findings,
    },
    prior_terminal_failure: manifest.expected_terminal_failure_class,
    terminal_status_publication: publication, terminal_status_readback: recovered.state,
    terminal_status_target_url: recovered.target_url, recovery_workflow_run_id: Number(runId),
    recovery_workflow_run_attempt: Number(runAttempt), recovered_at: new Date().toISOString(),
    raw_authorization_persisted: false, empirical_authority_created: false, provider_authority_created: false,
    postgres_write: false, deployment: false, public: 'HOLD', production: 'HOLD', g5: 'HOLD',
  };
  writeJson(output, receipt);
  console.log(JSON.stringify(receipt, null, 2));
}

function expectCode(fn, code) {
  let observed = null;
  try { fn(); } catch (error) { observed = error.code; }
  assert(observed === code, 'ATOMIC_RECOVERY_SELF_TEST_FAILURE_NOT_OBSERVED', `${code}:${observed || 'none'}`);
}
function selfTest() {
  const workflow = `      - name: Reconcile durable atomic landing terminal receipt\n        env:\n          CURRENT_SOLD_CHANGED: \${{ steps.landing.outputs.current_sold_changed }}\n        run: node reconcile.mjs --finalize\n\n      - name: Upload`;
  const reconciler = `const signal = process.env.CURRENT_SOLD_CHANGED || null;\nassert(signal === 'true' || signal === 'false', 'ATOMIC_TERMINAL_CURRENT_SOLD_OUTPUT_INVALID');`;
  validateBootstrapContract(workflow, workflow, reconciler);
  expectCode(() => validateBootstrapContract(workflow.replace(/^\s*CURRENT_SOLD_CHANGED:.*$/m, ''), workflow, reconciler), 'ATOMIC_TERMINAL_BASE_WORKFLOW_HANDOFF_MISSING');
  const next = `${reconciler}\nconst nextSignal = process.env.CURRENT_SOLD_NEXT_SIGNAL || null;\nassert(nextSignal === 'ready', 'ATOMIC_TERMINAL_NEXT_OUTPUT_INVALID');`;
  const candidate = workflow.replace('        run:', '          CURRENT_SOLD_NEXT_SIGNAL: ready\n        run:');
  expectCode(() => validateBootstrapContract(workflow, candidate, next), 'ATOMIC_TERMINAL_BASE_WORKFLOW_HANDOFF_MISSING');
  console.log(JSON.stringify({
    id: 'kidults-atomic-terminal-recovery-self-test-v1', state: 'VERIFIED_PASS',
    bootstrap_mutations_rejected: 2, merge_reexecution_required: false,
    public: 'HOLD', production: 'HOLD', g5: 'HOLD',
  }, null, 2));
}

const [mode, ...args] = process.argv.slice(2);
if (mode === '--self-test') selfTest();
else if (mode === '--validate-contract') {
  assert(args.length === 3, 'ATOMIC_TERMINAL_CONTRACT_ARGUMENTS_INVALID');
  console.log(JSON.stringify(validateBootstrapContract(
    fs.readFileSync(args[0], 'utf8'), fs.readFileSync(args[1], 'utf8'), fs.readFileSync(args[2], 'utf8'),
  ), null, 2));
} else if (mode === '--recover') {
  assert(args.length === 1, 'ATOMIC_RECOVERY_ARGUMENTS_INVALID');
  await recover(args[0]);
} else fail('ATOMIC_RECOVERY_MODE_INVALID');
