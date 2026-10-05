#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const REPOSITORY = process.env.GITHUB_REPOSITORY || '';
const SOURCE_SHA = process.env.KPMO_SOURCE_SHA || process.env.GITHUB_SHA || '';
const EVENT_NAME = process.env.GITHUB_EVENT_NAME || '';
const TOKEN = process.env.GH_TOKEN || '';
const WORKFLOW_FILE = 'kpmo-continuous-assurance-sentinel-health-v1.yml';
const WORKFLOW_NAME = 'KPMO Continuous Assurance Exact-SHA Producer Health Sentinel V1';
const RECEIPT_NAME = 'kpmo-continuous-assurance-sentinel-health-v1.json';
const SHA = /^[0-9a-f]{40}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const positive = value => Number.isSafeInteger(value) && value > 0;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const stable = value => Array.isArray(value)
  ? `[${value.map(stable).join(',')}]`
  : value && typeof value === 'object'
    ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`
    : JSON.stringify(value);
const digest = value => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const outputPath = process.env.KPMO_SENTINEL_BARRIER_OUTPUT ||
  path.join(process.env.RUNNER_TEMP || '/tmp', 'kpmo-sentinel-barrier.json');
const timeoutSeconds = Math.min(Math.max(Number(process.env.KPMO_SENTINEL_BARRIER_TIMEOUT_SECONDS || 900), 60), 1800);
const pollSeconds = Math.min(Math.max(Number(process.env.KPMO_SENTINEL_BARRIER_POLL_SECONDS || 10), 2), 60);
const cutoffWindowSeconds = 1800;

function writeReceipt(body) {
  fs.mkdirSync(path.dirname(outputPath), {recursive: true});
  const unsigned = {...body};
  delete unsigned.receipt_digest;
  fs.writeFileSync(outputPath, `${JSON.stringify({...body, receipt_digest: digest(stable(unsigned))}, null, 2)}\n`);
}
function fail(code, detail = null) {
  writeReceipt({
    schema_version: '1.0.0',
    receipt_type: 'KPMO_ASSURANCE_SENTINEL_ORDER_BARRIER',
    state: 'VERIFIED_FAIL',
    failure_class: code,
    detail,
    repository: REPOSITORY,
    source_sha: SOURCE_SHA,
    assurance_event: EVENT_NAME,
    barrier: 'SENTINEL_TERMINAL_BEFORE_ASSURANCE',
    observed_at: new Date().toISOString()
  });
  throw new Error(code);
}
function headers() {
  if (!TOKEN) throw new Error('ASSURANCE_SENTINEL_BARRIER_TOKEN_MISSING');
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${TOKEN}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'kidults-assurance-sentinel-order-barrier-v1'
  };
}
async function api(route) {
  const response = await fetch(`https://api.github.com${route}`, {headers: headers(), signal: AbortSignal.timeout(20000)});
  if (!response.ok) throw new Error(`ASSURANCE_SENTINEL_BARRIER_GITHUB_${response.status}`);
  return response.json();
}
async function artifactBytes(artifactId) {
  const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/actions/artifacts/${artifactId}/zip`, {
    headers: headers(), signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) throw new Error(`ASSURANCE_SENTINEL_BARRIER_ARTIFACT_${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}
function eventIssuedAt() {
  if (!process.env.GITHUB_EVENT_PATH) return null;
  const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const value = event?.client_payload?.issued_at;
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    if (EVENT_NAME === 'repository_dispatch') throw new Error('ASSURANCE_SENTINEL_BARRIER_ISSUED_AT_MISSING');
    return null;
  }
  return Date.parse(value);
}
function candidatesFrom(runs, cutoffMs) {
  return (runs || []).filter(run =>
    run?.name === WORKFLOW_NAME &&
    run?.path === `.github/workflows/${WORKFLOW_FILE}` &&
    run?.repository?.full_name === REPOSITORY &&
    run?.head_repository?.full_name === REPOSITORY &&
    run?.head_branch === 'main' &&
    run?.head_sha === SOURCE_SHA &&
    run?.event === 'repository_dispatch' &&
    positive(run?.id) &&
    run?.run_attempt === 1 &&
    Number.isFinite(Date.parse(run?.created_at || '')) &&
    Date.parse(run.created_at) <= cutoffMs &&
    Date.parse(run.created_at) >= cutoffMs - cutoffWindowSeconds * 1000
  ).sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
}
async function observe(run) {
  const artifacts = await api(`/repos/${REPOSITORY}/actions/runs/${run.id}/artifacts?per_page=100`);
  if (!Array.isArray(artifacts?.artifacts) || artifacts.total_count !== artifacts.artifacts.length) {
    throw new Error('ASSURANCE_SENTINEL_BARRIER_ARTIFACT_INDEX_TRUNCATED');
  }
  const expected = `kpmo-continuous-assurance-sentinel-health-v1-${SOURCE_SHA}-${run.id}-${run.run_attempt}`;
  const rows = artifacts.artifacts.filter(item =>
    item?.name === expected && item?.expired === false && item?.workflow_run?.id === run.id &&
    item?.workflow_run?.head_sha === SOURCE_SHA && DIGEST.test(item?.digest || '')
  );
  if (rows.length !== 1) throw new Error(`ASSURANCE_SENTINEL_BARRIER_ARTIFACT_CARDINALITY_${rows.length}`);
  const artifact = rows[0];
  const bytes = await artifactBytes(artifact.id);
  const reader = spawnSync('python3', ['scripts/kidults/kpmo/read-sentinel-artifact-v1.py', artifact.digest], {
    input: bytes, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024
  });
  if (reader.status !== 0) throw new Error('ASSURANCE_SENTINEL_BARRIER_ARCHIVE_INVALID');
  let archive;
  try { archive = JSON.parse(reader.stdout); } catch { throw new Error('ASSURANCE_SENTINEL_BARRIER_ARCHIVE_INDEX_INVALID'); }
  const member = (archive.members || []).find(item => path.posix.basename(item.name || '') === RECEIPT_NAME);
  if (!member || typeof member.text !== 'string') throw new Error('ASSURANCE_SENTINEL_BARRIER_RECEIPT_MISSING');
  let receipt;
  try { receipt = JSON.parse(member.text); } catch { throw new Error('ASSURANCE_SENTINEL_BARRIER_RECEIPT_JSON_INVALID'); }
  const unsigned = {...receipt};
  delete unsigned.receipt_digest;
  if (!DIGEST.test(receipt.receipt_digest || '') || receipt.receipt_digest !== digest(stable(unsigned))) {
    throw new Error('ASSURANCE_SENTINEL_BARRIER_RECEIPT_DIGEST_INVALID');
  }
  if (receipt.receipt_id !== 'kpmo-continuous-assurance-sentinel-health-v1' ||
      receipt.state !== 'VERIFIED_PASS' || receipt.source_sha !== SOURCE_SHA ||
      receipt.observer_run_id !== run.id || receipt.observer_run_attempt !== run.run_attempt ||
      receipt.semantic_content_verified !== true || receipt.producer_cohort_bound !== true ||
      !Array.isArray(receipt.producers) || receipt.producers.length !== 4 ||
      receipt.producers.some(item => item?.state !== 'VERIFIED_PASS')) {
    throw new Error('ASSURANCE_SENTINEL_BARRIER_RECEIPT_NOT_PASS');
  }
  return {
    schema_version: '1.0.0',
    receipt_type: 'KPMO_ASSURANCE_SENTINEL_ORDER_BARRIER',
    state: 'VERIFIED_PASS',
    repository: REPOSITORY,
    source_sha: SOURCE_SHA,
    assurance_event: EVENT_NAME,
    barrier: 'SENTINEL_TERMINAL_BEFORE_ASSURANCE',
    sentinel_run_id: run.id,
    sentinel_run_attempt: run.run_attempt,
    sentinel_event: run.event,
    sentinel_created_at: run.created_at,
    sentinel_conclusion: run.conclusion,
    sentinel_artifact_id: artifact.id,
    sentinel_artifact_digest: artifact.digest,
    sentinel_receipt_digest: receipt.receipt_digest,
    sentinel_receipt_state: receipt.state,
    observed_at: new Date().toISOString()
  };
}
async function main() {
  if (!REPOSITORY || !SOURCE_SHA || !SHA.test(SOURCE_SHA)) throw new Error('ASSURANCE_SENTINEL_BARRIER_SOURCE_INVALID');
  if (!['repository_dispatch', 'schedule'].includes(EVENT_NAME)) {
    writeReceipt({
      schema_version: '1.0.0',
      receipt_type: 'KPMO_ASSURANCE_SENTINEL_ORDER_BARRIER',
      state: 'VERIFIED_PASS',
      repository: REPOSITORY,
      source_sha: SOURCE_SHA,
      assurance_event: EVENT_NAME,
      barrier: 'NOT_APPLICABLE_NON_NATURAL_ASSURANCE',
      observed_at: new Date().toISOString()
    });
    return;
  }
  const issued = eventIssuedAt();
  const cutoffMs = issued ?? Date.now();
  const deadline = Date.now() + timeoutSeconds * 1000;
  let lastError = 'ASSURANCE_SENTINEL_BARRIER_NO_APPLICABLE_RUN';
  while (Date.now() <= deadline) {
    try {
      const listing = await api(`/repos/${REPOSITORY}/actions/workflows/${WORKFLOW_FILE}/runs?branch=main&event=repository_dispatch&head_sha=${SOURCE_SHA}&per_page=100`);
      const candidates = candidatesFrom(listing.workflow_runs, cutoffMs);
      const latest = candidates.at(-1);
      if (!latest) {
        lastError = 'ASSURANCE_SENTINEL_BARRIER_NO_APPLICABLE_RUN';
      } else if (latest.status !== 'completed') {
        lastError = 'ASSURANCE_SENTINEL_BARRIER_SENTINEL_NONTERMINAL';
      } else if (latest.conclusion !== 'success') {
        throw new Error(`ASSURANCE_SENTINEL_BARRIER_SENTINEL_${String(latest.conclusion || 'UNKNOWN').toUpperCase()}`);
      } else {
        const result = await observe(latest);
        writeReceipt(result);
        console.log(JSON.stringify({state: result.state, sentinel_run_id: result.sentinel_run_id, sentinel_receipt_digest: result.sentinel_receipt_digest}));
        return;
      }
    } catch (error) {
      if (String(error.message).startsWith('ASSURANCE_SENTINEL_BARRIER_SENTINEL_') ||
          String(error.message).includes('RECEIPT_NOT_PASS') ||
          String(error.message).includes('ARTIFACT_') ||
          String(error.message).includes('ARCHIVE_')) throw error;
      lastError = String(error.message || error);
    }
    await sleep(pollSeconds * 1000);
  }
  throw new Error(`${lastError}_TIMEOUT`);
}
try {
  await main();
} catch (error) {
  const failure = String(error?.message || error);
  fail(failure);
}
