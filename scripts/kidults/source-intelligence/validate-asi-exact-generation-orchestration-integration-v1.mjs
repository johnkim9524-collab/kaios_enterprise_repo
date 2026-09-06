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
const scheduleByWorkflow = new Map([
  [workflows[0], "- cron: '5 * * * *'"],
  [workflows[1], "- cron: '2 * * * *'"],
  [workflows[2], "- cron: '9 * * * *'"],
  [workflows[3], "- cron: '7 * * * *'"],
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
    "TRIGGER_EXPECTED: ${{ github.event_name == 'schedule' && 'true' || 'false' }}",
    '--max-attempts 24 \\',
    '--poll-milliseconds 10000',
    'VERIFIED_PASS_LOCAL_FIXTURE',
    'external_provider_requests!==0',
    'writes!==0',
    "if: always() && github.event_name != 'pull_request'",
    'EXPECTED_SHA: ${{ github.sha }}',
    'EXPECTED_BASE_SHA:',
    'EXPECTED_HEAD_SHA:',
    'EXPECTED_GENERATION_SHA:',
    'TARGET_BRANCH: main',
    'ref: ${{ github.event.pull_request.head.sha || github.sha }}',
  ];
  for (const marker of required) if (!text.includes(marker)) failures.push(`MISSING:${workflow}:${marker}`);
  const schedule = scheduleByWorkflow.get(workflow);
  if (!text.includes(schedule)) failures.push(`PRODUCER_SCHEDULE_MISSING:${workflow}:${schedule}`);
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
  const mutations = [
    (text) => text.replaceAll(resolver, 'scripts/unbound-resolver.mjs'),
    (text) => text.replace('--mode pr-fixture', '--mode live'),
    (text) => text.replace('--trigger-expected false', '--trigger-expected "$TRIGGER_EXPECTED"'),
    (text) => text.replace("- cron: '5 * * * *'", "- cron: '5 1 1 1 *'"),
    (text) => text.replace('--max-attempts 24', '--max-attempts 240'),
    (text) => text.replaceAll('EXPECTED_SHA: ${{ github.sha }}', 'EXPECTED_SHA: unbound'),
    (text) => text.replaceAll('--expected-base-sha "$EXPECTED_BASE_SHA"', '--expected-base-sha unbound'),
    (text) => text.replaceAll('--expected-head-sha "$EXPECTED_HEAD_SHA"', '--expected-head-sha unbound'),
    (text) => text.replaceAll('--expected-generation-sha "$EXPECTED_GENERATION_SHA"', '--expected-generation-sha unbound'),
    (text) => text.replace("if: github.event_name == 'pull_request'", 'if: always()'),
    (text) => text.replaceAll("if: github.event_name != 'pull_request'", 'if: always()'),
    (text) => text.replace('external_provider_requests!==0', 'external_provider_requests<0'),
    (text) => text.replace("if: always() && github.event_name != 'pull_request'", 'if: success()'),
  ];
  let rejected = 0;
  for (const mutate of mutations) {
    const changed = mutate(sources[0][1]);
    try {
      violations(changed, sources[0][0]).length && (() => { throw new Error('rejected'); })();
    } catch {
      rejected += 1;
    }
  }
  if (rejected !== mutations.length) throw new Error(`MUTATION_REJECTION_INCOMPLETE:${rejected}/${mutations.length}`);
  console.log(JSON.stringify({ state: 'VERIFIED_PASS', workflows: workflows.length, mutations_rejected: rejected, external_provider_requests_in_pr: 0 }));
} else {
  console.log(JSON.stringify({ state: 'VERIFIED_PASS', workflows: workflows.length, pr_fixture_isolated: true, live_receipt_retained_on_failure: true }));
}
