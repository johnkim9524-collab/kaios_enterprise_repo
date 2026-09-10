import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const EXPECTED_WORKFLOW = 'KIDULTS ASI P0B Bounded Discovery Candidates v1';
const EXPECTED_ARTIFACT = 'kidults-asi-p0b-bounded-discovery-candidates-v1';
const SHA40 = /^[0-9a-f]{40}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function seal(receipt) {
  const copy = structuredClone(receipt);
  delete copy.receipt_digest;
  return `sha256:${crypto.createHash('sha256').update(canonical(copy)).digest('hex')}`;
}

export function buildReceipt({ event, artifactsResponse, repository, liveMainSha, observerRunId, observerRunAttempt }) {
  const run = event?.workflow_run ?? {};
  const failures = [];
  const runId = Number(run.id);
  const runAttempt = Number(run.run_attempt ?? 0);
  const conclusion = String(run.conclusion ?? '').toLowerCase();
  const headSha = String(run.head_sha ?? '').toLowerCase();
  const runRepository = String(run?.repository?.full_name ?? '');

  if (event?.action !== 'completed') failures.push('TRIGGER_ACTION_NOT_COMPLETED');
  if (run.name !== EXPECTED_WORKFLOW) failures.push('PRODUCER_WORKFLOW_MISMATCH');
  if (!Number.isSafeInteger(runId) || runId <= 0) failures.push('PRODUCER_RUN_ID_INVALID');
  if (!Number.isSafeInteger(runAttempt) || runAttempt <= 0) failures.push('PRODUCER_RUN_ATTEMPT_INVALID');
  if (run.head_branch !== 'main') failures.push('PRODUCER_HEAD_BRANCH_NOT_MAIN');
  if (!SHA40.test(headSha)) failures.push('PRODUCER_HEAD_SHA_INVALID');
  if (!SHA40.test(String(liveMainSha ?? ''))) failures.push('LIVE_MAIN_SHA_INVALID');
  if (headSha !== String(liveMainSha ?? '').toLowerCase()) failures.push('PRODUCER_NOT_CURRENT_PROTECTED_MAIN');
  if (runRepository !== repository) failures.push('PRODUCER_REPOSITORY_MISMATCH');

  const artifacts = Array.isArray(artifactsResponse?.artifacts) ? artifactsResponse.artifacts : [];
  const matches = artifacts.filter((artifact) => artifact?.name === EXPECTED_ARTIFACT);
  if (matches.length !== 1) failures.push(`P0B_ARTIFACT_CARDINALITY_${matches.length}`);

  const artifact = matches.length === 1 ? matches[0] : null;
  if (artifact) {
    if (artifact.expired !== false) failures.push('P0B_ARTIFACT_EXPIRED_OR_INVALID');
    if (!Number.isSafeInteger(Number(artifact.id)) || Number(artifact.id) <= 0) failures.push('P0B_ARTIFACT_ID_INVALID');
    if (!DIGEST.test(String(artifact.digest ?? '').toLowerCase())) failures.push('P0B_ARTIFACT_DIGEST_INVALID');
    if (Number(artifact?.workflow_run?.id) !== runId) failures.push('P0B_ARTIFACT_RUN_ID_MISMATCH');
    if (String(artifact?.workflow_run?.head_sha ?? '').toLowerCase() !== headSha) failures.push('P0B_ARTIFACT_HEAD_SHA_MISMATCH');
  }

  if (conclusion !== 'success') failures.push(`PRODUCER_CONCLUSION_${conclusion || 'MISSING'}`);

  const producerHealthy = failures.length === 0;
  const receipt = {
    receipt_id: 'kpmo-p0b-terminal-observer-receipt-v1',
    version: '1.0.0',
    scope: 'P0B_TERMINAL_TRANSPORT_OBSERVATION_ONLY_NOT_EMPIRICAL_LAUNCH_PROOF',
    observer_integrity_state: 'VERIFIED_PASS',
    producer_terminal_state: producerHealthy ? 'VERIFIED_PASS' : 'VERIFIED_FAIL',
    overall_state: producerHealthy ? 'HOLD' : 'RED',
    repository,
    live_main_sha: String(liveMainSha ?? '').toLowerCase(),
    observer_run_id: String(observerRunId ?? ''),
    observer_run_attempt: Number(observerRunAttempt ?? 0),
    producer: {
      workflow: run.name ?? null,
      run_id: Number.isFinite(runId) ? runId : null,
      run_attempt: Number.isFinite(runAttempt) ? runAttempt : null,
      head_branch: run.head_branch ?? null,
      head_sha: headSha || null,
      conclusion: conclusion || null
    },
    source_artifact: artifact ? {
      cardinality: matches.length,
      id: Number(artifact.id),
      name: artifact.name,
      digest: String(artifact.digest ?? '').toLowerCase() || null,
      expired: artifact.expired,
      workflow_run_id: Number(artifact?.workflow_run?.id),
      workflow_run_head_sha: String(artifact?.workflow_run?.head_sha ?? '').toLowerCase() || null
    } : { cardinality: matches.length, id: null, name: null, digest: null, expired: null, workflow_run_id: null, workflow_run_head_sha: null },
    failure_classes: failures,
    exact_generation_bound: Boolean(Number.isSafeInteger(runId) && runId > 0 && Number.isSafeInteger(runAttempt) && runAttempt > 0 && SHA40.test(headSha)),
    later_run_substitution_allowed: false,
    same_sha_run_substitution_allowed: false,
    candidate_admission: 'NONE',
    evidence_admission: 'NONE',
    track_b_admission: 'NONE',
    projection_admission: 'NONE',
    provider_authority: false,
    credential_authority: false,
    external_spend_authority: false,
    database_mutation_authority: false,
    promotion_eligible: false,
    public: 'HOLD',
    production: 'HOLD',
    g5: 'HOLD'
  };
  receipt.receipt_digest = seal(receipt);
  return receipt;
}

function main() {
  const [eventPath, artifactsPath, outPath] = process.argv.slice(2);
  if (!eventPath || !artifactsPath || !outPath) throw new Error('USAGE: event.json artifacts.json output.json');
  const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
  const artifactsResponse = JSON.parse(fs.readFileSync(artifactsPath, 'utf8'));
  const receipt = buildReceipt({
    event,
    artifactsResponse,
    repository: process.env.GITHUB_REPOSITORY ?? '',
    liveMainSha: process.env.LIVE_MAIN_SHA ?? '',
    observerRunId: process.env.GITHUB_RUN_ID ?? '',
    observerRunAttempt: process.env.GITHUB_RUN_ATTEMPT ?? '0'
  });
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(receipt, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
