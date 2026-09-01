#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

function arg(name) {
  const i = process.argv.indexOf(name);
  if (i < 0 || !process.argv[i + 1]) throw new Error(`ARG_MISSING:${name}`);
  return process.argv[i + 1];
}
const runPath = arg('--run');
const jobsPath = arg('--jobs');
const outputPath = arg('--output');
const expectedSha = process.argv.includes('--expected-sha') ? arg('--expected-sha') : null;
const run = JSON.parse(fs.readFileSync(runPath, 'utf8'));
const jobsDoc = JSON.parse(fs.readFileSync(jobsPath, 'utf8'));
const jobs = Array.isArray(jobsDoc.jobs) ? jobsDoc.jobs : [];
const fail = m => { throw new Error(m); };
if (run.name !== 'KIDULTS Platform Continuous Assurance V1') fail('SOURCE_WORKFLOW_NAME');
if (run.path !== '.github/workflows/kidults-platform-continuous-assurance-v1.yml') fail('SOURCE_WORKFLOW_PATH');
if (run.repository?.full_name !== process.env.GITHUB_REPOSITORY && process.env.GITHUB_REPOSITORY) fail('SOURCE_REPOSITORY');
if (run.head_branch !== 'main') fail('SOURCE_HEAD_BRANCH');
if (!/^[a-f0-9]{40}$/.test(run.head_sha || '')) fail('SOURCE_HEAD_SHA');
if (expectedSha && run.head_sha !== expectedSha) fail('SOURCE_SHA_MISMATCH');
if (run.status !== 'completed') fail('SOURCE_NOT_TERMINAL');
if (!/^[1-9][0-9]*$/.test(String(run.id || ''))) fail('SOURCE_RUN_ID');
if (!/^[1-9][0-9]*$/.test(String(run.run_attempt || ''))) fail('SOURCE_RUN_ATTEMPT');

const bad = new Set(['failure','cancelled','timed_out','action_required','stale']);
const failedSteps = [];
for (const job of jobs) {
  for (const step of job.steps || []) {
    if (bad.has(step.conclusion)) failedSteps.push({job: job.name || 'UNKNOWN', step: step.name || 'UNKNOWN', conclusion: step.conclusion});
  }
}
const requiredPattern = /(exact source binding|canonical leader|upstream terminal binding|upstream terminal state|canonical truth|sharded reserve|requirement|shadow)/i;
const failedRequired = failedSteps.filter(x => requiredPattern.test(x.step));
let internal = 'CONTROL_ONLY_PASS';
let overall = 'HOLD';
const failedCheckIds = [];
if (run.conclusion !== 'success') {
  internal = 'VERIFIED_FAIL';
  overall = 'RED';
  if (failedRequired.length) {
    for (const row of failedRequired) failedCheckIds.push(`REQUIRED_STEP:${row.step}`);
  } else if (failedSteps.length) {
    for (const row of failedSteps) failedCheckIds.push(`FAILED_STEP:${row.step}`);
  } else {
    failedCheckIds.push('SOURCE_WORKFLOW_FAILURE_NO_FAILED_STEP_CAPTURE');
  }
}
if (run.conclusion === 'success' && failedSteps.length) fail('SUCCESS_WITH_FAILED_STEP');
const base = {
  schema_version: '1.0.0',
  receipt_type: 'KIDULTS_CONTINUOUS_ASSURANCE_TERMINAL_RECONCILIATION_V1',
  source: {
    repository: run.repository?.full_name || process.env.GITHUB_REPOSITORY || 'UNKNOWN',
    workflow_name: run.name,
    workflow_path: run.path,
    run_id: run.id,
    run_attempt: run.run_attempt,
    head_sha: run.head_sha,
    event: run.event,
    conclusion: run.conclusion,
  },
  terminal: {
    internal_control_state: internal,
    overall_state: overall,
    failed_check_ids: [...new Set(failedCheckIds)].sort(),
    failed_steps: failedSteps,
    required_step_failures: failedRequired,
    source_failure_dominates_generic_audit_pass: run.conclusion !== 'success',
    whole_platform_authority: false,
    promotion_eligible: false,
  },
  empirical_truth_effect: {
    graded_delta: 0,
    human_review_delta: 0,
    dated_sold_delta: 0,
    candidate_or_evidence_created: false,
    track_b_started: false,
    projection_approved: false,
  },
  boundary: { public: 'HOLD', production: 'HOLD', g5: 'EXPLICIT_APPROVAL_REQUIRED' },
};
const stable = v => Array.isArray(v) ? `[${v.map(stable).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}` : JSON.stringify(v);
const receipt = {...base, observed_at: new Date().toISOString(), receipt_digest: `sha256:${crypto.createHash('sha256').update(stable(base)).digest('hex')}`};
fs.mkdirSync(path.dirname(outputPath), {recursive:true});
fs.writeFileSync(outputPath, `${JSON.stringify(receipt,null,2)}\n`);
console.log(JSON.stringify({state: internal, source_conclusion: run.conclusion, failed_check_ids: receipt.terminal.failed_check_ids}));
