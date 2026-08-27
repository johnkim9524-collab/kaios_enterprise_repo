import fs from 'node:fs';

const workflowPath = '.github/workflows/kidults-asi-common-crawl-gate-chain-binding-v1.yml';
const source = fs.readFileSync(workflowPath, 'utf8');

function violations(text) {
  const failures = [];
  const mustInclude = [
    "EXPECTED_SHA: ${{ github.event.pull_request.head.sha || github.sha }}",
    "run.repository?.full_name===repository",
    "run.path==='.github/workflows/kidults-asi-global-open-market-discovery-v1.yml'",
    "run.head_sha===expectedSha",
    'artifact.workflow_run?.id===run.id',
    'artifact.workflow_run?.head_sha===expectedSha',
    'GLOBAL_DISCOVERY_ARTIFACT_CARDINALITY',
    "/^sha256:[a-f0-9]{64}$/.test(artifact.digest||'')",
    'producer_run_id:run.id',
    'producer_head_sha:run.head_sha',
    'artifact_id:artifact.id',
    'artifact_digest:artifact.digest',
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
  ['DROP_EXPECTED_SHA', t => t.replace("run.head_sha===expectedSha&&\n", '')],
  ['DROP_REPOSITORY_BINDING', t => t.replace("run.repository?.full_name===repository&&\n", '')],
  ['DROP_CANONICAL_PATH', t => t.replace("run.path==='.github/workflows/kidults-asi-global-open-market-discovery-v1.yml'&&\n", '')],
  ['DROP_CARDINALITY', t => t.replace("if(artifacts.length!==1)throw new Error(`GLOBAL_DISCOVERY_ARTIFACT_CARDINALITY:${artifacts.length}`);", '')],
  ['DROP_DIGEST', t => t.replace("if(!/^sha256:[a-f0-9]{64}$/.test(artifact.digest||''))throw new Error(`GLOBAL_DISCOVERY_ARTIFACT_DIGEST_INVALID:${artifact.digest||'NONE'}`);", '')],
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
