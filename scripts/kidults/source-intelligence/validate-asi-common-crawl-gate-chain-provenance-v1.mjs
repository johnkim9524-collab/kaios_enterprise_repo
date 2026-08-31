import fs from 'node:fs';

const workflowPath = '.github/workflows/kidults-asi-common-crawl-gate-chain-binding-v1.yml';
const source = fs.readFileSync(workflowPath, 'utf8');
const producerWorkflowPath = '.github/workflows/kidults-asi-global-open-market-discovery-v1.yml';
const producerSource = fs.readFileSync(producerWorkflowPath, 'utf8');

function violations(text) {
  const failures = [];
  const mustInclude = [
    'EXPECTED_EXECUTION_SHA: ${{ github.sha }}',
    'PR_HEAD_SHA: ${{ github.event.pull_request.head.sha || github.sha }}',
    "run.repository?.full_name===repository",
    "run.path==='.github/workflows/kidults-asi-global-open-market-discovery-v1.yml'",
    "run.head_sha===expectedSha",
    'artifact.workflow_run?.id===run.id',
    'artifact.workflow_run?.head_sha===expectedSha',
    'GLOBAL_DISCOVERY_ARTIFACT_CARDINALITY',
    "/^sha256:[a-f0-9]{64}$/.test(artifact.digest||'')",
    'producer_run_id:run.id',
    'producer_head_sha:run.head_sha',
    'producer_execution_sha:run.head_sha',
    'consumer_pr_head_sha:prHeadSha',
    "correlation_contract:'PULL_REQUEST_MERGE_EXECUTION_SHA'",
    'artifact_id:artifact.id',
    'artifact_digest:artifact.digest',
    'exact_generation:true',
    'upstream_global_discovery:provenance',
    'Emit exact-run terminal receipt',
    'if: always()',
    'kidults-asi-common-crawl-gate-chain-terminal-v1',
    "state:process.env.JOB_STATUS==='success'?'COMPLETE':'FAILED_NON_PROMOTABLE'",
    'promotable:false'
  ];
  for (const needle of mustInclude) {
    if (!text.includes(needle)) failures.push(`MISSING:${needle}`);
  }
  if (text.includes("if(runs.length)fs.writeFileSync('/tmp/any-site-run.json',JSON.stringify(runs[0],null,2));") &&
      !text.includes('run.head_sha===expectedSha')) {
    failures.push('LATEST_BRANCH_RUN_WITHOUT_EXACT_EXECUTION_SHA');
  }
  return failures;
}

function producerViolations(text) {
  const failures = [];
  for (const needle of [
    "      - 'scripts/kidults/source-intelligence/validate-asi-common-crawl-gate-chain-provenance-v1.mjs'",
    "      - '.github/workflows/kidults-asi-common-crawl-gate-chain-binding-v1.yml'"
  ]) {
    if (!text.includes(needle)) failures.push(`PRODUCER_TRIGGER_MISSING:${needle}`);
  }
  return failures;
}

const producerPristine = producerViolations(producerSource);
if (producerPristine.length) {
  console.error(JSON.stringify({status:'FAIL',violations:producerPristine},null,2));
  process.exit(1);
}
const pristine = violations(source);
if (pristine.length) {
  console.error(JSON.stringify({status:'FAIL',violations:pristine},null,2));
  process.exit(1);
}

const mutations = [
  ['DROP_EXECUTION_SHA', t => t.replace("run.head_sha===expectedSha&&\n", '')],
  ['DROP_PR_HEAD_IDENTITY', t => t.replace('consumer_pr_head_sha:prHeadSha,', '')],
  ['CHANGE_CORRELATION_CONTRACT', t => t.replace("correlation_contract:'PULL_REQUEST_MERGE_EXECUTION_SHA'", "correlation_contract:'BRANCH_HEAD_SHA'")],
  ['DROP_REPOSITORY_BINDING', t => t.replace("run.repository?.full_name===repository&&\n", '')],
  ['DROP_CANONICAL_PATH', t => t.replace("run.path==='.github/workflows/kidults-asi-global-open-market-discovery-v1.yml'&&\n", '')],
  ['DROP_CARDINALITY', t => t.replace("if(artifacts.length!==1)throw new Error(`GLOBAL_DISCOVERY_ARTIFACT_CARDINALITY:${artifacts.length}`);", '')],
  ['DROP_DIGEST', t => t.replace("if(!/^sha256:[a-f0-9]{64}$/.test(artifact.digest||''))throw new Error(`GLOBAL_DISCOVERY_ARTIFACT_DIGEST_INVALID:${artifact.digest||'NONE'}`);", '')],
  ['DROP_RECEIPT_PROVENANCE', t => t.replace('upstream_global_discovery:provenance,', '')],
  ['ALLOW_FALSE_EXACT_GENERATION', t => t.replace('exact_generation:true', 'exact_generation:false')],
  ['DROP_TERMINAL_ALWAYS', t => t.replace('        if: always()\n', '')]
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

const producerMutations = [
  ['DROP_GATE_VALIDATOR_TRIGGER', t => t.replace("      - 'scripts/kidults/source-intelligence/validate-asi-common-crawl-gate-chain-provenance-v1.mjs'\n", '')],
  ['DROP_GATE_WORKFLOW_TRIGGER', t => t.replace("      - '.github/workflows/kidults-asi-common-crawl-gate-chain-binding-v1.yml'\n", '')]
];

for (const [name, mutate] of producerMutations) {
  const changed = mutate(producerSource);
  if (changed === producerSource) {
    console.error(`MUTATION_NOT_APPLIED:${name}`);
    process.exit(1);
  }
  if (producerViolations(changed).length === 0) {
    console.error(`FALSE_GREEN:${name}`);
    process.exit(1);
  }
}
console.log(JSON.stringify({
  status:'PASS',
  id:'asi-common-crawl-gate-chain-provenance-v1',
  mutations_rejected:mutations.length+producerMutations.length,
  producer_trigger_coupled:true,
  correlation_contract:'PULL_REQUEST_MERGE_EXECUTION_SHA',
  exact_generation_required:true,
  terminal_receipt_required:true,
  production:'HOLD'
},null,2));
