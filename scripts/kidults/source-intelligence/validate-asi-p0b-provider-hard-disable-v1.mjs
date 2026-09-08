import fs from 'node:fs';

const workflowPath = process.argv[2] || '.github/workflows/kidults-asi-p0b-bounded-discovery-candidates-v1.yml';
const source = fs.readFileSync(workflowPath, 'utf8');
const assert = (condition, code) => { if (!condition) throw new Error(code); };

const validate = (text) => {
  const permissionsIndex = text.indexOf('\npermissions:');
  assert(permissionsIndex > 0, 'PERMISSIONS_BOUNDARY_MISSING');
  const triggerHeader = text.slice(0, permissionsIndex);
  assert(!/\n  schedule:/.test(triggerHeader), 'P0B_INDEPENDENT_SCHEDULE_FORBIDDEN');
  assert(!/\n  push:/.test(triggerHeader), 'P0B_INDEPENDENT_PUSH_FORBIDDEN');
  assert(/\n  workflow_run:\n[\s\S]*KIDULTS ASI P0 Mission Consumption v1/.test(triggerHeader), 'P0_MISSION_WORKFLOW_RUN_TRIGGER_MISSING');
  assert(!/\n  workflow_run:\n[\s\S]*KIDULTS ASI Source Fabric Scale PI1/.test(triggerHeader), 'DIRECT_SOURCE_FABRIC_FANOUT_FORBIDDEN');
  assert(triggerHeader.includes('workflow_dispatch:'), 'RECOVERY_DISPATCH_MISSING');
  assert(triggerHeader.includes('pull_request:'), 'PR_CONTRACT_VALIDATION_MISSING');

  assert(text.includes('contents: read') && text.includes('actions: read'), 'READ_ONLY_PERMISSIONS_MISSING');
  assert(!text.includes('contents: write'), 'CONTENTS_WRITE_FORBIDDEN');
  assert(!text.includes('ASI_SCOPE_ROTATION='), 'DIRECT_PROVIDER_ROTATION_FORBIDDEN');
  assert(!text.includes('node scripts/kidults/source-intelligence/asi-openalex-gdelt-public-metadata-discovery-v1.mjs'), 'DIRECT_OPENALEX_GDELT_EXECUTION_FORBIDDEN');
  assert(!text.includes('P0B_DIRECT_PROVIDER_EXECUTION_HARD_DISABLED'), 'DEAD_JOB_HARD_DISABLE_SENTINEL_FORBIDDEN');
  assert(!text.includes('Enforce P0B direct-provider hard-disable'), 'DEAD_JOB_HARD_DISABLE_STEP_FORBIDDEN');

  assert(text.includes("test \"$EVENT_WORKFLOW_NAME\" = 'KIDULTS ASI P0 Mission Consumption v1'"), 'P0_MISSION_NAME_BINDING_MISSING');
  assert(text.includes("test \"$EVENT_WORKFLOW_PATH\" = '.github/workflows/kidults-asi-p0-mission-consumption-v1.yml'"), 'P0_MISSION_PATH_BINDING_MISSING');
  assert(text.includes('test "$EVENT_REPOSITORY" = "$GITHUB_REPOSITORY"'), 'P0_MISSION_REPOSITORY_BINDING_MISSING');
  assert(text.includes('test "$EVENT_SOURCE_SHA" = "$LIVE_MAIN_SHA"'), 'P0_MISSION_LIVE_MAIN_BINDING_MISSING');
  assert(text.includes('case "$EVENT_WORKFLOW_EVENT" in schedule|workflow_dispatch|push|workflow_run)'), 'P0_MISSION_RUNTIME_EVENT_FILTER_MISSING');

  assert(text.includes('-f head_sha="$EXPECTED_GENERATION_SHA"'), 'SOURCE_FABRIC_EXACT_SHA_QUERY_MISSING');
  assert(text.includes('.name=="KIDULTS ASI Source Fabric Scale PI1"'), 'SOURCE_FABRIC_NAME_BINDING_MISSING');
  assert(text.includes('.path==".github/workflows/kidults-asi-source-fabric-scale-pi1.yml"'), 'SOURCE_FABRIC_PATH_BINDING_MISSING');
  assert(text.includes('(.event=="schedule" or .event=="workflow_dispatch" or .event=="push")'), 'SOURCE_FABRIC_RUNTIME_EVENT_FILTER_MISSING');
  assert(text.includes('.head_sha==$sha'), 'SOURCE_FABRIC_SOURCE_SHA_BINDING_MISSING');
  assert(text.includes('.workflow_run.id==$run') && text.includes('.workflow_run.head_sha==$sha'), 'ARTIFACT_RUN_SHA_BINDING_MISSING');
  assert(text.includes('.expired==false'), 'ARTIFACT_EXPIRY_BINDING_MISSING');
  assert(text.includes('kidults-asi-source-fabric-scale-pi1'), 'SOURCE_FABRIC_ARTIFACT_NAME_MISSING');
  assert(text.includes('--expected-digest "$SOURCE_FABRIC_ARTIFACT_DIGEST"'), 'SAFE_ZIP_DIGEST_PRECHECK_MISSING');
  assert(text.indexOf('--expected-digest "$SOURCE_FABRIC_ARTIFACT_DIGEST"') < text.indexOf('unzip -q -o /tmp/p0b-source-fabric.zip'), 'SAFE_ZIP_CHECK_ORDER_INVALID');
  assert(text.includes('--required-basename asi-public-metadata-source-fabric-v1.json'), 'SOURCE_FABRIC_REQUIRED_BASENAME_MISSING');
  assert(text.includes('--required-basename asi-source-fabric-scale-pi1-receipt.json'), 'SOURCE_FABRIC_RECEIPT_REQUIRED_BASENAME_MISSING');
  assert(text.includes('Build P0B source candidate increment from Source Fabric'), 'P0B_LIVENESS_CONSUMER_STAGE_MISSING');

  assert(text.includes('provider_requests_issued_by_p0b:0'), 'ZERO_PROVIDER_REQUEST_RECEIPT_MISSING');
  assert(text.includes('provider_execution_authority:false'), 'PROVIDER_AUTHORITY_FALSE_MISSING');
  assert(text.includes('shared_provider_budget_required:true'), 'SHARED_BUDGET_REQUIREMENT_MISSING');
  assert(text.includes("evidence_admission:'NONE'"), 'EVIDENCE_HOLD_MISSING');
  assert(text.includes("public_release:'HOLD'"), 'PUBLIC_HOLD_MISSING');
  assert(text.includes("production:'HOLD'"), 'PRODUCTION_HOLD_MISSING');
  assert(text.includes("g5:'HOLD'"), 'G5_HOLD_MISSING');
};

validate(source);

const mutations = [
  ['schedule', source.replace('  workflow_dispatch:\n', "  workflow_dispatch:\n  schedule:\n    - cron: '37 * * * *'\n")],
  ['push', source.replace('  workflow_dispatch:\n', "  workflow_dispatch:\n  push:\n    branches: [main]\n")],
  ['direct_source_fabric_fanout', source.replace("- 'KIDULTS ASI P0 Mission Consumption v1'", "- 'KIDULTS ASI Source Fabric Scale PI1'")],
  ['provider_execution', source.replace('      - name: Rebuild current P0 mission task queue\n', "      - name: Direct provider regression\n        run: node scripts/kidults/source-intelligence/asi-openalex-gdelt-public-metadata-discovery-v1.mjs /tmp/direct.json\n      - name: Rebuild current P0 mission task queue\n")],
  ['p0_mission_event', source.replace('case "$EVENT_WORKFLOW_EVENT" in schedule|workflow_dispatch|push|workflow_run)', 'case "$EVENT_WORKFLOW_EVENT" in schedule|workflow_dispatch|push|workflow_run|pull_request)')],
  ['live_main', source.replace('test "$EVENT_SOURCE_SHA" = "$LIVE_MAIN_SHA"', ':')],
  ['source_fabric_sha', source.replace('-f head_sha="$EXPECTED_GENERATION_SHA"', '-f per_page=100')],
  ['artifact_run_binding', source.replace('.workflow_run.id==$run', 'true')],
  ['safe_zip', source.replace('--expected-digest "$SOURCE_FABRIC_ARTIFACT_DIGEST"', '--expected-digest sha256:0000000000000000000000000000000000000000000000000000000000000000')],
  ['request_count', source.replace('provider_requests_issued_by_p0b:0', 'provider_requests_issued_by_p0b:1')],
  ['provider_authority', source.replace('provider_execution_authority:false', 'provider_execution_authority:true')],
  ['evidence_boundary', source.replace("evidence_admission:'NONE'", "evidence_admission:'ADMITTED'")]
];

let rejected = 0;
for (const [name, mutation] of mutations) {
  try {
    validate(mutation);
    throw new Error('MUTATION_ACCEPTED:' + name);
  } catch (error) {
    if (String(error.message).startsWith('MUTATION_ACCEPTED:')) throw error;
    rejected += 1;
  }
}

process.stdout.write(JSON.stringify({
  state: 'VERIFIED_PASS',
  control: 'P0B_P0_MISSION_CHAINED_EXACT_SOURCE_FABRIC_CONSUMER_ONLY',
  normal_trigger: 'P0_MISSION_WORKFLOW_RUN',
  direct_source_fabric_fanout: false,
  independent_provider_triggers: 0,
  provider_requests_issued_by_p0b: 0,
  provider_execution_authority: false,
  candidate_pipeline_liveness_preserved: true,
  exact_same_generation_source_fabric_provenance_required: true,
  mutation_rejections: rejected,
  mutation_total: mutations.length,
  evidence_admission: 'NONE',
  public_release: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD'
}, null, 2) + '\n');
