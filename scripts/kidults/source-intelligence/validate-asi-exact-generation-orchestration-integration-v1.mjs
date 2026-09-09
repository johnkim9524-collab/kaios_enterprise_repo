#!/usr/bin/env node
import fs from 'node:fs';

const workflows = [
  '.github/workflows/kidults-asi-common-crawl-host-expansion-v1.yml',
  '.github/workflows/kidults-asi-common-crawl-rolling-seed-frontier-v1.yml',
  '.github/workflows/kidults-asi-common-crawl-gate-chain-binding-v1.yml',
  '.github/workflows/kidults-asi-common-crawl-frontier-runtime-persistence-v1.yml',
];

const resolver = 'scripts/kidults/source-intelligence/resolve-asi-exact-generation-orchestration-v1.mjs';
const resolverTest = 'tests/kidults/source-intelligence/asi-exact-generation-orchestration-v1.test.mjs';
const frontierTest = 'tests/kidults/source-intelligence/asi-common-crawl-seed-frontier-rebase-v1.test.mjs';
const scheduleByWorkflow = new Map();
const causalByWorkflow = new Map([
  [workflows[0], { producer: 'KIDULTS ASI Global Any-Site Discovery v2', selectedRun: 'PRODUCER_RUN_ID' }],
  [workflows[1], { producer: 'KIDULTS ASI Self-Driving Control Loop v1', selectedRun: 'RUN_ID' }],
  [workflows[2], { producer: 'KIDULTS ASI Global Any-Site Discovery v2', selectedRun: 'RUN_ID' }],
  [workflows[3], { producer: 'KIDULTS ASI Self-Driving Control Loop v1', selectedRun: 'RUN_ID' }],
]);

function stepBlocks(text) {
  return text.split(/(?=^      - (?:name:|uses:))/m).filter((block) => /^      - (?:name:|uses:)/m.test(block));
}

export function violations(text, workflow) {
  const failures = [];
  const required = [
    resolver,
    resolverTest,
    frontierTest,
    '--mode pr-fixture',
    '--mode live',
    '--expected-base-sha "$EXPECTED_BASE_SHA"',
    '--expected-head-sha "$EXPECTED_HEAD_SHA"',
    '--expected-generation-sha "$EXPECTED_GENERATION_SHA"',
    '--trigger-expected false',
    '--trigger-expected "$TRIGGER_EXPECTED"',
    '--max-attempts 24 \\',
    '--poll-milliseconds 10000',
    'VERIFIED_PASS_LOCAL_FIXTURE',
    'external_provider_requests!==0',
    'writes!==0',
    "if: always() && github.event_name != 'pull_request'",
    'EXPECTED_BASE_SHA:',
    'EXPECTED_HEAD_SHA:',
    'EXPECTED_GENERATION_SHA:',
    'TARGET_BRANCH: main',
  ];
  for (const marker of required) if (!text.includes(marker)) failures.push(`MISSING:${workflow}:${marker}`);
  const causal = causalByWorkflow.get(workflow);
  if (causal) {
    const causalRequired = [
      'workflow_run:',
      `workflows: ['${causal.producer}']`,
      'branches: [main]',
      'types: [completed]',
      "if: github.event_name != 'workflow_run' || github.event.workflow_run.conclusion == 'success'",
      "TRIGGER_EXPECTED: ${{ github.event_name == 'workflow_run' && 'true' || 'false' }}",
      'EXPECTED_SHA: ${{ github.event.workflow_run.head_sha || github.sha }}',
      'ref: ${{ github.event.pull_request.head.sha || github.event.workflow_run.head_sha || github.sha }}',
      'EXPECTED_EXECUTION_SHA: ${{ github.event.pull_request.head.sha || github.event.workflow_run.head_sha || github.sha }}',
      "UPSTREAM_REPOSITORY: ${{ github.event.workflow_run.repository.full_name || '' }}",
      "UPSTREAM_RUN_ID: ${{ github.event.workflow_run.id || '' }}",
      '--expected-run-id "$UPSTREAM_RUN_ID"',
      'test "$UPSTREAM_REPOSITORY" = "$GITHUB_REPOSITORY"',
      'MAIN_SHA="$(gh api -H \'Accept: application/vnd.github+json\' "/repos/${GITHUB_REPOSITORY}/branches/main" --jq \'.commit.sha\')"',
      'test "$MAIN_SHA" = "$EXPECTED_SHA"',
      `test "$${causal.selectedRun}" = "$UPSTREAM_RUN_ID"`,
    ];
    for (const marker of causalRequired) if (!text.includes(marker)) failures.push(`CAUSAL_TRIGGER_MISSING:${workflow}:${marker}`);
    if (/^\s*schedule:\s*$/m.test(text) || /^\s*-\s*cron:/m.test(text)) {
      failures.push(`INDEPENDENT_CONSUMER_SCHEDULE_FORBIDDEN:${workflow}`);
    }
  } else {
    const scheduledRequired = [
      "TRIGGER_EXPECTED: ${{ github.event_name == 'schedule' && 'true' || 'false' }}",
      'EXPECTED_SHA: ${{ github.sha }}',
      'ref: ${{ github.event.pull_request.head.sha || github.sha }}',
    ];
    for (const marker of scheduledRequired) if (!text.includes(marker)) failures.push(`SCHEDULED_TRIGGER_MISSING:${workflow}:${marker}`);
    const schedule = scheduleByWorkflow.get(workflow);
    if (!text.includes(schedule)) failures.push(`PRODUCER_SCHEDULE_MISSING:${workflow}:${schedule}`);
  }
  const blocks = stepBlocks(text);
  const fixture = blocks.find((block) => block.includes('Validate PR fixture orchestration without provider requests'));
  if (!fixture || !fixture.includes("if: github.event_name == 'pull_request'")) failures.push(`PR_FIXTURE_STEP_INVALID:${workflow}`);
  if (fixture && (fixture.includes('gh api') || fixture.includes('--mode live') || fixture.includes('GH_TOKEN:'))) {
    failures.push(`PR_FIXTURE_NETWORK_PATH:${workflow}`);
  }
  const liveBlocks = blocks.filter((block) =>
    !block.includes('Verify exact source')
    && !block.includes('Validate PR fixture orchestration')
    && !block.includes('Upload bounded PR orchestration receipt')
    && (block.includes('gh api')
      || block.includes('Common Crawl public')
      || block.includes('Build and validate first two rolling')
      || block.includes('Prove complete fair sweep')
      || block.includes('Execute fresh runtime-managed')
      || block.includes('Execute second cycle')
      || block.includes('Gate1 classify')
      || block.includes('Gate2 independently')
      || block.includes('Gate3 admit')
      || block.includes('Accumulate merged candidates')));
  for (const block of liveBlocks) {
    if (!block.includes("if: github.event_name != 'pull_request'")) failures.push(`LIVE_STEP_NOT_PR_ISOLATED:${workflow}`);
  }
  if (liveBlocks.length === 0) failures.push(`LIVE_STEPS_NOT_DISCOVERED:${workflow}`);
  if (workflow === workflows[3]) {
    const poison = blocks.find((block) => block.includes('Reject poisoned previous snapshot'));
    const poisonRequired = [
      'Reject poisoned previous snapshot without history reset',
      'set +e',
      'POISON_STATUS=$?',
      'test "$POISON_STATUS" -ne 0',
      'test ! -e /tmp/asi-common-crawl-runtime-poison-recovery.json',
      'PREVIOUS_SNAPSHOT_MALFORMED:SELF_DRIVING_PREVIOUS_EXPANSION:PREVIOUS_FRONTIER_INVALID',
      'poisoned_snapshot_disposition:"REJECTED_FAIL_CLOSED"',
      'history_reset:false',
      'legacy_fallback_used:false',
      'external_provider_requests:0',
      'production:"HOLD"',
      '/tmp/asi-common-crawl-runtime-poison-rejection.json',
    ];
    if (!poison) failures.push(`POISONED_SNAPSHOT_STEP_MISSING:${workflow}`);
    for (const marker of poisonRequired) {
      if (!poison?.includes(marker)) failures.push(`POISONED_SNAPSHOT_FAIL_CLOSED_MARKER_MISSING:${workflow}:${marker}`);
    }
    if (poison?.includes('restart safely') || poison?.includes('validate-asi-common-crawl-host-expansion-v1.mjs /tmp/asi-common-crawl-runtime-poison-recovery.json')) {
      failures.push(`POISONED_SNAPSHOT_HISTORY_RESET_PATH_PRESENT:${workflow}`);
    }
  }
  return failures;
}

function validateAll(sources) {
  const failures = [];
  for (const [workflow, text] of sources) failures.push(...violations(text, workflow));
  if (failures.length) throw new Error(failures.join('\n'));
}

const sources = workflows.map((workflow) => [workflow, fs.readFileSync(workflow, 'utf8')]);
validateAll(sources);

if (process.argv.includes('--self-test')) {
  const mutationsFor = (causal) => [
    (text) => text.replaceAll(resolver, 'scripts/unbound-resolver.mjs'),
    (text) => text.replace('--mode pr-fixture', '--mode live'),
    (text) => text.replace('--trigger-expected false', '--trigger-expected "$TRIGGER_EXPECTED"'),
    (text) => text.replace('  workflow_dispatch:', "  schedule:\n    - cron: '5 * * * *'\n  workflow_dispatch:"),
    (text) => text.replace(`workflows: ['${causal.producer}']`, "workflows: ['Forged Producer']"),
    (text) => text.replace("if: github.event_name != 'workflow_run' || github.event.workflow_run.conclusion == 'success'", 'if: always()'),
    (text) => text.replace('--max-attempts 24', '--max-attempts 240'),
    (text) => text.replaceAll('EXPECTED_SHA: ${{ github.event.workflow_run.head_sha || github.sha }}', 'EXPECTED_SHA: unbound'),
    (text) => text.replace('test "$MAIN_SHA" = "$EXPECTED_SHA"', 'echo "$MAIN_SHA"'),
    (text) => text.replace(`test "$${causal.selectedRun}" = "$UPSTREAM_RUN_ID"`, `test -n "$${causal.selectedRun}"`),
    (text) => text.replace('--expected-run-id "$UPSTREAM_RUN_ID"', '--expected-run-id ""'),
    (text) => text.replaceAll('--expected-base-sha "$EXPECTED_BASE_SHA"', '--expected-base-sha unbound'),
    (text) => text.replaceAll('--expected-head-sha "$EXPECTED_HEAD_SHA"', '--expected-head-sha unbound'),
    (text) => text.replaceAll('--expected-generation-sha "$EXPECTED_GENERATION_SHA"', '--expected-generation-sha unbound'),
    (text) => text.replace("if: github.event_name == 'pull_request'", 'if: always()'),
    (text) => text.replaceAll("if: github.event_name != 'pull_request'", 'if: always()'),
    (text) => text.replace('external_provider_requests!==0', 'external_provider_requests<0'),
    (text) => text.replace("if: always() && github.event_name != 'pull_request'", 'if: success()'),
  ];
  let rejected = 0;
  let mutationTotal = 0;
  for (const [workflow, causal] of causalByWorkflow) {
    const source = sources.find(([candidate]) => candidate === workflow);
    const mutations = mutationsFor(causal);
    mutationTotal += mutations.length;
    for (const mutate of mutations) {
      const changed = mutate(source[1]);
      if (violations(changed, workflow).length) rejected += 1;
    }
  }
  const poisonMutations = [
    (text) => text.replace('without history reset', 'and restart safely'),
    (text) => text.replace('set +e', ':'),
    (text) => text.replace('test "$POISON_STATUS" -ne 0', 'test "$POISON_STATUS" -eq 0'),
    (text) => text.replace('test ! -e /tmp/asi-common-crawl-runtime-poison-recovery.json', 'test -e /tmp/asi-common-crawl-runtime-poison-recovery.json'),
    (text) => text.replace('PREVIOUS_SNAPSHOT_MALFORMED:SELF_DRIVING_PREVIOUS_EXPANSION:PREVIOUS_FRONTIER_INVALID', 'PREVIOUS_SNAPSHOT_IGNORED'),
    (text) => text.replace('poisoned_snapshot_disposition:"REJECTED_FAIL_CLOSED"', 'poisoned_snapshot_disposition:"RESET_AND_CONTINUE"'),
    (text) => text.replace('history_reset:false', 'history_reset:true'),
    (text) => text.replace('external_provider_requests:0', 'external_provider_requests:1'),
    (text) => text.replace(
      /(poisoned_snapshot_disposition:"REJECTED_FAIL_CLOSED"[^\n]*production:)"HOLD"/,
      '$1"APPROVED"',
    ),
  ];
  let poisonRejected = 0;
  for (const mutate of poisonMutations) {
    const changed = mutate(sources[3][1]);
    if (violations(changed, sources[3][0]).length) poisonRejected += 1;
  }
  if (rejected !== mutationTotal) throw new Error(`MUTATION_REJECTION_INCOMPLETE:${rejected}/${mutationTotal}`);
  if (poisonRejected !== poisonMutations.length) throw new Error(`POISON_MUTATION_REJECTION_INCOMPLETE:${poisonRejected}/${poisonMutations.length}`);
  console.log(JSON.stringify({ state: 'VERIFIED_PASS', workflows: workflows.length, mutations_rejected: rejected + poisonRejected, poisoned_snapshot_mutations_rejected: poisonRejected, external_provider_requests_in_pr: 0 }));
} else {
  console.log(JSON.stringify({ state: 'VERIFIED_PASS', workflows: workflows.length, pr_fixture_isolated: true, live_receipt_retained_on_failure: true }));
}
