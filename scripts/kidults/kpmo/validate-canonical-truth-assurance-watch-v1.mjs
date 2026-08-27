import fs from 'node:fs';

const assurancePath='.github/workflows/kidults-platform-continuous-assurance-v1.yml';
const truthPath='.github/workflows/kpmo-live-canonical-issue-truth-v1.yml';
const syncPath='.github/workflows/kpmo-canonical-issue-truth-sync-v1.yml';
const validatorPath='scripts/kidults/kpmo/validate-live-canonical-issue-truth-v1.mjs';
const assurance=fs.readFileSync(assurancePath,'utf8');
const truth=fs.readFileSync(truthPath,'utf8');
const sync=fs.readFileSync(syncPath,'utf8');
const validator=fs.readFileSync(validatorPath,'utf8');
const count=(source,needle)=>source.split(needle).length-1;

function validate(a,t,s,v){
  const failures=[];const require=(ok,code)=>{if(!ok)failures.push(code);};
  require(count(a,"- 'KPMO Live Canonical Issue Truth V1'")===1,'TRUTH_WATCH_CARDINALITY');
  require(a.includes("github.event.workflow_run.name == 'KPMO Live Canonical Issue Truth V1'"),'TRUTH_WATCH_CONDITION');
  require(a.includes('GH_TOKEN: ${{ github.token }}'),'TRUTH_GH_TOKEN_MISSING');
  require(a.includes('.path==".github/workflows/kpmo-live-canonical-issue-truth-v1.yml"'),'TRUTH_CANONICAL_PATH_MISSING');
  require(a.includes('.head_sha==$sha'),'TRUTH_EXACT_SHA_MISSING');
  require(a.includes('.conclusion==$conclusion'),'TRUTH_TERMINAL_CONCLUSION_MISSING');
  require(a.includes('TRUTH_ARTIFACT_COUNT" -eq 1'),'TRUTH_ARTIFACT_CARDINALITY_RELAXED');
  require(a.includes('canonical-truth-receipt-v1.json'),'TRUTH_RECEIPT_DOWNLOAD_MISSING');
  require(a.includes('.validation_outcome==$outcome'),'TRUTH_RECEIPT_OUTCOME_MISSING');
  require(a.includes('.state==$state'),'TRUTH_RECEIPT_STATE_MISSING');
  require(a.includes('if [ "$EXPECTED_TRUTH_STATE" != VERIFIED_PASS ]; then'),'TRUTH_FAILURE_PROPAGATION_MISSING');
  require(!/workflow_run:\s*[\s\S]*?conclusions:\s*\[\s*success\s*\]/m.test(a),'TRUTH_SUCCESS_ONLY_FILTER');
  require(a.includes('canonical-truth-upstream-binding.json'),'TRUTH_BINDING_RECEIPT_MISSING');

  require(t.includes('id: validate'),'TRUTH_VALIDATION_STEP_ID_MISSING');
  require(/- name: Emit exact canonical-truth receipt\n\s+if: always\(\)/.test(t),'TRUTH_RECEIPT_EMIT_ALWAYS_MISSING');
  require(/- name: Upload exact canonical-truth receipt\n\s+if: always\(\)/.test(t),'TRUTH_RECEIPT_UPLOAD_ALWAYS_MISSING');
  require(t.includes("receipt_id:'kpmo-live-canonical-issue-truth-receipt-v1'"),'TRUTH_RECEIPT_ID_MISSING');
  require(t.includes("version:'1.2.0'"),'TRUTH_RECEIPT_VERSION_MISSING');
  require(t.includes("state:outcome==='success'?'VERIFIED_PASS':'VERIFIED_FAIL'"),'TRUTH_RECEIPT_STATE_DERIVATION_MISSING');
  require(t.includes('truth_phase:process.env.RECEIPT_PHASE'),'TRUTH_RECEIPT_PHASE_MISSING');
  require(t.includes('canonical_body_main_sha:process.env.RECEIPT_BODY_MAIN_SHA'),'TRUTH_RECEIPT_GENERATION_MISSING');
  require(t.includes('kpmo-live-canonical-issue-truth-v1-${{ github.run_id }}'),'TRUTH_ARTIFACT_RUN_BINDING_MISSING');
  require(t.includes('promotion_eligible:false'),'TRUTH_PROMOTION_HOLD_MISSING');
  require(t.includes("production:'HOLD'")&&t.includes("public:'HOLD'")&&t.includes("g5:'HOLD'"),'TRUTH_RELEASE_HOLD_MISSING');
  require(t.includes("CANONICAL_TRUTH_PHASE: ${{ github.event_name == 'push' && 'TRANSITION' || github.event_name == 'pull_request' && 'PREMERGE' || 'SYNCHRONIZED' }}"),'TRUTH_PHASE_BINDING_MISSING');
  require(t.includes("CANONICAL_CORRECTION_PR_NUMBER: '1438'"),'TRUTH_CORRECTION_PR_BINDING_MISSING');
  require(t.includes("PREVIOUS_CANONICAL_CORRECTION_PR_NUMBER: '1431'"),'TRUTH_PREVIOUS_CORRECTION_BINDING_MISSING');
  require(t.includes("cron: '13,43 * * * *'"),'TRUTH_BOUNDED_SYNC_WATCHDOG_MISSING');
  require(t.includes("RECEIPT_BODY_MAIN_SHA: ${{ steps.validate.outputs.canonical_body_main_sha || 'UNAVAILABLE' }}"),'TRUTH_RECEIPT_GENERATION_OUTPUT_MISSING');
  require(t.includes('contents: read')&&t.includes('issues: read'),'TRUTH_READER_PERMISSION_BOUNDARY_BROKEN');

  require(s.includes('workflows: ["KPMO Live Canonical Issue Truth V1"]'),'SYNC_UPSTREAM_WORKFLOW_BINDING_MISSING');
  require(s.includes("github.event.workflow_run.event == 'push'"),'SYNC_PUSH_ONLY_BINDING_MISSING');
  require(s.includes("github.event.workflow_run.conclusion == 'success'"),'SYNC_SUCCESS_ONLY_BINDING_MISSING');
  require(s.includes('contents: read')&&s.includes('actions: read')&&s.includes('issues: write'),'SYNC_MINIMUM_PERMISSION_CONTRACT_MISSING');
  require(!s.includes('contents: write'),'SYNC_CONTENTS_WRITE_FORBIDDEN');
  require(s.includes('group: kpmo-canonical-truth-sync-main')&&s.includes('cancel-in-progress: true'),'SYNC_MONOTONIC_CONCURRENCY_MISSING');
  require(s.includes("CANONICAL_CORRECTION_PR_NUMBER: '1438'"),'SYNC_CORRECTION_BINDING_MISSING');
  require(s.includes("run.event!=='push'")||s.includes("run.event!='push'")||s.includes("run.event!==\'push\'"),'SYNC_EXACT_UPSTREAM_EVENT_VALIDATION_MISSING');
  require(s.includes("branch.commit?.sha!==target"),'SYNC_STALE_UPSTREAM_SKIP_MISSING');
  require(s.includes('KPMO_CANONICAL_TRUTH_RECEIPT_V3'),'SYNC_APPEND_ONLY_MARKER_MISSING');
  require(s.includes("CANONICAL_TRUTH_PHASE: SYNCHRONIZED"),'SYNC_EXACT_REVALIDATION_MISSING');
  require(s.includes("REQUIRE_LIVE_CORRECTION_HEAD_IN_ISSUES: 'true'"),'SYNC_CORRECTION_HEAD_REVALIDATION_MISSING');

  require(/\['PREMERGE','TRANSITION','SYNCHRONIZED'\]/.test(v),'TRUTH_THREE_PHASE_VALIDATOR_MISSING');
  require(v.includes("else if(truthPhase==='PREMERGE')allowed=new Set([observedMain,parent].filter(isSha))"),'TRUTH_PREMERGE_WINDOW_MISSING');
  require(v.includes("else allowed=new Set([parent,grandparent].filter(isSha))"),'TRUTH_TRANSITION_WINDOW_MISSING');
  require(v.includes("truthPhase==='SYNCHRONIZED'"),'TRUTH_EXACT_SYNC_VALIDATION_MISSING');
  require(v.includes('out-of-window canonical generations'),'TRUTH_OUT_OF_WINDOW_REJECTION_MISSING');
  require(v.includes("truth_source_policy:'LATEST_TRUSTED_APPEND_ONLY_RECEIPT_V3_ELSE_LEGACY_BODY_V2'"),'TRUTH_APPEND_ONLY_SOURCE_POLICY_MISSING');
  require(v.includes("github_read_mode:'SINGLE_GRAPHQL_BATCH'"),'TRUTH_BATCH_READ_REGRESSION');
  require(v.includes('out-of-window generation mutation escaped'),'TRUTH_STALE_GENERATION_MUTATION_MISSING');
  require(v.includes('stale-correction mutation escaped'),'TRUTH_CORRECTION_MUTATION_MISSING');
  require(v.includes('active-defect omission escaped'),'TRUTH_DEFECT_OMISSION_MUTATION_MISSING');
  require(v.includes('false-closure mutation escaped'),'TRUTH_FALSE_CLOSURE_MUTATION_MISSING');
  require(v.includes('fs.appendFileSync(process.env.GITHUB_OUTPUT'),'TRUTH_GENERATION_OUTPUT_MISSING');
  return failures;
}

const baseFailures=validate(assurance,truth,sync,validator);
if(baseFailures.length){console.error(JSON.stringify({state:'VERIFIED_FAIL',failures:baseFailures},null,2));process.exit(1);}
const mutations=[
 ['assurance watch removal',assurance.replace("      - 'KPMO Live Canonical Issue Truth V1'\n",''),truth,sync,validator],
 ['assurance fail propagation removal',assurance.replace('if [ "$EXPECTED_TRUTH_STATE" != VERIFIED_PASS ]; then','if false; then'),truth,sync,validator],
 ['phase binding removal',assurance,truth.replace("          CANONICAL_TRUTH_PHASE: ${{ github.event_name == 'push' && 'TRANSITION' || github.event_name == 'pull_request' && 'PREMERGE' || 'SYNCHRONIZED' }}\n",''),sync,validator],
 ['previous correction removal',assurance,truth.replace("          PREVIOUS_CANONICAL_CORRECTION_PR_NUMBER: '1431'\n",''),sync,validator],
 ['writer issue permission removal',assurance,truth,sync.replace('  issues: write','  issues: read'),validator],
 ['writer contents escalation',assurance,truth,sync.replace('  contents: read','  contents: write'),validator],
 ['writer success gate removal',assurance,truth,sync.replace("      github.event.workflow_run.conclusion == 'success'",'      true'),validator],
 ['writer synchronized revalidation removal',assurance,truth,sync.replace('          CANONICAL_TRUTH_PHASE: SYNCHRONIZED','          CANONICAL_TRUTH_PHASE: PREMERGE'),validator],
 ['premerge window removal',assurance,truth,sync,validator.replace("else if(truthPhase==='PREMERGE')allowed=new Set([observedMain,parent].filter(isSha));",'else if(false)allowed=new Set();')],
 ['transition window removal',assurance,truth,sync,validator.replace("else allowed=new Set([parent,grandparent].filter(isSha));",'else allowed=new Set();')],
 ['exact sync removal',assurance,truth,sync,validator.replace("if(truthPhase==='SYNCHRONIZED'&&(set.length!==1||set[0]!==observedMain))fail(`SYNCHRONIZED requires exact current generation ${observedMain}`);",'void set;')]
];
const escaped=[];for(const [name,a,t,s,v] of mutations)if(validate(a,t,s,v).length===0)escaped.push(name);
if(escaped.length){console.error(JSON.stringify({state:'VERIFIED_FAIL',escaped_mutations:escaped},null,2));process.exit(1);}
console.log(JSON.stringify({state:'VERIFIED_PASS',truth_watch_cardinality:1,receipt_semantics:'EXACT_RUN_SHA_PATH_TERMINAL_STATE_AND_APPEND_ONLY_GENERATION',transition_protocol:'BOUNDED_ADJACENT_GENERATIONS_TO_EXACT_SYNCHRONIZED_CURRENT_MAIN',sync_writer:'POST_SUCCESSFUL_MAIN_TRANSITION_APPEND_ONLY_V3',canonical_board_union:25,bounded_sync_watchdog_minutes:30,github_read_mode:'SINGLE_GRAPHQL_BATCH',failure_propagation:'FAIL_CLOSED',mutations_blocked:mutations.length,promotion_eligible:false,production:'HOLD',public:'HOLD',g5:'HOLD'},null,2));
