import fs from 'node:fs';

const workflowPath = '.github/workflows/kidults-asi-common-crawl-gate-chain-binding-v1.yml';
const source = fs.readFileSync(workflowPath, 'utf8');

function violations(text) {
  const failures = [];
  const mustInclude = [
    'EXPECTED_SHA: ${{ github.sha }}',
    'TARGET_BRANCH: main',
    'resolve-asi-exact-generation-orchestration-v1.mjs',
    '--mode live',
    '--mode pr-fixture',
    '--trigger-expected "$TRIGGER_EXPECTED"',
    '--trigger-expected false',
    '--max-attempts 24 \\',
    '--poll-milliseconds 10000',
    '--workflow-path .github/workflows/kidults-asi-global-open-market-discovery-v1.yml',
    '--artifact-name kidults-asi-global-any-site-discovery-v2',
    "- cron: '9 * * * *'",
    'ref: ${{ github.event.pull_request.head.sha || github.sha }}',
    "if: github.event_name != 'pull_request'",
    "if: always() && github.event_name != 'pull_request'",
    'producer_run_id:r.selected_run_id',
    'producer_head_sha:r.expected_producer_sha',
    'artifact_id:r.selected_artifact_id',
    'artifact_digest:r.selected_artifact_digest',
    'exact_generation:true',
    'upstream_global_discovery:provenance'
  ];
  for (const needle of mustInclude) {
    if (!text.includes(needle)) failures.push(`MISSING:${needle}`);
  }
  if (text.includes("if(runs.length)fs.writeFileSync('/tmp/any-site-run.json',JSON.stringify(runs[0],null,2));") &&
      !text.includes('run.head_sha===expectedSha')) {
    failures.push('LATEST_BRANCH_RUN_WITHOUT_EXACT_SHA');
  }
  return failures;
}

const pristine = violations(source);
if (pristine.length) {
  console.error(JSON.stringify({status:'FAIL',violations:pristine},null,2));
  process.exit(1);
}

const mutations = [
  ['DROP_EXPECTED_SHA', t => t.replaceAll('EXPECTED_SHA: ${{ github.sha }}', 'EXPECTED_SHA: unbound')],
  ['DROP_PRODUCER_TRIGGER', t => t.replace("- cron: '9 * * * *'", "- cron: '9 1 1 1 *'")],
  ['DROP_RESOLVER', t => t.replaceAll('resolve-asi-exact-generation-orchestration-v1.mjs', 'unbound-resolver.mjs')],
  ['DROP_CANONICAL_PATH', t => t.replaceAll('--workflow-path .github/workflows/kidults-asi-global-open-market-discovery-v1.yml', '--workflow-path .github/workflows/forged.yml')],
  ['DROP_BOUND', t => t.replace('--max-attempts 24', '--max-attempts 240')],
  ['ALLOW_PR_LIVE', t => t.replaceAll("if: github.event_name != 'pull_request'", 'if: always()')],
  ['DROP_PR_FIXTURE', t => t.replace('--mode pr-fixture', '--mode live')],
  ['DROP_RECEIPT_PROVENANCE', t => t.replace('upstream_global_discovery:provenance,', '')],
  ['ALLOW_FALSE_EXACT_GENERATION', t => t.replace('exact_generation:true', 'exact_generation:false')]
];

for (const [name, mutate] of mutations) {
  const changed = mutate(source);
  if (changed === source) {
    console.error(`MUTATION_NOT_APPLIED:${name}`);
    process.exit(1);
  }
  if (violations(changed).length === 0) {
    console.error(`FALSE_GREEN:${name}`);
    process.exit(1);
  }
}

console.log(JSON.stringify({
  status:'PASS',
  id:'asi-common-crawl-gate-chain-provenance-v1',
  mutations_rejected:mutations.length,
  exact_generation_required:true,
  production:'HOLD'
},null,2));
