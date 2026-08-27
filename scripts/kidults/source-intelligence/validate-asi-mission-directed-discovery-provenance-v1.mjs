import fs from 'node:fs';

const workflowPath = '.github/workflows/kidults-asi-mission-directed-discovery-v1.yml';
const source = fs.readFileSync(workflowPath, 'utf8');
const fail = (message) => { throw new Error(message); };

if (!source.includes("group: kidults-asi-mission-directed-discovery-v1-${{ github.event_name }}-${{ github.event_name == 'workflow_run' && github.event.workflow_run.id || github.ref }}")) {
  fail('MISSION_DIRECTED_REF_ONLY_CONCURRENCY');
}
if (source.includes('/actions/artifacts?per_page=')) fail('MISSION_DIRECTED_REPOSITORY_GLOBAL_ARTIFACT_LOOKUP');
if (!source.includes('/actions/runs/${PRODUCER_RUN_ID}/artifacts?per_page=100')) fail('MISSION_CONSUMPTION_RUN_SCOPED_ARTIFACTS');
if (!source.includes('/actions/runs/${PREVIOUS_RUN_ID}/artifacts?per_page=100')) fail('MISSION_CURSOR_RUN_SCOPED_ARTIFACTS');
if (!source.includes(".path==\".github/workflows/kidults-asi-mission-consumption-v1.yml\"")) fail('MISSION_CONSUMPTION_WORKFLOW_IDENTITY');
if (!source.includes('test "$ARTIFACT_COUNT" = 1')) fail('MISSION_CONSUMPTION_EXACT_CARDINALITY');
if (!source.includes('test "$UPSTREAM_HEAD_SHA" = "$TARGET_SHA"')) fail('MISSION_CONSUMPTION_EXACT_SHA');
if (!source.includes('mission_consumption_run_id:Number(process.env.MISSION_CONSUMPTION_RUN_ID)')) fail('MISSION_RECEIPT_PRODUCER_RUN');
if (!source.includes('mission_consumption_artifact_digest:process.env.MISSION_CONSUMPTION_ARTIFACT_DIGEST')) fail('MISSION_RECEIPT_ARTIFACT_DIGEST');
if (!source.includes('exact_generation_bound:true,artifact_cardinality:1')) fail('MISSION_RECEIPT_EXACT_GENERATION');
if (!source.includes("validation_only:process.env.MISSION_VALIDATION_ONLY==='true',promotion_authority:false")) fail('MISSION_PR_NON_PROMOTABLE');

const forbidden = [
  '/actions/artifacts?per_page=100',
  'group: kidults-asi-mission-directed-discovery-v1-${{ github.ref }}'
];
for (const mutation of forbidden) {
  if (source.includes(mutation)) fail(`MISSION_PROVENANCE_MUTATION:${mutation}`);
}

console.log(JSON.stringify({
  state: 'VERIFIED_PASS',
  workflow: workflowPath,
  exact_triggering_run_bound: true,
  exact_source_sha_bound: true,
  run_scoped_artifacts: true,
  exact_artifact_cardinality: true,
  rolling_cursor_run_scoped: true,
  public_release: 'HOLD',
  production: 'HOLD'
}, null, 2));
