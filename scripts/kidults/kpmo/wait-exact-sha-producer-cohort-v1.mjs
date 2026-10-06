#!/usr/bin/env node
import process from 'node:process';
import {SPECS, workflowRuns} from './resolve-continuous-assurance-sentinel-health-v1.mjs';

const DEFAULT_MAX_WAIT_SECONDS = 900;
const POLL_SECONDS = 15;

export function classifyProducerCohort(rows) {
  if (rows.some((row) => row.state === 'INDEX_ERROR')) return {state: 'INDEX_ERROR'};
  if (rows.some((row) => row.state === 'TERMINAL_FAILURE')) return {state: 'TERMINAL_FAILURE'};
  if (rows.length !== SPECS.length) return {state: 'PENDING'};
  if (rows.every((row) => row.state === 'SUCCESS')) return {state: 'SUCCESS'};
  return {state: 'PENDING'};
}

export function selectLatestExactRun(runs, spec, sha) {
  const candidates = runs
    .filter((run) => run.path === spec.path
      && run.head_branch === 'main'
      && run.head_sha === sha
      && spec.events.includes(run.event))
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id - b.id);
  return candidates.at(-1) ?? null;
}

export function triggerMatchesRun(run, spec, trigger = {}) {
  if (!trigger.path || trigger.path !== spec.path) return true;
  const expectedId = Number(trigger.id);
  const expectedAttempt = Number(trigger.attempt);
  return Number.isSafeInteger(expectedId) && expectedId > 0 &&
    Number.isSafeInteger(expectedAttempt) && expectedAttempt > 0 &&
    Boolean(run) && Number(run.id) === expectedId && Number(run.run_attempt) === expectedAttempt;
}

function producerState(run) {
  if (!run) return {state: 'PENDING', run_id: null};
  if (run.status !== 'completed') return {
    state: 'PENDING',
    run_id: Number(run.id),
    status: run.status,
    conclusion: run.conclusion ?? null
  };
  if (run.conclusion === 'success') return {
    state: 'SUCCESS',
    run_id: Number(run.id),
    status: run.status,
    conclusion: run.conclusion,
    attempt: Number(run.run_attempt)
  };
  return {
    state: 'TERMINAL_FAILURE',
    run_id: Number(run.id),
    status: run.status,
    conclusion: run.conclusion ?? null,
    attempt: Number(run.run_attempt)
  };
}

export async function readCohort(repo, sha, token, trigger = {}) {
  const rows = [];
  const triggerCreatedMs = Date.parse(trigger.createdAt || '');
  const dynamicWindow = Number.isFinite(triggerCreatedMs)
    ? {createdAfter: triggerCreatedMs - (45 * 60 * 1000), createdBefore: Date.now()}
    : {};
  for (const spec of SPECS) {
    try {
      const runs = await workflowRuns(repo, spec, sha, token,
        spec.cohort === 'DYNAMIC' ? dynamicWindow : {});
      const run = selectLatestExactRun(runs, spec, sha);
      // A workflow_run delivery is a causal edge, not a hint.  Bind the
      // triggering producer to the selected exact run so a later run with the
      // same SHA cannot silently replace the event's parent generation.
      if (!triggerMatchesRun(run, spec, trigger)) {
        rows.push({id: spec.id, state: 'INDEX_ERROR', failure_class: 'TRIGGER_RUN_NOT_SELECTED'});
        continue;
      }
      rows.push({id: spec.id, ...producerState(run)});
    } catch (error) {
      rows.push({id: spec.id, state: 'INDEX_ERROR', failure_class: String(error?.message || error)});
    }
  }
  return {source_sha: sha, producers: rows, ...classifyProducerCohort(rows)};
}

async function sleep(seconds) {
  await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

export async function waitForCohort({
  repo,
  sha,
  token,
  maxWaitSeconds = DEFAULT_MAX_WAIT_SECONDS,
  pollSeconds = POLL_SECONDS,
  read = readCohort,
  triggerRunId = '',
  triggerRunAttempt = '',
  triggerRunPath = '',
  triggerRunCreatedAt = ''
} = {}) {
  if (!repo || !sha || !token) throw new Error('COHORT_INPUT_MISSING');
  const deadline = Date.now() + maxWaitSeconds * 1000;
  while (true) {
    const snapshot = await read(repo, sha, token, {
      id: triggerRunId,
      attempt: triggerRunAttempt,
      path: triggerRunPath,
      createdAt: triggerRunCreatedAt
    });
    console.log(JSON.stringify(snapshot));
    if (snapshot.state === 'SUCCESS') return snapshot;
    if (snapshot.state === 'INDEX_ERROR') throw new Error('EXACT_SHA_PRODUCER_INDEX_INCOMPLETE');
    if (snapshot.state === 'TERMINAL_FAILURE') throw new Error('EXACT_SHA_PRODUCER_TERMINAL_FAILURE');
    if (Date.now() >= deadline) throw new Error('EXACT_SHA_PRODUCER_COHORT_TIMEOUT');
    await sleep(pollSeconds);
  }
}

async function main() {
  const sha = process.argv[2];
  const triggerRunId = process.argv[3] || '';
  const triggerRunAttempt = process.argv[4] || '';
  const triggerRunPath = process.argv[5] || '';
  const triggerRunCreatedAt = process.argv[6] || '';
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  try {
    const result = await waitForCohort({repo, sha, token, triggerRunId, triggerRunAttempt, triggerRunPath, triggerRunCreatedAt});
    console.log(`EXACT_SHA_PRODUCER_COHORT_READY=${result.source_sha}`);
  } catch (error) {
    console.error(String(error?.message || error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url) await main();
