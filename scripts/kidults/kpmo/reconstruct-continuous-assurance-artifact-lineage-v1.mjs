#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const DIGEST = /^sha256:[a-f0-9]{64}$/;
const SHA = /^[a-f0-9]{40}$/;
const POSITIVE = /^[1-9][0-9]*$/;
const MAX_RESULTS = 100;

function fail(code, detail = '') {
  throw new Error(detail ? `${code}:${detail}` : code);
}

function positive(value, code) {
  const text = String(value ?? '').trim();
  if (!POSITIVE.test(text)) fail(code, text || 'EMPTY');
  return Number(text);
}

function exactArtifactMetadata(left, right) {
  for (const key of ['id', 'name', 'size_in_bytes', 'digest', 'expired', 'expires_at']) {
    if (left?.[key] !== right?.[key]) fail(`RUN_SCOPED_ARTIFACT_${key.toUpperCase()}_MISMATCH`);
  }
}

export function reconstructArtifactLineage(input) {
  const artifact = structuredClone(input?.repository_artifact ?? fail('REPOSITORY_ARTIFACT_REQUIRED'));
  const run = input?.run ?? fail('RUN_REQUIRED');
  const index = input?.run_artifact_index ?? fail('RUN_ARTIFACT_INDEX_REQUIRED');
  const receipt = input?.receipt ?? fail('RECEIPT_REQUIRED');
  const artifactId = positive(artifact.id, 'ARTIFACT_ID_INVALID');
  const runId = positive(run.id, 'RUN_ID_INVALID');
  const runAttempt = positive(run.run_attempt, 'RUN_ATTEMPT_INVALID');
  const receiptRunId = positive(receipt?.execution?.workflow_run_id, 'RECEIPT_RUN_ID_INVALID');
  const receiptRunAttempt = positive(receipt?.execution?.workflow_run_attempt, 'RECEIPT_RUN_ATTEMPT_INVALID');
  if (receiptRunId !== runId) fail('RECEIPT_RUN_ID_MISMATCH');
  if (receiptRunAttempt !== runAttempt) fail('RECEIPT_RUN_ATTEMPT_MISMATCH');
  if (!SHA.test(run.head_sha ?? '')) fail('RUN_HEAD_SHA_INVALID');
  if (receipt?.source?.sha !== run.head_sha || receipt?.source?.expected_sha !== run.head_sha ||
      receipt?.source?.actual_sha !== run.head_sha || receipt?.source?.match !== true) {
    fail('RECEIPT_RUN_SOURCE_MISMATCH');
  }
  if (!DIGEST.test(artifact.digest ?? '')) fail('ARTIFACT_DIGEST_INVALID');
  if (artifact.expired !== false) fail('ARTIFACT_EXPIRED');

  if (artifact.workflow_run != null) {
    if (Number(artifact.workflow_run.id) !== runId || artifact.workflow_run.head_sha !== run.head_sha) {
      fail('EMBEDDED_ARTIFACT_LINEAGE_CONTRADICTION');
    }
  }

  if (!Number.isSafeInteger(index.total_count) || index.total_count < 0 || index.total_count > MAX_RESULTS) {
    fail('RUN_SCOPED_ARTIFACT_TOTAL_INVALID');
  }
  if (!Array.isArray(index.artifacts) || index.total_count !== index.artifacts.length) {
    fail('RUN_SCOPED_ARTIFACT_READBACK_INCOMPLETE');
  }
  const matches = index.artifacts.filter((candidate) => Number(candidate?.id) === artifactId);
  if (matches.length !== 1) fail('RUN_SCOPED_ARTIFACT_MEMBERSHIP_NOT_EXACT', String(matches.length));
  exactArtifactMetadata(artifact, matches[0]);
  if (matches[0].workflow_run != null &&
      (Number(matches[0].workflow_run.id) !== runId || matches[0].workflow_run.head_sha !== run.head_sha)) {
    fail('RUN_SCOPED_EMBEDDED_LINEAGE_CONTRADICTION');
  }

  artifact.workflow_run = { id: runId, head_sha: run.head_sha };
  artifact.lineage_resolution = 'RUN_SCOPED_ARTIFACT_MEMBERSHIP';
  artifact.lineage_run_attempt = runAttempt;
  return artifact;
}

function parseArgs(argv) {
  const args = {};
  const names = new Set(['artifact', 'run', 'run-artifacts', 'receipt', 'output']);
  for (let i = 0; i < argv.length; i += 2) {
    const name = String(argv[i] ?? '').replace(/^--/, '');
    const value = argv[i + 1];
    if (!names.has(name) || !value) fail('ARGUMENT_INVALID', name);
    args[name] = value;
  }
  for (const name of names) if (!args[name]) fail('ARGUMENT_REQUIRED', name);
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const read = (name) => JSON.parse(fs.readFileSync(args[name], 'utf8'));
  const result = reconstructArtifactLineage({
    repository_artifact: read('artifact'),
    run: read('run'),
    run_artifact_index: read('run-artifacts'),
    receipt: read('receipt'),
  });
  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${JSON.stringify(result)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({
    state: 'VERIFIED_PASS',
    artifact_id: result.id,
    run_id: result.workflow_run.id,
    lineage_resolution: result.lineage_resolution,
  })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

export { MAX_RESULTS };
