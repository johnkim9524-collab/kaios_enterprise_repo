#!/usr/bin/env node
import fs from 'node:fs';

const assurancePath = '.github/workflows/kidults-platform-continuous-assurance-v1.yml';
const reservePath = '.github/workflows/kidults-asi-sharded-source-reserve-v1.yml';
const assurance = fs.readFileSync(assurancePath, 'utf8');
const reserve = fs.readFileSync(reservePath, 'utf8');
const fail = message => { throw new Error(message); };
const count = (source, marker) => source.split(marker).length - 1;

function extractStep(source, name) {
  const marker = `      - name: ${name}\n`;
  const start = source.indexOf(marker);
  if (start < 0) fail(`STEP_MISSING:${name}`);
  const next = source.indexOf('\n      - name:', start + marker.length);
  const upload = source.indexOf('\n      - uses:', start + marker.length);
  const ends = [next, upload].filter(value => value >= 0);
  return source.slice(start, ends.length ? Math.min(...ends) : source.length);
}

function validateAssurance(source) {
  const watch = "      - 'KIDULTS ASI Sharded Source Reserve v1'";
  if (count(source, watch) !== 1) fail('RESERVE_WATCH_CARDINALITY_NOT_ONE');
  const block = extractStep(source, 'Validate exact Sharded Reserve upstream terminal binding');
  const required = [
    "if: github.event_name == 'workflow_run' && github.event.workflow_run.name == 'KIDULTS ASI Sharded Source Reserve v1'",
    'RESERVE_UPSTREAM_RUN_ID: ${{ github.event.workflow_run.id }}',
    'RESERVE_UPSTREAM_SHA: ${{ github.event.workflow_run.head_sha }}',
    'RESERVE_UPSTREAM_CONCLUSION: ${{ github.event.workflow_run.conclusion }}',
    '/actions/runs/${RESERVE_UPSTREAM_RUN_ID}',
    '.name=="KIDULTS ASI Sharded Source Reserve v1"',
    '.path==".github/workflows/kidults-asi-sharded-source-reserve-v1.yml"',
    '.repository.full_name==$repo',
    '.head_branch=="main"',
    'and .head_sha==$sha',
    '.status=="completed"',
    '.conclusion==$conclusion',
    '/actions/runs/${RESERVE_UPSTREAM_RUN_ID}/artifacts?per_page=100',
    'kidults-asi-sharded-source-reserve-v1',
    'kidults-asi-sharded-source-reserve-waiting-v1',
    'test "$RESERVE_TOTAL_ARTIFACT_COUNT" -eq 1',
    'test "$RESERVE_TOTAL_ARTIFACT_COUNT" -eq 0',
    '[[ "$RESERVE_ARTIFACT_DIGEST" =~ ^sha256:[0-9a-fA-F]{64}$ ]]',
    'WAITING_FOR_EXACT_DISCOVERY_PRODUCER',
    'promotion_eligible:false',
    'reserve-upstream-binding.json'
  ];
  for (const marker of required) if (!block.includes(marker)) fail(`ASSURANCE_MARKER_MISSING:${marker}`);
  const header = source.match(/jobs:\n  audit:\n([\s\S]*?)\n    runs-on:/)?.[1] || '';
  if (/workflow_run\.conclusion\s*==\s*['"]success['"]/.test(header)) fail('SUCCESS_ONLY_FILTER_FORBIDDEN');
}

function validateReserve(source) {
  const required = [
    'KIDULTS_RESERVE_PRODUCER_STATE=WAITING_FOR_EXACT_DISCOVERY_PRODUCER',
    'KIDULTS_RESERVE_PRODUCER_STATE=READY',
    'if: env.KIDULTS_RESERVE_PRODUCER_STATE == \'READY\'',
    'if: env.KIDULTS_RESERVE_PRODUCER_STATE == \'WAITING_FOR_EXACT_DISCOVERY_PRODUCER\'',
    'state:\'WAITING_FOR_EXACT_DISCOVERY_PRODUCER\'',
    'promotion_eligible:false',
    'kidults-asi-sharded-source-reserve-waiting-v1',
    'if-no-files-found: error',
    'content_acquisition_authorized:false',
    'collection_right_created:false',
    'public_release:\'HOLD\'',
    'production:\'HOLD\''
  ];
  for (const marker of required) if (!source.includes(marker)) fail(`RESERVE_MARKER_MISSING:${marker}`);
  const waitingUpload = count(source, 'name: kidults-asi-sharded-source-reserve-waiting-v1');
  if (waitingUpload !== 1) fail(`WAITING_ARTIFACT_CARDINALITY:${waitingUpload}`);
  if (source.includes('status=success') && source.includes('KIDULTS_RESERVE_PRODUCER_STATE=WAITING')) {
    fail('SUCCESS_FILTER_MUST_NOT_MASK_WAITING');
  }
}

validateAssurance(assurance);
validateReserve(reserve);

const assuranceMutations = [
  ["      - 'KIDULTS ASI Sharded Source Reserve v1'\n", ''],
  ['.path==".github/workflows/kidults-asi-sharded-source-reserve-v1.yml"', '.path!=".github/workflows/kidults-asi-sharded-source-reserve-v1.yml"'],
  ['and .head_sha==$sha', 'and .head_sha!=$sha'],
  ['test "$RESERVE_TOTAL_ARTIFACT_COUNT" -eq 1', 'test "$RESERVE_TOTAL_ARTIFACT_COUNT" -ge 1'],
  ['[[ "$RESERVE_ARTIFACT_DIGEST" =~ ^sha256:[0-9a-fA-F]{64}$ ]]', '[[ "$RESERVE_ARTIFACT_DIGEST" =~ ^md5: ]]']
];
for (const [from, to] of assuranceMutations) {
  if (!assurance.includes(from)) fail(`ASSURANCE_SELF_TEST_MARKER_MISSING:${from}`);
  let rejected = false;
  try { validateAssurance(assurance.replace(from, to)); } catch { rejected = true; }
  if (!rejected) fail(`ASSURANCE_MUTATION_NOT_REJECTED:${from}`);
}

const reserveMutations = [
  ['KIDULTS_RESERVE_PRODUCER_STATE=WAITING_FOR_EXACT_DISCOVERY_PRODUCER', 'KIDULTS_RESERVE_PRODUCER_STATE=READY'],
  ["state:'WAITING_FOR_EXACT_DISCOVERY_PRODUCER'", "state:'VERIFIED_PASS'"],
  ['promotion_eligible:false', 'promotion_eligible:true'],
  ['name: kidults-asi-sharded-source-reserve-waiting-v1', 'name: kidults-asi-sharded-source-reserve-v1']
];
for (const [from, to] of reserveMutations) {
  if (!reserve.includes(from)) fail(`RESERVE_SELF_TEST_MARKER_MISSING:${from}`);
  let rejected = false;
  try { validateReserve(reserve.replace(from, to)); } catch { rejected = true; }
  if (!rejected) fail(`RESERVE_MUTATION_NOT_REJECTED:${from}`);
}

console.log(JSON.stringify({
  suite: 'KIDULTS_SHARDED_RESERVE_ASSURANCE_WATCH_V1',
  state: 'VERIFIED_PASS',
  exact_terminal_run_binding: true,
  success_failure_cancelled_observation: true,
  exact_artifact_cardinality_and_digest: true,
  producer_absent_waiting_hold_receipt: true,
  false_pass_on_waiting_rejected: true,
  mutations_rejected: assuranceMutations.length + reserveMutations.length,
  empirical_promotion: false,
  production: 'HOLD',
  public: 'HOLD',
  g5: 'EXPLICIT_APPROVAL_REQUIRED'
}, null, 2));
