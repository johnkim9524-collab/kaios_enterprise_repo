import fs from 'node:fs';

const assurancePath='.github/workflows/kidults-platform-continuous-assurance-v1.yml';
const truthPath='.github/workflows/kpmo-live-canonical-issue-truth-v1.yml';
const validatorPath='scripts/kidults/kpmo/validate-live-canonical-issue-truth-v1.mjs';
const assurance=fs.readFileSync(assurancePath,'utf8');
const truth=fs.readFileSync(truthPath,'utf8');
const validator=fs.readFileSync(validatorPath,'utf8');
const count=(source,needle)=>source.split(needle).length-1;

function validate(a,t,v){
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
  require(t.includes("version:'1.3.0'"),'TRUTH_RECEIPT_VERSION_MISSING');
  require(t.includes("canonical_anchor_policy:'MONOTONIC_ANCESTOR_OR_EQUAL'"),'TRUTH_ANCHOR_POLICY_RECEIPT_MISSING');
  require(t.includes('protected_main_sha:process.env.RECEIPT_PROTECTED_MAIN_SHA'),'TRUTH_EXACT_MAIN_RECEIPT_MISSING');
  require(t.includes('kpmo-live-canonical-issue-truth-v1-${{ github.run_id }}'),'TRUTH_ARTIFACT_RUN_BINDING_MISSING');
  require(t.includes('promotion_eligible:false'),'TRUTH_PROMOTION_HOLD_MISSING');
  require(t.includes("production:'HOLD'")&&t.includes("public:'HOLD'")&&t.includes("g5:'HOLD'"),'TRUTH_RELEASE_HOLD_MISSING');
  require(t.includes("CANONICAL_CORRECTION_PR_NUMBER: '1431'"),'TRUTH_LANDED_CORRECTION_BINDING_MISSING');
  require(!t.includes('issues: write')&&!t.includes('actions: write'),'TRUTH_READ_ONLY_PERMISSION_BOUNDARY_BROKEN');

  require(v.includes("canonical_anchor_policy:'MONOTONIC_ANCESTOR_OR_EQUAL'"),'TRUTH_MONOTONIC_POLICY_MISSING');
  require(v.includes("/compare/${sha}...${observedMain}"),'TRUTH_ANCESTRY_COMPARE_MISSING');
  require(v.includes("['ahead','identical'].includes(comparison.status)"),'TRUTH_ANCESTOR_OR_EQUAL_CHECK_MISSING');
  require(v.includes('SINGLE_GRAPHQL_BATCH_PLUS_UNIQUE_ANCHOR_COMPARE'),'TRUTH_BATCH_READ_REGRESSION');
  require(v.includes('missing canonical block mutation escaped'),'TRUTH_MISSING_BLOCK_MUTATION_MISSING');
  require(v.includes('active-defect omission mutation escaped'),'TRUTH_DEFECT_OMISSION_MUTATION_MISSING');
  require(v.includes('false-closure mutation escaped'),'TRUTH_FALSE_CLOSURE_MUTATION_MISSING');
  require(!v.includes('canonical generations diverged'),'TRUTH_EQUAL_GENERATION_COUPLING_REINTRODUCED');
  require(!v.includes("SYNCHRONIZED requires current main"),'TRUTH_EXACT_BODY_SHA_COUPLING_REINTRODUCED');
  return failures;
}

const baseFailures=validate(assurance,truth,validator);if(baseFailures.length){console.error(JSON.stringify({state:'VERIFIED_FAIL',failures:baseFailures},null,2));process.exit(1);}
const mutations=[
  ['watch removal',assurance.replace("      - 'KPMO Live Canonical Issue Truth V1'\n",''),truth,validator],
  ['failure propagation removal',assurance.replace('if [ "$EXPECTED_TRUTH_STATE" != VERIFIED_PASS ]; then','if false; then'),truth,validator],
  ['write permission expansion',assurance,truth.replace('  issues: read','  issues: write'),validator],
  ['anchor receipt removal',assurance,truth.replace("canonical_anchor_policy:'MONOTONIC_ANCESTOR_OR_EQUAL',",''),validator],
  ['ancestry compare removal',assurance,truth,validator.replace("comparison=await github(`/compare/${sha}...${observedMain}`)","comparison={status:'ahead'}")],
  ['defect mutation removal',assurance,truth,validator.replace("if(!staticErrors(omission,active).length)fail('active-defect omission mutation escaped');",'void omission;')]
];
const escaped=[];for(const [name,a,t,v] of mutations)if(validate(a,t,v).length===0)escaped.push(name);if(escaped.length){console.error(JSON.stringify({state:'VERIFIED_FAIL',escaped_mutations:escaped},null,2));process.exit(1);}
console.log(JSON.stringify({state:'VERIFIED_PASS',truth_watch_cardinality:1,canonical_anchor_policy:'MONOTONIC_ANCESTOR_OR_EQUAL',exact_main_authority:'MACHINE_RECEIPT',canonical_issue_writer:'NONE_REQUIRED',permission_boundary:'READ_ONLY',failure_propagation:'FAIL_CLOSED',mutations_blocked:mutations.length,promotion_eligible:false,production:'HOLD',public:'HOLD',g5:'HOLD'},null,2));
