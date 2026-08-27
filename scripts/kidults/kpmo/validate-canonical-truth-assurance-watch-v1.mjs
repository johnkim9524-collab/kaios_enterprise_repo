import fs from 'node:fs';

const assurancePath='.github/workflows/kidults-platform-continuous-assurance-v1.yml';
const truthPath='.github/workflows/kpmo-live-canonical-issue-truth-v1.yml';
const validatorPath='scripts/kidults/kpmo/validate-live-canonical-issue-truth-v1.mjs';
const assurance=fs.readFileSync(assurancePath,'utf8');
const truth=fs.readFileSync(truthPath,'utf8');
const validator=fs.readFileSync(validatorPath,'utf8');
const count=(source,needle)=>source.split(needle).length-1;
function validate(a,t,v){
 const f=[];const req=(ok,code)=>{if(!ok)f.push(code);};
 req(count(a,"- 'KPMO Live Canonical Issue Truth V1'")===1,'TRUTH_WATCH_CARDINALITY');
 req(a.includes("github.event.workflow_run.name == 'KPMO Live Canonical Issue Truth V1'"),'TRUTH_WATCH_CONDITION');
 req(a.includes('GH_TOKEN: ${{ github.token }}'),'TRUTH_GH_TOKEN_MISSING');
 req(a.includes('.path==".github/workflows/kpmo-live-canonical-issue-truth-v1.yml"'),'TRUTH_CANONICAL_PATH_MISSING');
 req(a.includes('.head_sha==$sha'),'TRUTH_EXACT_SHA_MISSING');
 req(a.includes('.conclusion==$conclusion'),'TRUTH_TERMINAL_CONCLUSION_MISSING');
 req(a.includes('TRUTH_ARTIFACT_COUNT" -eq 1'),'TRUTH_ARTIFACT_CARDINALITY_RELAXED');
 req(a.includes('canonical-truth-receipt-v1.json'),'TRUTH_RECEIPT_DOWNLOAD_MISSING');
 req(a.includes('.validation_outcome==$outcome'),'TRUTH_RECEIPT_OUTCOME_MISSING');
 req(a.includes('.state==$state'),'TRUTH_RECEIPT_STATE_MISSING');
 req(a.includes('if [ "$EXPECTED_TRUTH_STATE" != VERIFIED_PASS ]; then'),'TRUTH_FAILURE_PROPAGATION_MISSING');
 req(!/workflow_run:\s*[\s\S]*?conclusions:\s*\[\s*success\s*\]/m.test(a),'TRUTH_SUCCESS_ONLY_FILTER');
 req(a.includes('canonical-truth-upstream-binding.json'),'TRUTH_BINDING_RECEIPT_MISSING');
 req(t.includes('id: validate'),'TRUTH_VALIDATION_STEP_ID_MISSING');
 req(/- name: Emit exact canonical-truth receipt\n\s+if: always\(\)/.test(t),'TRUTH_RECEIPT_EMIT_ALWAYS_MISSING');
 req(/- name: Upload exact canonical-truth receipt\n\s+if: always\(\)/.test(t),'TRUTH_RECEIPT_UPLOAD_ALWAYS_MISSING');
 req(t.includes("receipt_id:'kpmo-live-canonical-issue-truth-receipt-v1'"),'TRUTH_RECEIPT_ID_MISSING');
 req(t.includes("version:'1.2.0'"),'TRUTH_RECEIPT_VERSION_MISSING');
 req(t.includes("state:outcome==='success'?'VERIFIED_PASS':'VERIFIED_FAIL'"),'TRUTH_RECEIPT_STATE_DERIVATION_MISSING');
 req(t.includes('truth_phase:process.env.RECEIPT_PHASE'),'TRUTH_RECEIPT_PHASE_MISSING');
 req(t.includes('canonical_body_main_sha:process.env.RECEIPT_BODY_MAIN_SHA'),'TRUTH_RECEIPT_GENERATION_MISSING');
 req(t.includes('kpmo-live-canonical-issue-truth-v1-${{ github.run_id }}'),'TRUTH_ARTIFACT_RUN_BINDING_MISSING');
 req(t.includes('promotion_eligible:false'),'TRUTH_PROMOTION_HOLD_MISSING');
 req(t.includes("production:'HOLD'")&&t.includes("public:'HOLD'")&&t.includes("g5:'HOLD'"),'TRUTH_RELEASE_HOLD_MISSING');
 req(t.includes("CANONICAL_TRUTH_PHASE: ${{ github.event_name == 'push' && 'TRANSITION' || github.event_name == 'pull_request' && 'PREMERGE' || 'SYNCHRONIZED' }}"),'TRUTH_PHASE_BINDING_MISSING');
 req(t.includes("CANONICAL_CORRECTION_PR_NUMBER: '1443'"),'TRUTH_CORRECTION_PR_BINDING_MISSING');
 req(t.includes("cron: '13,43 * * * *'"),'TRUTH_BOUNDED_SYNC_WATCHDOG_MISSING');
 req(t.includes("RECEIPT_BODY_MAIN_SHA: ${{ steps.validate.outputs.canonical_body_main_sha || 'UNAVAILABLE' }}"),'TRUTH_RECEIPT_GENERATION_OUTPUT_MISSING');
 req(!t.includes('issues: write')&&!t.includes('actions: write'),'TRUTH_READ_ONLY_PERMISSION_BOUNDARY_BROKEN');
 req(t.includes("github.event_name == 'issues' && format('issue-{0}', github.event.issue.number)"),'TRUTH_ISSUE_SCOPED_CONCURRENCY_MISSING');
 req(/\['PREMERGE','TRANSITION','SYNCHRONIZED'\]/.test(v),'TRUTH_THREE_PHASE_VALIDATOR_MISSING');
 req(v.includes("truthPhase==='TRANSITION'"),'TRUTH_TRANSITION_BINDING_MISSING');
 req(v.includes('new Set([observedMain,parent])'),'TRUTH_TRANSITION_CURRENT_OR_PARENT_BOUND_MISSING');
 req(v.includes("truthPhase==='SYNCHRONIZED'&&bodyMain!==observedMain"),'TRUTH_EXACT_SYNC_VALIDATION_MISSING');
 req(v.includes("truthPhase==='PREMERGE'"),'TRUTH_PREMERGE_BOUND_MISSING');
 req(v.includes('new Set([observedMain,parent].filter(isSha))'),'TRUTH_PREMERGE_CURRENT_OR_PARENT_BOUND_MISSING');
 req(v.includes('canonical generations diverged'),'TRUTH_COHERENCE_VALIDATION_MISSING');
 req(v.includes("truth_source_policy:'LATEST_TRUSTED_APPEND_ONLY_RECEIPT_V3_ELSE_LEGACY_BODY_V2'"),'TRUTH_APPEND_ONLY_SOURCE_POLICY_MISSING');
 req(v.includes("github_read_mode:'SINGLE_GRAPHQL_BATCH'"),'TRUTH_BATCH_READ_REGRESSION');
 req(v.includes('stale-main mutation escaped'),'TRUTH_STALE_MUTATION_MISSING');
 req(v.includes('active-defect omission escaped'),'TRUTH_DEFECT_OMISSION_MUTATION_MISSING');
 req(v.includes('false-closure mutation escaped'),'TRUTH_FALSE_CLOSURE_MUTATION_MISSING');
 req(v.includes('fs.appendFileSync(process.env.GITHUB_OUTPUT'),'TRUTH_GENERATION_OUTPUT_MISSING');
 return f;
}
const base=validate(assurance,truth,validator);if(base.length){console.error(JSON.stringify({state:'VERIFIED_FAIL',failures:base},null,2));process.exit(1);}
const mutations=[
 ['watch removal',assurance.replace("      - 'KPMO Live Canonical Issue Truth V1'\n",''),truth,validator],
 ['failure propagation removal',assurance.replace('if [ "$EXPECTED_TRUTH_STATE" != VERIFIED_PASS ]; then','if false; then'),truth,validator],
 ['phase binding removal',assurance,truth.replace("          CANONICAL_TRUTH_PHASE: ${{ github.event_name == 'push' && 'TRANSITION' || github.event_name == 'pull_request' && 'PREMERGE' || 'SYNCHRONIZED' }}\n",''),validator],
 ['permission expansion',assurance,truth.replace('  issues: read','  issues: write'),validator],
 ['issue concurrency regression',assurance,truth.replace("format('issue-{0}', github.event.issue.number)",'github.sha'),validator],
 ['transition bound removal',assurance,truth,validator.replace('const allowed=new Set([observedMain,parent]);','const allowed=new Set([observedMain]);')],
 ['sync bound removal',assurance,truth,validator.replace("if(truthPhase==='SYNCHRONIZED'&&bodyMain!==observedMain)",'if(false)')],
 ['active-defect mutation removal',assurance,truth,validator.replace("if(!validateTexts(bodyMain,correctionHead,om,active,requireCorrectionHead).length)fail('active-defect omission escaped');",'void om;')]
];
const escaped=[];for(const [n,a,t,v] of mutations)if(validate(a,t,v).length===0)escaped.push(n);if(escaped.length){console.error(JSON.stringify({state:'VERIFIED_FAIL',escaped_mutations:escaped},null,2));process.exit(1);}
console.log(JSON.stringify({state:'VERIFIED_PASS',truth_watch_cardinality:1,receipt_semantics:'EXACT_RUN_SHA_PATH_TERMINAL_STATE_AND_CANONICAL_GENERATION',transition_protocol:'CURRENT_OR_IMMEDIATE_PARENT_TO_EXACT_SYNCHRONIZED_CURRENT_MAIN',bounded_sync_watchdog_minutes:30,canonical_generation_lag_commits:1,canonical_writer:'OWNER_APPEND_ONLY_RECEIPT_V3_WITHOUT_ACTIONS_WRITE_EXPANSION',canonical_board_union:25,issue_concurrency:'EXACT_ISSUE_NUMBER',github_read_mode:'SINGLE_GRAPHQL_BATCH',failure_propagation:'FAIL_CLOSED',mutations_blocked:mutations.length,promotion_eligible:false,production:'HOLD',public:'HOLD',g5:'HOLD'},null,2));
