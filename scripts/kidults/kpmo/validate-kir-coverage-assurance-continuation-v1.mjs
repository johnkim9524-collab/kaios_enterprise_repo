#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {nativeWorkflowRunNameMatches} from '../source-intelligence/native-workflow-run-identity-v1.mjs';

const REPOSITORY = 'johnkim9524-collab/kaios_enterprise_repo';
const WORKFLOW_NAME = 'KIDULTS ASI Requirement-to-Adapter Coverage v1';
const WORKFLOW_PATH = '.github/workflows/kidults-asi-requirement-adapter-coverage-v1.yml';
const SHA = /^[a-f0-9]{40}$/;
const TREE = /^[a-f0-9]{40}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;

const fail = (code) => { throw new Error(code); };
const stable = (value) => Array.isArray(value)
  ? `[${value.map(stable).join(',')}]`
  : value && typeof value === 'object'
    ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`
    : JSON.stringify(value);
const hash = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const positive = (value, code) => {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || String(number) !== String(value)) fail(code);
  return number;
};
const exactObject = (value, code) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  return value;
};
const exactKeys = (value, keys, code) => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail(code);
};
const seal = (value) => ({...value, receipt_digest: hash(stable(value))});

function validateCoverageRun(run, expected, lifecycle) {
  exactObject(run, 'COVERAGE_RUN_REQUIRED');
  if (run.id !== expected.runId) fail('COVERAGE_RUN_ID_MISMATCH');
  if (run.run_attempt !== expected.runAttempt) fail('COVERAGE_RUN_ATTEMPT_MISMATCH');
  if (run.repository?.full_name !== REPOSITORY || run.head_repository?.full_name !== REPOSITORY) fail('COVERAGE_REPOSITORY_MISMATCH');
  if (run.path !== WORKFLOW_PATH || !nativeWorkflowRunNameMatches(run, WORKFLOW_NAME, WORKFLOW_PATH)) fail('COVERAGE_WORKFLOW_IDENTITY_MISMATCH');
  if (run.head_branch !== 'main' || run.head_sha !== expected.sourceSha) fail('COVERAGE_SOURCE_MISMATCH');
  if (run.event !== 'workflow_run') fail('COVERAGE_EVENT_NOT_AUTHORITATIVE');
  if (!Number.isFinite(Date.parse(run.created_at || ''))) fail('COVERAGE_CREATED_AT_INVALID');
  if (lifecycle === 'issuing') {
    if (!['queued', 'in_progress', 'completed'].includes(run.status)) fail('COVERAGE_ISSUE_LIFECYCLE_INVALID');
    if (run.status === 'completed' && run.conclusion !== 'success') fail('COVERAGE_ISSUE_NOT_SUCCESS');
  } else if (run.status !== 'completed' || run.conclusion !== 'success') fail('COVERAGE_NOT_SUCCESS');
}

export function issueKirCoverageAssuranceContinuation(input) {
  exactObject(input, 'ISSUE_INPUT_REQUIRED');
  if (input.repository !== REPOSITORY) fail('ISSUE_REPOSITORY_MISMATCH');
  if (!SHA.test(input.source_sha || '')) fail('ISSUE_SOURCE_SHA_INVALID');
  if (!TREE.test(input.source_tree || '')) fail('ISSUE_SOURCE_TREE_INVALID');
  const runId = positive(input.coverage_run_id, 'ISSUE_RUN_ID_INVALID');
  const runAttempt = positive(input.coverage_run_attempt, 'ISSUE_RUN_ATTEMPT_INVALID');
  validateCoverageRun(input.run, {runId, runAttempt, sourceSha: input.source_sha}, 'issuing');
  const identity = {
    repository: REPOSITORY,
    coverage_workflow_path: WORKFLOW_PATH,
    coverage_run_id: runId,
    coverage_run_attempt: runAttempt,
    source_sha: input.source_sha,
    source_tree: input.source_tree,
  };
  return seal({
    id: 'kidults-kir-coverage-assurance-continuation-v1', version: '1.0.0',
    state: 'ISSUED_PENDING_ONE_TIME_CONSUMPTION', artifact_role: 'ASSURANCE_CONTINUATION_REQUEST',
    ...identity, coverage_created_at: input.run.created_at,
    continuation_key: hash(stable({domain: 'KIR_COVERAGE_ASSURANCE_CONTINUATION_V1', ...identity})),
    authoritative_coverage_required: true, classification_only_success_accepted: false,
    one_time_consumption_required: true, promotion_eligible: false,
    public: 'HOLD', production: 'HOLD', g5: 'HOLD',
  });
}

export function consumeKirCoverageAssuranceContinuation(input) {
  exactObject(input, 'CONSUME_INPUT_REQUIRED');
  const request = exactObject(input.request, 'CONSUME_REQUEST_REQUIRED');
  const current = exactObject(input.current, 'CONSUME_CURRENT_REQUIRED');
  const artifact = exactObject(input.dispatch_artifact, 'CONSUME_ARTIFACT_REQUIRED');
  const receipt = exactObject(input.dispatch_receipt, 'CONSUME_RECEIPT_REQUIRED');
  const consumer = exactObject(input.consumer, 'CONSUME_CONSUMER_REQUIRED');
  if (current.repository !== REPOSITORY || request.repository !== REPOSITORY) fail('CONSUME_REPOSITORY_MISMATCH');
  if (!SHA.test(current.source_sha || '') || request.source_sha !== current.source_sha) fail('CONSUME_STALE_SOURCE_SHA');
  if (!TREE.test(current.source_tree || '') || request.source_tree !== current.source_tree) fail('CONSUME_STALE_SOURCE_TREE');
  const runId = positive(request.coverage_run_id, 'CONSUME_RUN_ID_INVALID');
  const runAttempt = positive(request.coverage_run_attempt, 'CONSUME_RUN_ATTEMPT_INVALID');
  validateCoverageRun(input.run, {runId, runAttempt, sourceSha: current.source_sha}, 'consume');
  if (request.coverage_created_at !== input.run.created_at) fail('CONSUME_CREATED_AT_MISMATCH');
  const artifactId = positive(request.dispatch_artifact_id, 'CONSUME_ARTIFACT_ID_INVALID');
  const artifactName = `kidults-kir-coverage-assurance-dispatch-v1-${runId}-${runAttempt}`;
  if (artifact.id !== artifactId || artifact.name !== artifactName || artifact.expired !== false ||
      artifact.workflow_run?.id !== runId || artifact.workflow_run?.head_sha !== current.source_sha) fail('CONSUME_ARTIFACT_BINDING_MISMATCH');
  if (!DIGEST.test(request.dispatch_artifact_digest || '') || artifact.digest !== request.dispatch_artifact_digest) fail('CONSUME_ARTIFACT_DIGEST_MISMATCH');
  if (receipt.id !== 'kidults-kir-coverage-assurance-continuation-v1' || receipt.version !== '1.0.0' ||
      receipt.state !== 'ISSUED_PENDING_ONE_TIME_CONSUMPTION' || receipt.artifact_role !== 'ASSURANCE_CONTINUATION_REQUEST') fail('CONSUME_RECEIPT_IDENTITY');
  exactKeys(receipt, ['id', 'version', 'state', 'artifact_role', 'repository', 'coverage_workflow_path',
    'coverage_run_id', 'coverage_run_attempt', 'source_sha', 'source_tree', 'coverage_created_at',
    'continuation_key', 'authoritative_coverage_required', 'classification_only_success_accepted',
    'one_time_consumption_required', 'promotion_eligible', 'public', 'production', 'g5', 'receipt_digest'],
  'CONSUME_RECEIPT_FIELDS_NOT_EXACT');
  const unsigned = structuredClone(receipt);
  delete unsigned.receipt_digest;
  if (!DIGEST.test(receipt.receipt_digest || '') || receipt.receipt_digest !== hash(stable(unsigned))) fail('CONSUME_RECEIPT_DIGEST_INVALID');
  for (const [key, value] of Object.entries({repository: REPOSITORY, coverage_workflow_path: WORKFLOW_PATH,
    coverage_run_id: runId, coverage_run_attempt: runAttempt, source_sha: current.source_sha,
    source_tree: current.source_tree, coverage_created_at: input.run.created_at})) {
    if (receipt[key] !== value) fail(`CONSUME_RECEIPT_BINDING_${key.toUpperCase()}`);
  }
  if (receipt.authoritative_coverage_required !== true || receipt.classification_only_success_accepted !== false ||
      receipt.one_time_consumption_required !== true || receipt.promotion_eligible !== false ||
      receipt.public !== 'HOLD' || receipt.production !== 'HOLD' || receipt.g5 !== 'HOLD') fail('CONSUME_AUTHORITY_BOUNDARY');
  const expectedContinuationKey = hash(stable({domain: 'KIR_COVERAGE_ASSURANCE_CONTINUATION_V1',
    repository: REPOSITORY, coverage_workflow_path: WORKFLOW_PATH, coverage_run_id: runId,
    coverage_run_attempt: runAttempt, source_sha: current.source_sha, source_tree: current.source_tree}));
  if (request.continuation_key !== receipt.continuation_key || receipt.continuation_key !== expectedContinuationKey ||
      !DIGEST.test(receipt.continuation_key || '')) fail('CONSUME_CONTINUATION_KEY_MISMATCH');
  if (input.prior_consumption_count !== 0) fail('CONSUME_REPLAY_DETECTED');
  const consumerRunId = positive(consumer.run_id, 'CONSUMER_RUN_ID_INVALID');
  const consumerRunAttempt = positive(consumer.run_attempt, 'CONSUMER_RUN_ATTEMPT_INVALID');
  return seal({
    id: 'kidults-kir-coverage-assurance-consumption-v1', version: '1.0.0', state: 'CONSUMED_VERIFIED',
    repository: REPOSITORY, source_sha: current.source_sha, source_tree: current.source_tree,
    coverage_run_id: runId, coverage_run_attempt: runAttempt, coverage_artifact_id: artifactId,
    coverage_artifact_digest: request.dispatch_artifact_digest, continuation_key: receipt.continuation_key,
    continuation_receipt_digest: receipt.receipt_digest,
    consumer_workflow_run_id: consumerRunId, consumer_workflow_run_attempt: consumerRunAttempt,
    input_validated: true, receipt_verified: true, one_time_consumed: true, prior_consumption_count: 0,
    authoritative_coverage_verified: true, classification_only_success_accepted: false,
    promotion_eligible: false, public: 'HOLD', production: 'HOLD', g5: 'HOLD',
  });
}

function parseArgs(argv) {
  const [mode, ...rest] = argv;
  const args = {mode, input: '', output: ''};
  for (let index = 0; index < rest.length; index += 2) {
    if (!['--input', '--output'].includes(rest[index]) || !rest[index + 1]) fail('ARGUMENTS_INVALID');
    args[rest[index].slice(2)] = rest[index + 1];
  }
  if (!['issue', 'consume'].includes(mode) || !args.input || !args.output) fail('ARGUMENTS_REQUIRED');
  return args;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs(process.argv.slice(2));
  const input = JSON.parse(fs.readFileSync(args.input, 'utf8'));
  const output = args.mode === 'issue' ? issueKirCoverageAssuranceContinuation(input) : consumeKirCoverageAssuranceContinuation(input);
  fs.mkdirSync(path.dirname(args.output), {recursive: true});
  fs.writeFileSync(args.output, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(output)}\n`);
}
