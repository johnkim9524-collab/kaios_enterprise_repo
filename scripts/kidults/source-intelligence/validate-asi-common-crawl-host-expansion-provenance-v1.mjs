import fs from 'node:fs';

const workflowPath = '.github/workflows/kidults-asi-common-crawl-host-expansion-v1.yml';

function fail(message) {
  throw new Error(`Common Crawl host-expansion provenance guard: ${message}`);
}

export function validateWorkflowText(text) {
  const required = [
    ['governed resolver', 'resolve-asi-exact-generation-orchestration-v1.mjs'],
    ['bounded receipt', '/tmp/asi-common-crawl-host-expansion-orchestration-v1.json'],
    ['live mode', '--mode live'],
    ['PR fixture mode', '--mode pr-fixture'],
    ['PR fixture no-trigger contract', '--trigger-expected false'],
    ['event-derived trigger expectation', '--trigger-expected "$TRIGGER_EXPECTED"'],
    ['bounded attempts', '--max-attempts 24 \\'],
    ['bounded polling', '--poll-milliseconds 10000'],
    ['exact producer SHA', '--expected-sha "$EXPECTED_SHA"'],
    ['exact producer branch', '--branch "$TARGET_BRANCH"'],
    ['causal workflow_run trigger', 'workflow_run:'],
    ['canonical producer trigger name', "workflows: ['KIDULTS ASI Global Any-Site Discovery v2']"],
    ['main-only upstream trigger', 'branches: [main]'],
    ['completed upstream trigger', 'types: [completed]'],
    ['upstream success job guard', "if: github.event_name != 'workflow_run' || github.event.workflow_run.conclusion == 'success'"],
    ['producer SHA binding', 'EXPECTED_SHA: ${{ github.event.workflow_run.head_sha || github.sha }}'],
    ['producer base SHA binding', 'EXPECTED_BASE_SHA: ${{ github.event.workflow_run.head_sha || github.sha }}'],
    ['producer head SHA binding', 'EXPECTED_HEAD_SHA: ${{ github.event.workflow_run.head_sha || github.sha }}'],
    ['producer generation SHA binding', 'EXPECTED_GENERATION_SHA: ${{ github.event.workflow_run.head_sha || github.sha }}'],
    ['exact event checkout', 'ref: ${{ github.event.pull_request.head.sha || github.event.workflow_run.head_sha || github.sha }}'],
    ['exact execution source binding', 'EXPECTED_EXECUTION_SHA: ${{ github.event.pull_request.head.sha || github.event.workflow_run.head_sha || github.sha }}'],
    ['upstream repository binding', "UPSTREAM_REPOSITORY: ${{ github.event.workflow_run.repository.full_name || '' }}"],
    ['upstream run-id binding', "UPSTREAM_RUN_ID: ${{ github.event.workflow_run.id || '' }}"],
    ['live main reread', 'MAIN_SHA="$(gh api -H \'Accept: application/vnd.github+json\' "/repos/${GITHUB_REPOSITORY}/branches/main" --jq \'.commit.sha\')"'],
    ['live main equality guard', 'test "$MAIN_SHA" = "$EXPECTED_SHA"'],
    ['triggered producer run equality guard', 'test "$PRODUCER_RUN_ID" = "$UPSTREAM_RUN_ID"'],
    ['workflow-run trigger expectation', "TRIGGER_EXPECTED: ${{ github.event_name == 'workflow_run' && 'true' || 'false' }}"],
    ['producer branch binding', 'TARGET_BRANCH: main'],
    ['canonical producer path', '--workflow-path .github/workflows/kidults-asi-global-open-market-discovery-v1.yml'],
    ['canonical producer name', "--workflow-name 'KIDULTS ASI Global Any-Site Discovery v2'"],
    ['artifact binding', '--artifact-name kidults-asi-global-any-site-discovery-v2'],
    ['PR live separation', "if: github.event_name != 'pull_request'"],
    ['request-free PR receipt', 'external_provider_requests'],
    ['single extracted source assertion', 'test "${#SOURCES[@]}" -eq 1'],
    ['provenance receipt', '/tmp/asi-common-crawl-host-expansion-provenance-v1.json'],
    ['no empirical promotion', 'empirical_promotion:false'],
    ['production hold', 'production:"HOLD"'],
    ['g5 hold', 'g5:"HOLD"']
  ];
  for (const [label, needle] of required) {
    if (!text.includes(needle)) fail(`missing ${label}`);
  }

  if (/^\s*schedule:\s*$/m.test(text) || /^\s*-\s*cron:/m.test(text)) {
    fail('independent consumer schedule is forbidden; live execution must be causally bound to producer workflow_run');
  }

  if (text.includes('/actions/artifacts?per_page=100')) {
    fail('repository-global artifact listing is forbidden');
  }

  const directDownload = text.match(/\/actions\/artifacts\/\$\{ART_ID\}\/zip/g) ?? [];
  if (directDownload.length !== 1) {
    fail(`expected exactly one artifact download after run-scoped selection, found ${directDownload.length}`);
  }

  return true;
}

const source = fs.readFileSync(workflowPath, 'utf8');
validateWorkflowText(source);

if (process.argv.includes('--self-test')) {
  const mutations = [
    ['remove resolver', source.replaceAll('resolve-asi-exact-generation-orchestration-v1.mjs', 'unbound-resolver.mjs')],
    ['remove exact SHA', source.replaceAll('--expected-sha "$EXPECTED_SHA"', '--expected-sha "$PR_BASE_SHA"')],
    ['reintroduce independent schedule', source.replace('  workflow_dispatch:', "  schedule:\n    - cron: '5 * * * *'\n  workflow_dispatch:")],
    ['forge producer trigger name', source.replace("workflows: ['KIDULTS ASI Global Any-Site Discovery v2']", "workflows: ['Forged Producer']")],
    ['remove producer SHA binding', source.replaceAll('EXPECTED_SHA: ${{ github.event.workflow_run.head_sha || github.sha }}', 'EXPECTED_SHA: unbound')],
    ['remove live main guard', source.replace('test "$MAIN_SHA" = "$EXPECTED_SHA"', 'echo "$MAIN_SHA"')],
    ['remove triggering run binding', source.replace('test "$PRODUCER_RUN_ID" = "$UPSTREAM_RUN_ID"', 'test -n "$PRODUCER_RUN_ID"')],
    ['allow failed upstream execution', source.replace("if: github.event_name != 'workflow_run' || github.event.workflow_run.conclusion == 'success'", 'if: always()')],
    ['remove canonical path', source.replaceAll('--workflow-path .github/workflows/kidults-asi-global-open-market-discovery-v1.yml', '--workflow-path .github/workflows/forged.yml')],
    ['unbound attempts', source.replace('--max-attempts 24', '--max-attempts 240')],
    ['allow PR live execution', source.replaceAll("if: github.event_name != 'pull_request'", 'if: always()')],
    ['claim PR live trigger', source.replace('--trigger-expected false', '--trigger-expected "$TRIGGER_EXPECTED"')],
    ['forge empirical promotion', source.replace('empirical_promotion:false', 'empirical_promotion:true')]
  ];
  for (const [label, mutated] of mutations) {
    let rejected = false;
    try {
      validateWorkflowText(mutated);
    } catch {
      rejected = true;
    }
    if (!rejected) fail(`self-test mutation was accepted: ${label}`);
  }
  console.log(JSON.stringify({status:'PASS', mutations_rejected:mutations.length}));
} else {
  console.log(JSON.stringify({status:'PASS'}));
}
