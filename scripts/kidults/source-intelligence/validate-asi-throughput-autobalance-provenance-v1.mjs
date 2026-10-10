#!/usr/bin/env node
import fs from 'node:fs';

const target = process.argv[2] || '.github/workflows/kidults-asi-throughput-coverage-autobalance-live-v1.yml';
const selfDrivingPath = '.github/workflows/kidults-asi-self-driving-control-loop-v1.yml';
const discoveryPath = 'scripts/kidults/source-intelligence/asi-global-low-risk-discovery-v1.mjs';

function validate(text) {
  const failures = [];
  const requireText = (needle, label) => {
    if (!text.includes(needle)) failures.push(`missing ${label}`);
  };
  const rejectText = (needle, label) => {
    if (text.includes(needle)) failures.push(`forbidden ${label}`);
  };

  rejectText('/actions/artifacts?per_page=100', 'repository-global artifact lookup');
  rejectText('-f status=success', 'single-shot success-only producer lookup');
  rejectText('/actions/workflows/kidults-asi-global-any-site-hourly-pooling-v1.yml/runs', 'retired v1 producer workflow lookup');
  rejectText('.path==".github/workflows/kidults-asi-global-any-site-hourly-pooling-v1.yml"', 'retired v1 producer path binding');
  rejectText('.name=="kidults-asi-global-any-site-source-pool-v1"', 'retired v1 source-pool artifact');
  rejectText('.name=="kidults-asi-global-any-site-hourly-cycle-v1"', 'retired v1 hourly-cycle artifact');

  requireText('/actions/workflows/kidults-asi-global-any-site-hourly-pooling-v2.yml/runs', 'canonical producer workflow-run lookup');
  requireText('/actions/runs/${HOURLY_RUN_ID}/artifacts?per_page=100', 'run-scoped artifact lookup');
  requireText('.path==".github/workflows/kidults-asi-global-any-site-hourly-pooling-v2.yml"', 'canonical producer path binding');
  requireText('.name=="KIDULTS ASI Global Any-Site Hourly Pooling v2"', 'canonical producer name binding');
  requireText('.head_sha==$sha', 'exact producer SHA binding');
  requireText('EXPECTED_PRODUCER_SHA="$CURRENT_SHA"', 'current-main exact-generation binding');
  requireText('test "$GITHUB_REF" = "refs/heads/main"', 'non-PR protected-main gate');
  requireText('CURRENT_PROTECTED_MAIN_SHA="$(gh api "/repos/${GITHUB_REPOSITORY}/commits/main" --jq \'.sha\')"', 'protected-main source lookup');
  requireText('if [ "$CURRENT_PROTECTED_MAIN_SHA" != "$GITHUB_SHA" ]; then', 'stale scheduled source rejection');
  requireText('STALE_SCHEDULE_SOURCE_SHA:${GITHUB_SHA}:${CURRENT_PROTECTED_MAIN_SHA}', 'precise stale scheduled source diagnosis');
  requireText('FINAL_PROTECTED_MAIN_SHA="$(gh api "/repos/${GITHUB_REPOSITORY}/commits/main" --jq \'.sha\')"', 'final protected-main recheck');
  requireText('STALE_FINALIZATION_SOURCE_SHA:${GITHUB_SHA}:${FINAL_PROTECTED_MAIN_SHA}', 'finalization stale-source rejection');
  requireText('FINAL_PRODUCER_SHA_MISMATCH:${AUTOBALANCE_EXPECTED_PRODUCER_SHA}:${FINAL_PROTECTED_MAIN_SHA}', 'final producer-source mismatch rejection');
  requireText('final_protected_main_sha: process.env.FINAL_PROTECTED_MAIN_SHA', 'final protected-main receipt binding');
  const timeoutMatch = text.match(/timeout-minutes:\s*(\d+)/);
  const attemptsMatch = text.match(/AUTOBALANCE_PRODUCER_WAIT_MAX_ATTEMPTS=(\d+)/);
  const intervalMatch = text.match(/AUTOBALANCE_PRODUCER_WAIT_SECONDS=(\d+)/);
  if (!timeoutMatch) failures.push('missing bounded job timeout');
  if (!attemptsMatch) failures.push('missing bounded producer wait attempt cap');
  if (!intervalMatch) failures.push('missing bounded producer wait interval');
  if (timeoutMatch && attemptsMatch && intervalMatch) {
    const timeoutSeconds = Number(timeoutMatch[1]) * 60;
    const waitBudgetSeconds = Number(attemptsMatch[1]) * Number(intervalMatch[1]);
    if (waitBudgetSeconds < 35 * 60) {
      failures.push('producer wait budget does not cover the producer 35-minute timeout');
    }
    if (timeoutSeconds < waitBudgetSeconds + 2 * 60) {
      failures.push('job timeout does not preserve a two-minute post-wait finalization budget');
    }
  }
  requireText('for ATTEMPT in $(seq 1 "$AUTOBALANCE_PRODUCER_WAIT_MAX_ATTEMPTS")', 'bounded producer poll loop');
  requireText('sort_by(.created_at) | reverse | .[0] // empty', 'deterministic latest exact-generation producer selection');
  requireText('if [ "$HOURLY_RUN_STATUS" = "completed" ] && [ "$HOURLY_RUN_CONCLUSION" = "success" ]; then', 'producer success terminal gate');
  requireText('UPSTREAM_EXACT_GENERATION_TERMINAL_NON_SUCCESS', 'precise terminal non-success diagnosis');
  requireText('UPSTREAM_EXACT_GENERATION_NOT_TERMINAL', 'precise bounded-wait timeout diagnosis');
  requireText('sleep "$AUTOBALANCE_PRODUCER_WAIT_SECONDS"', 'bounded producer wait sleep');

  const prBoundaryMatches = text.match(/if: github\.event_name != 'pull_request'/g) || [];
  if (prBoundaryMatches.length < 5) failures.push('missing PR structural/live execution separation');

  for (const artifactName of ['kidults-asi-global-any-site-source-pool-v2','kidults-asi-global-any-site-hourly-cycle-v2']) {
    requireText(`.name=="${artifactName}"`, `${artifactName} selection`);
  }
  const cardinalityMatches = text.match(/\]\s*\|\s*if length==1 then \.\[0\] else empty end/g) || [];
  if (cardinalityMatches.length < 2) failures.push('missing exact artifact cardinality for both producer artifacts');

  requireText('.workflow_run.id==$run', 'artifact producer run binding');
  requireText('.workflow_run.head_sha==$sha', 'artifact producer SHA binding');
  requireText('^sha256:[0-9a-f]{64}$', 'provider artifact digest validation');
  requireText("status: 'VERIFIED_EXACT_PRODUCER_BINDING'", 'exact producer provenance receipt status');
  requireText('mixed_generation_allowed: false', 'mixed-generation prohibition');
  requireText('/tmp/asi-throughput-autobalance-provenance-v1.json', 'provenance receipt artifact');
  requireText("public_release: 'HOLD'", 'public HOLD');
  requireText("production: 'HOLD'", 'production HOLD');

  return failures;
}

const text = fs.readFileSync(target, 'utf8');
const failures = validate(text);
const selfDriving = fs.readFileSync(selfDrivingPath, 'utf8');
const discovery = fs.readFileSync(discoveryPath, 'utf8');
const requireConsumerText = (source, needle, label) => {
  if (!source.includes(needle)) failures.push(`missing ${label}`);
};
requireConsumerText(selfDriving, '--expected-source-sha "$GITHUB_SHA"', 'self-driving exact-source artifact selection');
requireConsumerText(selfDriving, "if: github.event_name != 'pull_request'", 'self-driving natural execution guard');
if (selfDriving.includes("if: github.event_name == 'workflow_dispatch'")) failures.push('self-driving schedule and push paths remain no-op');
requireConsumerText(selfDriving, 'STALE_CONSUMER_SOURCE_SHA:${GITHUB_SHA}:${CURRENT_PROTECTED_MAIN_SHA}', 'self-driving live-main stale-source guard');
if (selfDriving.indexOf('Reject stale scheduled or manual consumer source SHA')
    > selfDriving.indexOf('node scripts/kidults/supply-chain/restore-exact-github-artifact-v1.mjs')) {
  failures.push('self-driving stale-source guard must precede artifact restoration');
}
requireConsumerText(discovery, "process.env.GITHUB_REF==='refs/heads/main'?process.env.GITHUB_SHA:null", 'discovery exact-main source selection');
requireConsumerText(discovery, "'--expected-source-sha',currentMainSha", 'discovery exact-source artifact restore');
requireConsumerText(discovery, 'NON_MAIN_EXACT_SOURCE_BASELINE_ONLY', 'discovery non-main historical-artifact exclusion');
requireConsumerText(discovery, 'STALE_CONSUMER_SOURCE_SHA:${currentMainSha}:${currentMain.sha||\'MISSING\'}', 'discovery live-main stale-source rejection');
if (failures.length) {
  console.error('ASI throughput autobalance provenance: FAIL');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const mutations = [
  ['/actions/runs/${HOURLY_RUN_ID}/artifacts?per_page=100','/actions/artifacts?per_page=100'],
  ['.workflow_run.id==$run','.workflow_run.id>0'],
  ['.workflow_run.head_sha==$sha','.workflow_run.head_branch=="main"'],
  ['if length==1 then .[0] else empty end','.[0] // empty'],
  ['.path==".github/workflows/kidults-asi-global-any-site-hourly-pooling-v2.yml"','.head_branch=="main"'],
  ['EXPECTED_PRODUCER_SHA="$CURRENT_SHA"','EXPECTED_PRODUCER_SHA=""'],
  ['if [ "$CURRENT_PROTECTED_MAIN_SHA" != "$GITHUB_SHA" ]; then','if false; then'],
  ['mixed_generation_allowed: false','mixed_generation_allowed: true'],
  ['AUTOBALANCE_PRODUCER_WAIT_MAX_ATTEMPTS=210','AUTOBALANCE_PRODUCER_WAIT_MAX_ATTEMPTS=209'],
  ['AUTOBALANCE_PRODUCER_WAIT_SECONDS=10','AUTOBALANCE_PRODUCER_WAIT_SECONDS=9'],
  ['timeout-minutes: 40','timeout-minutes: 35'],
  ['sort_by(.created_at) | reverse | .[0] // empty','.[0] // empty'],
  ['UPSTREAM_EXACT_GENERATION_NOT_TERMINAL','UPSTREAM_NOT_FOUND']
];

for (const [from, to] of mutations) {
  if (!text.includes(from)) {
    console.error(`ASI throughput autobalance provenance self-test fixture missing: ${from}`);
    process.exit(1);
  }
  const mutated = text.split(from).join(to);
  if (validate(mutated).length === 0) {
    console.error(`ASI throughput autobalance provenance self-test failed to reject mutation: ${from} -> ${to}`);
    process.exit(1);
  }
}

const boundaryMutation = text.replaceAll("if: github.event_name != 'pull_request'", "if: always()");
if (validate(boundaryMutation).length === 0) {
  console.error('ASI throughput autobalance provenance self-test failed to reject PR live-execution boundary removal');
  process.exit(1);
}

const consumerMutations = [
  ['self-driving source binding', selfDriving.replace('--expected-source-sha "$GITHUB_SHA"', '--expected-source-sha "$PR_BASE_SHA"'), selfDriving],
  ['self-driving stale-main guard', selfDriving.replace('STALE_CONSUMER_SOURCE_SHA:${GITHUB_SHA}:${CURRENT_PROTECTED_MAIN_SHA}', 'STALE_CONSUMER_GUARD_REMOVED'), selfDriving],
  ['discovery source binding', discovery.replace("'--expected-source-sha',currentMainSha", "'--expected-source-sha',''"), discovery],
  ['discovery non-main exclusion', discovery.replace('NON_MAIN_EXACT_SOURCE_BASELINE_ONLY', 'ALLOW_HISTORICAL_NON_MAIN_ARTIFACTS'), discovery],
  ['discovery live-main readback', discovery.replace('STALE_CONSUMER_SOURCE_SHA:${currentMainSha}:${currentMain.sha||\'MISSING\'}', 'STALE_MAIN_CHECK_REMOVED'), discovery],
];
for (const [label, mutated, original] of consumerMutations) {
  if (mutated === original) {
    console.error(`ASI throughput autobalance provenance self-test fixture missing: ${label}`);
    process.exit(1);
  }
  const consumerFailures = [];
  if (label.startsWith('self-driving')) {
    if (!mutated.includes('--expected-source-sha "$GITHUB_SHA"')) consumerFailures.push('source');
    if (!mutated.includes('STALE_CONSUMER_SOURCE_SHA:${GITHUB_SHA}:${CURRENT_PROTECTED_MAIN_SHA}')) consumerFailures.push('guard');
  } else {
    if (!mutated.includes("'--expected-source-sha',currentMainSha")) consumerFailures.push('source');
    if (!mutated.includes('NON_MAIN_EXACT_SOURCE_BASELINE_ONLY')) consumerFailures.push('non-main');
    if (!mutated.includes('STALE_CONSUMER_SOURCE_SHA:${currentMainSha}:${currentMain.sha||\'MISSING\'}')) consumerFailures.push('live-main');
  }
  if (consumerFailures.length === 0) {
    console.error(`ASI throughput autobalance provenance self-test failed to reject consumer mutation: ${label}`);
    process.exit(1);
  }
}

console.log(JSON.stringify({
  status: 'VERIFIED_PASS',
  control: 'ASI_THROUGHPUT_AUTOBALANCE_EXACT_PRODUCER_PROVENANCE',
  mutation_cases_rejected: mutations.length + 1 + consumerMutations.length,
  pr_validation_mode: 'STRUCTURAL_AND_NEGATIVE_ONLY',
  live_consumption_mode: 'SCHEDULE_OR_MANUAL_EXACT_MAIN_ONLY',
  producer_wait: {max_attempts:210,interval_seconds:10,budget_seconds:2100,terminal_non_success:'FAIL_CLOSED',timeout:'FAIL_CLOSED'},
  production: 'HOLD',
  public_release: 'HOLD'
}, null, 2));

