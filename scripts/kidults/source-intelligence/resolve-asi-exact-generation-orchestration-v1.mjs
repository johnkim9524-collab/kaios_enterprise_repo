#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SHA = /^[a-f0-9]{40}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const WORKFLOW_PATH = /^\.github\/workflows\/[A-Za-z0-9_.-]+\.ya?ml$/;
const SAFE_NAME = /^[A-Za-z0-9_.-]+$/;
const SAFE_BRANCH = /^[A-Za-z0-9._\/-]+$/;
const SAFE_REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const ALLOWED_EVENTS = new Set(['schedule', 'workflow_dispatch', 'push']);
const MAX_API_RESPONSE_BYTES = 4 * 1024 * 1024;
const RECEIPT_KEYS = new Set([
  'id', 'version', 'consumer_id', 'repository', 'producer_workflow_path',
  'producer_workflow_name', 'producer_branch', 'expected_producer_sha',
  'expected_base_sha', 'expected_head_sha', 'expected_generation_sha',
  'artifact_name', 'trigger_expected', 'attempts_completed', 'max_attempts',
  'matched_run_count', 'selected_run_id', 'selected_run_attempt',
  'selected_run_status', 'selected_run_conclusion', 'artifact_match_count',
  'expired_artifact_count',
  'selected_artifact_id', 'selected_artifact_digest', 'writes',
  'external_provider_requests', 'production', 'public_release', 'g5', 'state',
  'terminal', 'outcome', 'failure_class', 'receipt_digest',
]);

export class OrchestrationError extends Error {
  constructor(code, detail = null) {
    super(detail === null ? code : `${code}:${detail}`);
    this.name = 'OrchestrationError';
    this.code = code;
  }
}

function fail(code, detail = null) {
  throw new OrchestrationError(code, detail);
}

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function stableDigest(receipt) {
  return sha256(Buffer.from(JSON.stringify(receipt), 'utf8'));
}

function integer(value, code, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) fail(code, value);
  return parsed;
}

function validateSpecification(specification) {
  if (!SAFE_REPOSITORY.test(specification.repository || '')) fail('REPOSITORY_INVALID');
  if (!SAFE_NAME.test(specification.consumerId || '')) fail('CONSUMER_ID_INVALID');
  if (!WORKFLOW_PATH.test(specification.workflowPath || '')) fail('WORKFLOW_PATH_INVALID');
  if (typeof specification.workflowName !== 'string' || !specification.workflowName.trim()) fail('WORKFLOW_NAME_INVALID');
  if (!SAFE_NAME.test(specification.artifactName || '')) fail('ARTIFACT_NAME_INVALID');
  if (!SAFE_BRANCH.test(specification.branch || '')) fail('BRANCH_INVALID');
  if (!SHA.test(specification.expectedSha || '')) fail('EXPECTED_SHA_INVALID');
  if (!SHA.test(specification.expectedBaseSha || '')) fail('EXPECTED_BASE_SHA_INVALID');
  if (!SHA.test(specification.expectedHeadSha || '')) fail('EXPECTED_HEAD_SHA_INVALID');
  if (!SHA.test(specification.expectedGenerationSha || '')) fail('EXPECTED_GENERATION_SHA_INVALID');
  if (specification.expectedSha !== specification.expectedGenerationSha) fail('GENERATION_SHA_ALIAS_MISMATCH');
  if (specification.expectedHeadSha !== specification.expectedGenerationSha) fail('HEAD_GENERATION_MISMATCH');
  if (typeof specification.triggerExpected !== 'boolean') fail('TRIGGER_EXPECTED_INVALID');
  const maxAttempts = integer(specification.maxAttempts, 'MAX_ATTEMPTS_INVALID', 1, 60);
  const pollMilliseconds = integer(specification.pollMilliseconds, 'POLL_MILLISECONDS_INVALID', 0, 60_000);
  return { ...specification, maxAttempts, pollMilliseconds };
}

function validateRunShape(run, specification) {
  integer(run?.id, 'RUN_ID_INVALID', 1);
  integer(run?.run_attempt, 'RUN_ATTEMPT_INVALID', 1);
  if (run?.repository?.full_name !== specification.repository) fail('RUN_REPOSITORY_MISMATCH', run?.id);
  if (run?.path !== specification.workflowPath) fail('RUN_WORKFLOW_PATH_MISMATCH', run?.id);
  if (run?.name !== specification.workflowName) fail('RUN_WORKFLOW_NAME_MISMATCH', run?.id);
  if (run?.head_branch !== specification.branch) fail('RUN_BRANCH_MISMATCH', run?.id);
  if (run?.head_sha !== specification.expectedGenerationSha) fail('RUN_SHA_MISMATCH', run?.id);
  if (!['queued', 'in_progress', 'completed'].includes(run?.status)) fail('RUN_STATUS_INVALID', run?.id);
  if (!ALLOWED_EVENTS.has(run?.event)) fail('RUN_EVENT_FORBIDDEN', run?.event);
  if (!Number.isFinite(Date.parse(run?.created_at || ''))) fail('RUN_CREATED_AT_INVALID', run?.id);
  return run;
}

function validateArtifactShape(artifact, run, specification, { allowExpired = false } = {}) {
  integer(artifact?.id, 'ARTIFACT_ID_INVALID', 1);
  if (artifact?.name !== specification.artifactName) fail('ARTIFACT_NAME_MISMATCH', artifact?.id);
  if (typeof artifact?.expired !== 'boolean') fail('ARTIFACT_EXPIRED_STATE_INVALID', artifact?.id);
  if (!allowExpired && artifact.expired) fail('ARTIFACT_EXPIRED', artifact?.id);
  if (!DIGEST.test(artifact?.digest || '')) fail('ARTIFACT_DIGEST_INVALID', artifact?.id);
  if (artifact?.workflow_run?.id !== run.id) fail('ARTIFACT_RUN_ID_MISMATCH', artifact?.id);
  if (artifact?.workflow_run?.head_sha !== specification.expectedGenerationSha) fail('ARTIFACT_SHA_MISMATCH', artifact?.id);
  if (artifact?.workflow_run?.head_branch !== specification.branch) fail('ARTIFACT_BRANCH_MISMATCH', artifact?.id);
  return artifact;
}

function receiptBase(specification, observation) {
  return {
    id: 'kidults-asi-exact-generation-orchestration-receipt-v1',
    version: '1.0.0',
    consumer_id: specification.consumerId,
    repository: specification.repository,
    producer_workflow_path: specification.workflowPath,
    producer_workflow_name: specification.workflowName,
    producer_branch: specification.branch,
    expected_producer_sha: specification.expectedSha,
    expected_base_sha: specification.expectedBaseSha,
    expected_head_sha: specification.expectedHeadSha,
    expected_generation_sha: specification.expectedGenerationSha,
    artifact_name: specification.artifactName,
    trigger_expected: specification.triggerExpected,
    attempts_completed: observation.attempt,
    max_attempts: specification.maxAttempts,
    matched_run_count: observation.matchedRunCount ?? 0,
    selected_run_id: observation.run?.id ?? null,
    selected_run_attempt: observation.run?.run_attempt ?? null,
    selected_run_status: observation.run?.status ?? null,
    selected_run_conclusion: observation.run?.conclusion ?? null,
    artifact_match_count: observation.artifactMatchCount ?? 0,
    expired_artifact_count: observation.expiredArtifactCount ?? 0,
    selected_artifact_id: observation.artifact?.id ?? null,
    selected_artifact_digest: observation.artifact?.digest ?? null,
    writes: 0,
    external_provider_requests: 0,
    production: 'HOLD',
    public_release: 'HOLD',
    g5: 'HOLD',
  };
}

function seal(receipt) {
  return { ...receipt, receipt_digest: stableDigest(receipt) };
}

export function classifyObservation(specificationInput, observation) {
  const specification = validateSpecification(specificationInput);
  const attempt = integer(observation?.attempt, 'ATTEMPT_INVALID', 1, specification.maxAttempts);
  if (!Array.isArray(observation?.runs) || observation.runs.length > 100) fail('RUN_EVIDENCE_INVALID');
  const exactRuns = [...observation.runs];
  exactRuns.forEach((run) => validateRunShape(run, specification));
  exactRuns.sort((left, right) => right.run_attempt - left.run_attempt || right.id - left.id);
  const run = exactRuns[0] || null;
  const base = receiptBase(specification, { attempt, matchedRunCount: exactRuns.length, run });

  if (!run) {
    if (!specification.triggerExpected) {
      return seal({ ...base, state: 'VERIFIED_FAIL', terminal: true, outcome: 'TRIGGER_MISSING', failure_class: 'TRIGGER_MISSING' });
    }
    if (attempt === specification.maxAttempts) {
      return seal({ ...base, state: 'VERIFIED_FAIL', terminal: true, outcome: 'PRODUCER_NOT_CREATED', failure_class: 'PRODUCER_NOT_CREATED' });
    }
    return seal({ ...base, state: 'RUNNING_VERIFIED', terminal: false, outcome: 'WAITING_FOR_PRODUCER', failure_class: null });
  }

  if (run.status !== 'completed') {
    if (attempt === specification.maxAttempts) {
      return seal({ ...base, state: 'VERIFIED_FAIL', terminal: true, outcome: 'ORCHESTRATION_TIMEOUT', failure_class: 'ORCHESTRATION_TIMEOUT' });
    }
    return seal({ ...base, state: 'RUNNING_VERIFIED', terminal: false, outcome: 'WAITING_FOR_PRODUCER', failure_class: null });
  }
  if (run.conclusion !== 'success') {
    return seal({ ...base, state: 'VERIFIED_FAIL', terminal: true, outcome: 'PRODUCER_TERMINAL_FAILURE', failure_class: 'PRODUCER_TERMINAL_FAILURE' });
  }

  if (!Array.isArray(observation?.artifacts) || observation.artifacts.length > 100) fail('ARTIFACT_EVIDENCE_INVALID');
  const matches = observation.artifacts.filter((artifact) => artifact?.name === specification.artifactName);
  const expiredMatches = matches.filter((artifact) => artifact?.expired === true);
  const artifactBase = receiptBase(specification, {
    attempt,
    matchedRunCount: exactRuns.length,
    run,
    artifactMatchCount: matches.length,
    expiredArtifactCount: expiredMatches.length,
    artifact: matches.length === 1 ? matches[0] : null,
  });
  if (matches.length > 1) {
    return seal({ ...artifactBase, state: 'VERIFIED_FAIL', terminal: true, outcome: 'ARTIFACT_CARDINALITY_INVALID', failure_class: 'ARTIFACT_CARDINALITY_INVALID' });
  }
  if (matches.length === 1) validateArtifactShape(matches[0], run, specification, { allowExpired: true });
  if (matches.length === 0) {
    if (attempt === specification.maxAttempts) {
      return seal({ ...artifactBase, state: 'VERIFIED_FAIL', terminal: true, outcome: 'ARTIFACT_MISSING', failure_class: 'ARTIFACT_MISSING' });
    }
    return seal({ ...artifactBase, state: 'RUNNING_VERIFIED', terminal: false, outcome: 'WAITING_FOR_ARTIFACT', failure_class: null });
  }
  if (expiredMatches.length === 1) {
    return seal({ ...artifactBase, state: 'VERIFIED_FAIL', terminal: true, outcome: 'ARTIFACT_EXPIRED', failure_class: 'ARTIFACT_EXPIRED' });
  }
  const artifact = validateArtifactShape(matches[0], run, specification);
  const passBase = receiptBase(specification, {
    attempt,
    matchedRunCount: exactRuns.length,
    run,
    artifactMatchCount: 1,
    artifact,
  });
  return seal({ ...passBase, state: 'VERIFIED_PASS', terminal: true, outcome: 'EXACT_GENERATION_ARTIFACT_AVAILABLE', failure_class: null });
}

export function validateReceipt(receipt) {
  if (!receipt || receipt.id !== 'kidults-asi-exact-generation-orchestration-receipt-v1' || receipt.version !== '1.0.0') fail('RECEIPT_IDENTITY_INVALID');
  const allowedKeys = new Set(RECEIPT_KEYS);
  if (receipt.state === 'VERIFIED_PASS_LOCAL_FIXTURE') {
    allowedKeys.add('fixture_path');
    allowedKeys.add('fixture_digest');
  }
  if (Object.hasOwn(receipt, 'bounded_failure_detail')) allowedKeys.add('bounded_failure_detail');
  const keys = Object.keys(receipt);
  if (keys.length !== allowedKeys.size || keys.some((key) => !allowedKeys.has(key))) fail('RECEIPT_FIELDS_INVALID');
  validateSpecification({
    repository: receipt.repository,
    consumerId: receipt.consumer_id,
    workflowPath: receipt.producer_workflow_path,
    workflowName: receipt.producer_workflow_name,
    artifactName: receipt.artifact_name,
    branch: receipt.producer_branch,
    expectedSha: receipt.expected_producer_sha,
    expectedBaseSha: receipt.expected_base_sha,
    expectedHeadSha: receipt.expected_head_sha,
    expectedGenerationSha: receipt.expected_generation_sha,
    triggerExpected: receipt.trigger_expected,
    maxAttempts: receipt.max_attempts,
    pollMilliseconds: 0,
  });
  integer(receipt.attempts_completed, 'RECEIPT_ATTEMPTS_INVALID', 1, receipt.max_attempts);
  integer(receipt.matched_run_count, 'RECEIPT_RUN_COUNT_INVALID', 0, 100);
  integer(receipt.artifact_match_count, 'RECEIPT_ARTIFACT_COUNT_INVALID', 0, 100);
  integer(receipt.expired_artifact_count, 'RECEIPT_EXPIRED_ARTIFACT_COUNT_INVALID', 0, receipt.artifact_match_count);
  const digest = receipt.receipt_digest;
  const unsigned = { ...receipt };
  delete unsigned.receipt_digest;
  if (!DIGEST.test(digest || '') || stableDigest(unsigned) !== digest) fail('RECEIPT_DIGEST_INVALID');
  if (receipt.writes !== 0 || receipt.external_provider_requests !== 0) fail('RECEIPT_MUTATION_BOUNDARY_INVALID');
  if (receipt.production !== 'HOLD' || receipt.public_release !== 'HOLD' || receipt.g5 !== 'HOLD') fail('RECEIPT_RELEASE_BOUNDARY_INVALID');
  if (receipt.state === 'VERIFIED_PASS') {
    if (!receipt.terminal || receipt.outcome !== 'EXACT_GENERATION_ARTIFACT_AVAILABLE' || receipt.failure_class !== null) fail('RECEIPT_PASS_INVALID');
    if (!Number.isSafeInteger(receipt.selected_run_id) || !Number.isSafeInteger(receipt.selected_artifact_id) || !DIGEST.test(receipt.selected_artifact_digest || '')) fail('RECEIPT_PASS_BINDING_INVALID');
  } else if (receipt.state === 'VERIFIED_FAIL') {
    if (!receipt.terminal || !['TRIGGER_MISSING', 'PRODUCER_NOT_CREATED', 'PRODUCER_TERMINAL_FAILURE', 'ARTIFACT_MISSING', 'ARTIFACT_EXPIRED', 'ARTIFACT_CARDINALITY_INVALID', 'ORCHESTRATION_TIMEOUT', 'MALFORMED_EVIDENCE', 'TRANSPORT_FAILURE'].includes(receipt.failure_class)) fail('RECEIPT_FAILURE_INVALID');
  } else if (receipt.state === 'RUNNING_VERIFIED') {
    if (receipt.terminal || receipt.failure_class !== null) fail('RECEIPT_WAITING_INVALID');
  } else if (receipt.state === 'VERIFIED_PASS_LOCAL_FIXTURE') {
    if (!receipt.terminal || receipt.outcome !== 'PR_LOCAL_FIXTURE_VALIDATED' || !DIGEST.test(receipt.fixture_digest || '') || receipt.external_provider_requests !== 0) fail('RECEIPT_FIXTURE_INVALID');
  } else {
    fail('RECEIPT_STATE_INVALID');
  }
  return true;
}

export function createLocalFixtureReceipt(specificationInput, fixturePath) {
  const specification = validateSpecification(specificationInput);
  const resolved = path.resolve(fixturePath);
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) fail('FIXTURE_NOT_REGULAR_FILE');
  const base = receiptBase(specification, { attempt: 1 });
  return seal({
    ...base,
    state: 'VERIFIED_PASS_LOCAL_FIXTURE',
    terminal: true,
    outcome: 'PR_LOCAL_FIXTURE_VALIDATED',
    failure_class: null,
    fixture_path: path.relative(process.cwd(), resolved).split(path.sep).join('/'),
    fixture_digest: sha256(fs.readFileSync(resolved)),
  });
}

async function requestJson(url, token, fetchImpl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'kidults-asi-exact-generation-orchestration-v1',
      },
    });
    if (!response.ok) fail('GITHUB_API_ERROR', response.status);
    const declaredLength = Number(response.headers.get('content-length') || 0);
    if (!Number.isSafeInteger(declaredLength) || declaredLength < 0 || declaredLength > MAX_API_RESPONSE_BYTES) fail('GITHUB_API_RESPONSE_TOO_LARGE');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > MAX_API_RESPONSE_BYTES) fail('GITHUB_API_RESPONSE_TOO_LARGE');
    try {
      return JSON.parse(bytes.toString('utf8'));
    } catch {
      fail('GITHUB_API_RESPONSE_INVALID');
    }
  } catch (error) {
    if (error instanceof OrchestrationError) throw error;
    fail(error?.name === 'AbortError' ? 'TRANSPORT_TIMEOUT' : 'TRANSPORT_FAILURE', error?.name || 'UNKNOWN');
  } finally {
    clearTimeout(timeout);
  }
}

export async function resolveOrchestration(specificationInput, dependencies = {}) {
  const specification = validateSpecification(specificationInput);
  const token = dependencies.token || process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
  if (!token) fail('GITHUB_TOKEN_REQUIRED');
  const fetchImpl = dependencies.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') fail('FETCH_UNAVAILABLE');
  const sleep = dependencies.sleep || ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const workflowFile = path.basename(specification.workflowPath);
  const base = `https://api.github.com/repos/${specification.repository}/actions`;
  let lastReceipt = null;
  for (let attempt = 1; attempt <= specification.maxAttempts; attempt += 1) {
    try {
      const query = new URLSearchParams({ branch: specification.branch, head_sha: specification.expectedGenerationSha, per_page: '100' });
      const runsPayload = await requestJson(`${base}/workflows/${encodeURIComponent(workflowFile)}/runs?${query}`, token, fetchImpl);
      if (!Array.isArray(runsPayload?.workflow_runs) || Number(runsPayload?.total_count) > 100 || Number(runsPayload?.total_count) !== runsPayload.workflow_runs.length) fail('RUN_EVIDENCE_INVALID');
      const exactRuns = runsPayload.workflow_runs;
      exactRuns.forEach((run) => validateRunShape(run, specification));
      const successful = exactRuns.filter((run) => run?.status === 'completed' && run?.conclusion === 'success')
        .sort((left, right) => Number(right.run_attempt) - Number(left.run_attempt) || Number(right.id) - Number(left.id));
      let artifacts = [];
      if (successful[0]) {
        const artifactPayload = await requestJson(`${base}/runs/${successful[0].id}/artifacts?per_page=100`, token, fetchImpl);
        if (!Array.isArray(artifactPayload?.artifacts) || Number(artifactPayload?.total_count) > 100 || Number(artifactPayload?.total_count) !== artifactPayload.artifacts.length) fail('ARTIFACT_EVIDENCE_INVALID');
        artifacts = artifactPayload.artifacts;
      }
      lastReceipt = classifyObservation(specification, { attempt, runs: exactRuns, artifacts });
    } catch (error) {
      const transportCodes = new Set(['TRANSPORT_TIMEOUT', 'TRANSPORT_FAILURE', 'GITHUB_API_ERROR']);
      const failureClass = error instanceof OrchestrationError && transportCodes.has(error.code) ? 'TRANSPORT_FAILURE' : 'MALFORMED_EVIDENCE';
      return seal({
        ...receiptBase(specification, { attempt }),
        state: 'VERIFIED_FAIL',
        terminal: true,
        outcome: failureClass,
        failure_class: failureClass,
        bounded_failure_detail: String(error?.code || error?.message || 'UNKNOWN').slice(0, 160),
      });
    }
    if (lastReceipt.terminal) return lastReceipt;
    if (specification.pollMilliseconds > 0) await sleep(specification.pollMilliseconds);
  }
  return lastReceipt;
}

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) fail('ARGUMENT_INVALID', token);
    const name = token.slice(2);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) fail('ARGUMENT_VALUE_REQUIRED', name);
    index += 1;
    if (values.has(name)) fail('ARGUMENT_DUPLICATE', name);
    values.set(name, value);
  }
  const required = ['mode', 'receipt', 'consumer-id', 'workflow-path', 'workflow-name', 'artifact-name', 'branch', 'expected-sha', 'expected-base-sha', 'expected-head-sha', 'expected-generation-sha'];
  for (const name of required) if (!values.get(name)) fail('ARGUMENT_REQUIRED', name);
  const mode = values.get('mode');
  if (!['live', 'pr-fixture'].includes(mode)) fail('MODE_INVALID', mode);
  if (mode === 'pr-fixture' && !values.get('fixture')) fail('ARGUMENT_REQUIRED', 'fixture');
  const triggerExpected = values.get('trigger-expected') || 'true';
  if (!['true', 'false'].includes(triggerExpected)) fail('TRIGGER_EXPECTED_INVALID');
  return {
    mode,
    receiptPath: values.get('receipt'),
    fixturePath: values.get('fixture'),
    specification: {
      repository: values.get('repository') || process.env.GITHUB_REPOSITORY,
      consumerId: values.get('consumer-id'),
      workflowPath: values.get('workflow-path'),
      workflowName: values.get('workflow-name'),
      artifactName: values.get('artifact-name'),
      branch: values.get('branch'),
      expectedSha: values.get('expected-sha'),
      expectedBaseSha: values.get('expected-base-sha'),
      expectedHeadSha: values.get('expected-head-sha'),
      expectedGenerationSha: values.get('expected-generation-sha'),
      triggerExpected: triggerExpected === 'true',
      maxAttempts: values.get('max-attempts') || 24,
      pollMilliseconds: values.get('poll-milliseconds') || 10_000,
    },
  };
}

function writeReceipt(receiptPath, receipt) {
  const resolved = path.resolve(receiptPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
}

async function main() {
  let parsed = null;
  try {
    parsed = parseArguments(process.argv.slice(2));
    const receipt = parsed.mode === 'pr-fixture'
      ? createLocalFixtureReceipt(parsed.specification, parsed.fixturePath)
      : await resolveOrchestration(parsed.specification);
    validateReceipt(receipt);
    writeReceipt(parsed.receiptPath, receipt);
    console.log(JSON.stringify(receipt, null, 2));
    if (!['VERIFIED_PASS', 'VERIFIED_PASS_LOCAL_FIXTURE'].includes(receipt.state)) process.exitCode = 1;
  } catch (error) {
    const transportCodes = new Set(['TRANSPORT_TIMEOUT', 'TRANSPORT_FAILURE', 'GITHUB_API_ERROR']);
    const failureClass = error instanceof OrchestrationError && transportCodes.has(error.code) ? 'TRANSPORT_FAILURE' : 'MALFORMED_EVIDENCE';
    if (parsed?.receiptPath) {
      const specification = validateSpecification(parsed.specification);
      const receipt = seal({
        ...receiptBase(specification, { attempt: 1 }),
        state: 'VERIFIED_FAIL',
        terminal: true,
        outcome: failureClass,
        failure_class: failureClass,
        bounded_failure_detail: String(error?.code || error?.message || 'UNKNOWN').slice(0, 160),
      });
      writeReceipt(parsed.receiptPath, receipt);
      console.error(JSON.stringify(receipt, null, 2));
    } else {
      console.error(`ASI_EXACT_GENERATION_ORCHESTRATION_FAILED:${error?.code || error?.message || 'UNKNOWN'}`);
    }
    process.exitCode = 1;
  }
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) await main();
