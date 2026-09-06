#!/usr/bin/env node
import fs from 'node:fs';

const target = process.argv[2] || '.github/workflows/kidults-asi-throughput-coverage-autobalance-live-v1.yml';

function validate(text) {
  const failures = [];
  const requireText = (needle, label) => {
    if (!text.includes(needle)) failures.push(`missing ${label}`);
  };
  const rejectText = (needle, label) => {
    if (text.includes(needle)) failures.push(`forbidden ${label}`);
  };
  const rejectPattern = (pattern, label) => {
    if (pattern.test(text)) failures.push(`forbidden ${label}`);
  };

  rejectText('/actions/artifacts?per_page=100', 'repository-global artifact lookup');
  rejectText('-f status=success', 'single-shot success-only producer lookup');
  rejectText('/actions/workflows/kidults-asi-global-any-site-hourly-pooling-v1.yml/runs', 'retired v1 producer workflow lookup');
  rejectText('.path==".github/workflows/kidults-asi-global-any-site-hourly-pooling-v1.yml"', 'retired v1 producer path binding');
  rejectText('.name=="kidults-asi-global-any-site-source-pool-v1"', 'retired v1 source-pool artifact');
  rejectText('.name=="kidults-asi-global-any-site-hourly-cycle-v1"', 'retired v1 hourly-cycle artifact');
  rejectText('/actions/workflows/kidults-asi-global-any-site-hourly-pooling-v2.yml/runs', 'search-based producer selection');
  rejectText('AUTOBALANCE_PRODUCER_WAIT_MAX_ATTEMPTS', 'bounded producer polling');
  rejectText('AUTOBALANCE_PRODUCER_WAIT_SECONDS', 'bounded producer polling interval');
  rejectPattern(/\n  schedule:\s*\n/, 'independent consumer schedule');
  rejectPattern(/\n  workflow_dispatch:\s*\n/, 'independent consumer workflow_dispatch');

  requireText('workflow_run:', 'producer-driven workflow_run trigger');
  requireText('KIDULTS ASI Global Any-Site Hourly Pooling v2', 'canonical producer workflow trigger');
  requireText('types: [completed]', 'producer terminal trigger');
  requireText('branches: [main]', 'producer main-branch trigger');
  requireText("github.event.workflow_run.event == 'schedule'", 'canonical scheduled producer job gate');
  requireText('github.event.workflow_run.id', 'triggering producer run id binding');
  requireText('github.event.workflow_run.run_attempt', 'triggering producer run attempt binding');
  requireText('github.event.workflow_run.head_sha', 'triggering producer SHA binding');
  requireText('github.event.workflow_run.event', 'triggering producer event binding');
  requireText('/actions/runs/${TRIGGER_RUN_ID}', 'exact triggering producer run lookup');
  requireText('/actions/runs/${HOURLY_RUN_ID}/artifacts?per_page=100', 'run-scoped artifact lookup');
  requireText('.run_attempt==$attempt', 'exact producer run-attempt binding');
  requireText('.path==".github/workflows/kidults-asi-global-any-site-hourly-pooling-v2.yml"', 'canonical producer path binding');
  requireText('.name=="KIDULTS ASI Global Any-Site Hourly Pooling v2"', 'canonical producer name binding');
  requireText('.head_sha==$sha', 'exact producer SHA binding');
  requireText('.event=="schedule"', 'canonical producer event binding');
  requireText('.status=="completed"', 'producer terminal status binding');
  requireText('.conclusion=="success"', 'producer terminal success binding');
  requireText('test "$GITHUB_REF" = "refs/heads/main"', 'protected-main consumer gate');
  requireText('/branches/main', 'live current-main read-back');
  requireText('CURRENT_MAIN_ADVANCED_BEFORE_AUTOBALANCE', 'stale-main fail-closed diagnosis');

  for (const artifactName of ['kidults-asi-global-any-site-source-pool-v2','kidults-asi-global-any-site-hourly-cycle-v2']) {
    requireText(`.name=="${artifactName}"`, `${artifactName} selection`);
  }
  const cardinalityMatches = text.match(/\]\s*\|\s*if length==1 then \.\[0\] else empty end/g) || [];
  if (cardinalityMatches.length < 2) failures.push('missing exact artifact cardinality for both producer artifacts');

  requireText('^sha256:[0-9a-f]{64}$', 'provider artifact digest validation');
  requireText('sha256sum /tmp/meta.zip', 'downloaded metadata archive digest verification');
  requireText('sha256sum /tmp/disc.zip', 'downloaded discovery archive digest verification');
  requireText('UNSAFE_ZIP_MEMBER', 'unsafe archive-member rejection');
  requireText('test "${#MATCHES[@]}" -eq 1', 'canonical gate member cardinality');
  requireText('test "${#DISC_MATCHES[@]}" -eq 1', 'discovery member cardinality');
  requireText("status: 'VERIFIED_EXACT_TRIGGERING_PRODUCER_BINDING'", 'exact triggering producer provenance receipt status');
  requireText('run_attempt: Number(process.env.AUTOBALANCE_HOURLY_RUN_ATTEMPT)', 'producer run-attempt receipt binding');
  requireText('event: process.env.AUTOBALANCE_HOURLY_TRIGGER_EVENT', 'producer event receipt binding');
  requireText('mixed_generation_allowed: false', 'mixed-generation prohibition');
  requireText('empirical_authority: false', 'empirical authority prohibition');
  requireText('provider_authority: false', 'provider authority prohibition');
  requireText('/tmp/asi-throughput-autobalance-provenance-v1.json', 'provenance receipt artifact');
  requireText('kidults-asi-throughput-autobalance-trigger-envelope-v1', 'terminal trigger envelope');
  requireText("public_release: 'HOLD'", 'public HOLD');
  requireText("production: 'HOLD'", 'production HOLD');
  requireText("g5: 'HOLD'", 'G5 HOLD');

  const liveBoundaryMatches = text.match(/if: github\.event_name == 'workflow_run'/g) || [];
  if (liveBoundaryMatches.length < 5) failures.push('missing PR structural/live execution separation');

  return failures;
}

const text = fs.readFileSync(target, 'utf8');
const failures = validate(text);
if (failures.length) {
  console.error('ASI throughput autobalance provenance: FAIL');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const mutations = [
  ['/actions/runs/${HOURLY_RUN_ID}/artifacts?per_page=100','/actions/artifacts?per_page=100'],
  ['.run_attempt==$attempt','.run_attempt>0'],
  ['.head_sha==$sha','.head_branch=="main"'],
  ['if length==1 then .[0] else empty end','.[0] // empty'],
  ['.path==".github/workflows/kidults-asi-global-any-site-hourly-pooling-v2.yml"','.head_branch=="main"'],
  ['.event=="schedule"','.event!="pull_request"'],
  ['CURRENT_MAIN_ADVANCED_BEFORE_AUTOBALANCE','CURRENT_MAIN_CHANGED'],
  ['mixed_generation_allowed: false','mixed_generation_allowed: true'],
  ['empirical_authority: false','empirical_authority: true'],
  ['provider_authority: false','provider_authority: true'],
  ["status: 'VERIFIED_EXACT_TRIGGERING_PRODUCER_BINDING'","status: 'VERIFIED_EXACT_PRODUCER_BINDING'"]
];

for (const [from, to] of mutations) {
  if (!text.includes(from)) {
    console.error(`ASI throughput autobalance provenance self-test fixture missing: ${from}`);
    process.exit(1);
  }
  const mutated = text.replace(from, to);
  if (validate(mutated).length === 0) {
    console.error(`ASI throughput autobalance provenance self-test failed to reject mutation: ${from} -> ${to}`);
    process.exit(1);
  }
}

const scheduleMutation = text.replace('on:\n  workflow_run:', "on:\n  schedule:\n    - cron: '47 * * * *'\n  workflow_run:");
if (validate(scheduleMutation).length === 0) {
  console.error('ASI throughput autobalance provenance self-test failed to reject independent schedule reintroduction');
  process.exit(1);
}

const dispatchMutation = text.replace('on:\n  workflow_run:', 'on:\n  workflow_dispatch:\n  workflow_run:');
if (validate(dispatchMutation).length === 0) {
  console.error('ASI throughput autobalance provenance self-test failed to reject independent workflow_dispatch reintroduction');
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'VERIFIED_PASS',
  control: 'ASI_THROUGHPUT_AUTOBALANCE_EXACT_TRIGGERING_PRODUCER_PROVENANCE',
  mutation_cases_rejected: mutations.length + 2,
  pr_validation_mode: 'STRUCTURAL_AND_NEGATIVE_ONLY',
  live_consumption_mode: 'TERMINAL_SCHEDULED_HOURLY_PRODUCER_WORKFLOW_RUN_ONLY',
  producer_selection: 'EXACT_TRIGGER_RUN_ID_ATTEMPT_SHA_EVENT',
  stale_main: 'FAIL_CLOSED',
  independent_consumer_schedule: 'REMOVED',
  production: 'HOLD',
  public_release: 'HOLD',
  g5: 'HOLD'
}, null, 2));
