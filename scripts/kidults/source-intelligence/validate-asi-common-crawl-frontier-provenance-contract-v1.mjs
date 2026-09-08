import fs from 'node:fs';

const targets = [
  '.github/workflows/kidults-asi-common-crawl-rolling-seed-frontier-v1.yml',
  '.github/workflows/kidults-asi-common-crawl-frontier-runtime-persistence-v1.yml',
];

const required = [
  "github.sha",
  "  workflow_run:",
  "workflows: ['KIDULTS ASI Self-Driving Control Loop v1']",
  "branches: [main]",
  "types: [completed]",
  "if: github.event_name != 'workflow_run' || github.event.workflow_run.conclusion == 'success'",
  "EXACT_EXECUTION_GENERATION",
  "resolve-asi-exact-generation-orchestration-v1.mjs",
  "--mode live",
  "--mode pr-fixture",
  '--trigger-expected "$TRIGGER_EXPECTED"',
  "--trigger-expected false",
  "--max-attempts 24 \\",
  "--poll-milliseconds 10000",
  "--workflow-path .github/workflows/kidults-asi-self-driving-control-loop-v1.yml",
  "--artifact-name kidults-asi-self-driving-cycle-v1",
  '--expected-base-sha "$EXPECTED_BASE_SHA"',
  '--expected-head-sha "$EXPECTED_HEAD_SHA"',
  '--expected-generation-sha "$EXPECTED_GENERATION_SHA"',
  'EXPECTED_SHA: ${{ github.event.workflow_run.head_sha || github.sha }}',
  'TARGET_BRANCH: main',
  'ref: ${{ github.event.pull_request.head.sha || github.event.workflow_run.head_sha || github.sha }}',
  "TRIGGER_EXPECTED: ${{ github.event_name == 'workflow_run' && 'true' || 'false' }}",
  "UPSTREAM_REPOSITORY: ${{ github.event.workflow_run.repository.full_name || '' }}",
  "UPSTREAM_RUN_ID: ${{ github.event.workflow_run.id || '' }}",
  '--expected-run-id "$UPSTREAM_RUN_ID"',
  'test "$UPSTREAM_REPOSITORY" = "$GITHUB_REPOSITORY"',
  'MAIN_SHA="$(gh api -H \'Accept: application/vnd.github+json\' "/repos/${GITHUB_REPOSITORY}/branches/main" --jq \'.commit.sha\')"',
  'test "$MAIN_SHA" = "$EXPECTED_SHA"',
  'test "$RUN_ID" = "$UPSTREAM_RUN_ID"',
  "if: github.event_name != 'pull_request'",
  "if: always() && github.event_name != 'pull_request'",
  "${#DISCOVERIES[@]}\" -eq 1",
  "producer_workflow_path",
  "producer_run_id",
  "producer_sha",
  "artifact_digest",
  "empirical_promotion:false",
  "public_release:\"HOLD\"",
  "production:\"HOLD\"",
  "g5:\"HOLD\"",
];

const forbidden = [
  "  schedule:",
  "- cron:",
  '.workflow_runs[0].id',
  'branch-compatible Self-Driving',
  'github.event.pull_request.base.ref',
  'PR_BASE_COMPATIBILITY_ONLY',
  "[.artifacts[] | select(.name==\"kidults-asi-self-driving-cycle-v1\" and .expired==false)][0].id // empty",
];

function validateText(text, target) {
  const failures = [];
  for (const marker of required) if (!text.includes(marker)) failures.push(`MISSING:${target}:${marker}`);
  for (const marker of forbidden) if (text.includes(marker)) failures.push(`FORBIDDEN:${target}:${marker}`);
  if (failures.length) throw new Error(failures.join('\n'));
}

function load() {
  return targets.map(target => ({ target, text: fs.readFileSync(target, 'utf8') }));
}

for (const { target, text } of load()) validateText(text, target);

if (process.argv.includes('--self-test')) {
  const mutations = [
    text => text.replaceAll('--expected-generation-sha "$EXPECTED_GENERATION_SHA"', '--expected-generation-sha "$EXPECTED_BASE_SHA"'),
    text => text.replaceAll('resolve-asi-exact-generation-orchestration-v1.mjs', 'unbound-resolver.mjs'),
    text => text.replace('--trigger-expected "$TRIGGER_EXPECTED"', '--trigger-expected false'),
    text => text.replace('  workflow_dispatch:', "  schedule:\n    - cron: '2 * * * *'\n  workflow_dispatch:"),
    text => text.replace("workflows: ['KIDULTS ASI Self-Driving Control Loop v1']", "workflows: ['Forged Producer']"),
    text => text.replace("if: github.event_name != 'workflow_run' || github.event.workflow_run.conclusion == 'success'", 'if: always()'),
    text => text.replaceAll('EXPECTED_SHA: ${{ github.event.workflow_run.head_sha || github.sha }}', 'EXPECTED_SHA: unbound'),
    text => text.replace('test "$UPSTREAM_REPOSITORY" = "$GITHUB_REPOSITORY"', 'test -n "$UPSTREAM_REPOSITORY"'),
    text => text.replace('test "$MAIN_SHA" = "$EXPECTED_SHA"', 'echo "$MAIN_SHA"'),
    text => text.replace('test "$RUN_ID" = "$UPSTREAM_RUN_ID"', 'test -n "$RUN_ID"'),
    text => text.replace('--expected-run-id "$UPSTREAM_RUN_ID"', '--expected-run-id ""'),
    text => text.replace('--max-attempts 24', '--max-attempts 240'),
    text => text.replaceAll("if: github.event_name != 'pull_request'", 'if: always()'),
    text => text.replaceAll('--artifact-name kidults-asi-self-driving-cycle-v1', '--artifact-name unbound'),
    text => text.replace('${#DISCOVERIES[@]}" -eq 1', '${#DISCOVERIES[@]}" -ge 1'),
    text => text.replace('empirical_promotion:false', 'empirical_promotion:true'),
  ];
  let rejected = 0;
  const sample = load()[0];
  for (const mutate of mutations) {
    try {
      validateText(mutate(sample.text), sample.target);
    } catch {
      rejected += 1;
    }
  }
  if (rejected !== mutations.length) throw new Error(`MUTATION_REJECTION_INCOMPLETE:${rejected}/${mutations.length}`);
  console.log(JSON.stringify({ state: 'VERIFIED_PASS', mutation_rejections: rejected, mutation_total: mutations.length }));
} else {
  console.log(JSON.stringify({ state: 'VERIFIED_PASS', workflows: targets.length, exact_generation_contract: true }));
}
