import fs from 'node:fs';

const assurancePath = '.github/workflows/kidults-platform-continuous-assurance-v1.yml';
const truthPath = '.github/workflows/kpmo-live-canonical-issue-truth-v1.yml';
const syncPath = '.github/workflows/kpmo-canonical-issue-truth-sync-v1.yml';
const validatorPath = 'scripts/kidults/kpmo/validate-live-canonical-issue-truth-v1.mjs';
const assurance = fs.readFileSync(assurancePath, 'utf8');
const truth = fs.readFileSync(truthPath, 'utf8');
const sync = fs.readFileSync(syncPath, 'utf8');
const validator = fs.readFileSync(validatorPath, 'utf8');

const count = (source, needle) => source.split(needle).length - 1;

function validate(assuranceSource, truthSource, syncSource, validatorSource) {
  const failures = [];
  const require = (condition, code) => { if (!condition) failures.push(code); };

  require(count(assuranceSource, "- 'KPMO Live Canonical Issue Truth V1'") === 1, 'TRUTH_WATCH_CARDINALITY');
  require(assuranceSource.includes("github.event.workflow_run.name == 'KPMO Live Canonical Issue Truth V1'"), 'TRUTH_WATCH_CONDITION');
  require(assuranceSource.includes('GH_TOKEN: ${{ github.token }}'), 'TRUTH_GH_TOKEN_MISSING');
  require(assuranceSource.includes('.path==".github/workflows/kpmo-live-canonical-issue-truth-v1.yml"'), 'TRUTH_CANONICAL_PATH_MISSING');
  require(assuranceSource.includes('.head_sha==$sha'), 'TRUTH_EXACT_SHA_MISSING');
  require(assuranceSource.includes('.conclusion==$conclusion'), 'TRUTH_TERMINAL_CONCLUSION_MISSING');
  require(assuranceSource.includes('TRUTH_ARTIFACT_COUNT" -eq 1'), 'TRUTH_ARTIFACT_CARDINALITY_RELAXED');
  require(assuranceSource.includes('canonical-truth-receipt-v1.json'), 'TRUTH_RECEIPT_DOWNLOAD_MISSING');
  require(assuranceSource.includes('.validation_outcome==$outcome'), 'TRUTH_RECEIPT_OUTCOME_MISSING');
  require(assuranceSource.includes('.state==$state'), 'TRUTH_RECEIPT_STATE_MISSING');
  require(assuranceSource.includes('if [ "$EXPECTED_TRUTH_STATE" != VERIFIED_PASS ]; then'), 'TRUTH_FAILURE_PROPAGATION_MISSING');
  require(!/workflow_run:\s*[\s\S]*?conclusions:\s*\[\s*success\s*\]/m.test(assuranceSource), 'TRUTH_SUCCESS_ONLY_FILTER');
  require(assuranceSource.includes('canonical-truth-upstream-binding.json'), 'TRUTH_BINDING_RECEIPT_MISSING');

  require(truthSource.includes('id: validate'), 'TRUTH_VALIDATION_STEP_ID_MISSING');
  require(truthSource.includes('.github/workflows/kpmo-canonical-issue-truth-sync-v1.yml'), 'TRUTH_SYNC_PATH_TRIGGER_MISSING');
  require(/- name: Emit exact canonical-truth receipt\n\s+if: always\(\)/.test(truthSource), 'TRUTH_RECEIPT_EMIT_ALWAYS_MISSING');
  require(/- name: Upload exact canonical-truth receipt\n\s+if: always\(\)/.test(truthSource), 'TRUTH_RECEIPT_UPLOAD_ALWAYS_MISSING');
  require(truthSource.includes("receipt_id:'kpmo-live-canonical-issue-truth-receipt-v1'"), 'TRUTH_RECEIPT_ID_MISSING');
  require(truthSource.includes("version:'1.2.0'"), 'TRUTH_RECEIPT_VERSION_MISSING');
  require(truthSource.includes("state:outcome==='success'?'VERIFIED_PASS':'VERIFIED_FAIL'"), 'TRUTH_RECEIPT_STATE_DERIVATION_MISSING');
  require(truthSource.includes('truth_phase:process.env.RECEIPT_PHASE'), 'TRUTH_RECEIPT_PHASE_MISSING');
  require(truthSource.includes('canonical_body_main_sha:process.env.RECEIPT_BODY_MAIN_SHA'), 'TRUTH_RECEIPT_GENERATION_MISSING');
  require(truthSource.includes('kpmo-live-canonical-issue-truth-v1-${{ github.run_id }}'), 'TRUTH_ARTIFACT_RUN_BINDING_MISSING');
  require(truthSource.includes('promotion_eligible:false'), 'TRUTH_PROMOTION_HOLD_MISSING');
  require(truthSource.includes("production:'HOLD'") && truthSource.includes("public:'HOLD'") && truthSource.includes("g5:'HOLD'"), 'TRUTH_RELEASE_HOLD_MISSING');
  require(truthSource.includes("CANONICAL_TRUTH_PHASE: ${{ github.event_name == 'push' && 'TRANSITION' || github.event_name == 'pull_request' && 'PREMERGE' || 'SYNCHRONIZED' }}"), 'TRUTH_PHASE_BINDING_MISSING');
  require(truthSource.includes("CANONICAL_CORRECTION_PR_NUMBER: '1438'"), 'TRUTH_CORRECTION_PR_BINDING_MISSING');
  require(truthSource.includes("cron: '13,43 * * * *'"), 'TRUTH_BOUNDED_SYNC_WATCHDOG_MISSING');
  require(truthSource.includes("RECEIPT_BODY_MAIN_SHA: ${{ steps.validate.outputs.canonical_body_main_sha || 'UNAVAILABLE' }}"), 'TRUTH_RECEIPT_GENERATION_OUTPUT_MISSING');

  require(/\['PREMERGE'\s*,\s*'TRANSITION'\s*,\s*'SYNCHRONIZED'\]/.test(validatorSource), 'TRUTH_THREE_PHASE_VALIDATOR_MISSING');
  require(validatorSource.includes("truthPhase==='SYNCHRONIZED'"), 'TRUTH_EXACT_SYNC_VALIDATION_MISSING');
  require(validatorSource.includes('canonical generations diverged'), 'TRUTH_COHERENCE_VALIDATION_MISSING');
  require(validatorSource.includes("truthPhase==='TRANSITION'"), 'TRUTH_TRANSITION_PARENT_BINDING_MISSING');
  require(validatorSource.includes("truthPhase==='PREMERGE'"), 'TRUTH_PREMERGE_BOUND_MISSING');
  require(validatorSource.includes("truth_source_policy:'LATEST_TRUSTED_APPEND_ONLY_RECEIPT_V3_ELSE_LEGACY_BODY_V2'"), 'TRUTH_APPEND_ONLY_SOURCE_POLICY_MISSING');
  require(validatorSource.includes("github_read_mode:'SINGLE_GRAPHQL_BATCH'"), 'TRUTH_BATCH_READ_REGRESSION');
  require(validatorSource.includes('stale-main mutation escaped'), 'TRUTH_STALE_MUTATION_MISSING');
  require(validatorSource.includes('active-defect omission escaped'), 'TRUTH_DEFECT_OMISSION_MUTATION_MISSING');
  require(validatorSource.includes('false-closure mutation escaped'), 'TRUTH_FALSE_CLOSURE_MUTATION_MISSING');
  require(validatorSource.includes('fs.appendFileSync(process.env.GITHUB_OUTPUT'), 'TRUTH_GENERATION_OUTPUT_MISSING');

  require(syncSource.includes('name: KPMO Canonical Issue Truth Sync V1'), 'TRUTH_SYNC_WORKFLOW_MISSING');
  require(syncSource.includes('workflows: ["KPMO Live Canonical Issue Truth V1"]'), 'TRUTH_SYNC_UPSTREAM_WATCH_MISSING');
  require(syncSource.includes("github.event.workflow_run.conclusion == 'success'"), 'TRUTH_SYNC_SUCCESS_ONLY_ACTIVATION_MISSING');
  require(syncSource.includes("github.event.workflow_run.event == 'push'"), 'TRUTH_SYNC_PUSH_ONLY_ACTIVATION_MISSING');
  require(syncSource.includes("CANONICAL_CORRECTION_PR_NUMBER: '1438'"), 'TRUTH_SYNC_CORRECTION_BINDING_MISSING');
  require(syncSource.includes('<!-- KPMO_CANONICAL_TRUTH_RECEIPT_V3 -->'), 'TRUTH_SYNC_APPEND_ONLY_MARKER_MISSING');
  require(syncSource.includes('canonical_board_union: 25'), 'TRUTH_SYNC_BOARD_UNION_MISSING');
  require(syncSource.includes("await api(`/issues/${n}/comments`"), 'TRUTH_SYNC_APPEND_ONLY_WRITE_MISSING');
  require(syncSource.includes("branch.commit?.sha!==upstreamSha"), 'TRUTH_SYNC_PREWRITE_MAIN_BINDING_MISSING');
  require(syncSource.includes("live.commit?.sha!==upstreamSha"), 'TRUTH_SYNC_POSTWRITE_MAIN_BINDING_MISSING');
  require(syncSource.includes('/actions/workflows/kpmo-live-canonical-issue-truth-v1.yml/dispatches'), 'TRUTH_SYNC_READBACK_DISPATCH_MISSING');

  return failures;
}

const baseFailures = validate(assurance, truth, sync, validator);
if (baseFailures.length) {
  console.error(JSON.stringify({ state: 'VERIFIED_FAIL', failures: baseFailures }, null, 2));
  process.exit(1);
}

const mutations = [
  ['watch removal', assurance.replace("      - 'KPMO Live Canonical Issue Truth V1'\n", ''), truth, sync, validator],
  ['failure propagation removal', assurance.replace('if [ "$EXPECTED_TRUTH_STATE" != VERIFIED_PASS ]; then', 'if false; then'), truth, sync, validator],
  ['phase binding removal', assurance, truth.replace("          CANONICAL_TRUTH_PHASE: ${{ github.event_name == 'push' && 'TRANSITION' || github.event_name == 'pull_request' && 'PREMERGE' || 'SYNCHRONIZED' }}\n", ''), sync, validator],
  ['sync upstream success removal', assurance, truth, sync.replace("      github.event.workflow_run.conclusion == 'success'", '      true'), validator],
  ['sync append marker removal', assurance, truth, sync.replace('<!-- KPMO_CANONICAL_TRUTH_RECEIPT_V3 -->', 'REMOVED'), validator],
  ['sync post-write main readback removal', assurance, truth, sync.replace("if(live.commit?.sha!==upstreamSha)throw new Error(`main moved during sync: ${live.commit?.sha||'UNKNOWN'}`);", 'void live;'), validator],
  ['exact synchronized validation removal', assurance, truth, sync, validator.replace("if(truthPhase==='SYNCHRONIZED'&&bodyMain!==observedMain)fail(`SYNCHRONIZED requires current main ${observedMain}, observed ${bodyMain}`);", 'void bodyMain;')],
  ['coherence validation removal', assurance, truth, sync, validator.replace("if(set.length!==1)fail(`canonical generations diverged: ${set.join(',')}`);", 'void set;')],
  ['active-defect mutation removal', assurance, truth, sync, validator.replace("if(!validateTexts(bodyMain,correctionHead,om,active,requireCorrectionHead).length)fail('active-defect omission escaped');", 'void om;')]
];

const escaped = [];
for (const [name, a, t, s, v] of mutations) if (validate(a, t, s, v).length === 0) escaped.push(name);
if (escaped.length) {
  console.error(JSON.stringify({ state: 'VERIFIED_FAIL', escaped_mutations: escaped }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  state: 'VERIFIED_PASS',
  truth_watch_cardinality: 1,
  receipt_semantics: 'EXACT_RUN_SHA_PATH_TERMINAL_STATE_AND_CANONICAL_GENERATION',
  transition_protocol: 'PREMERGE_OR_IMMEDIATE_PARENT_TO_APPEND_ONLY_SYNCHRONIZED_CURRENT_MAIN',
  bounded_sync_watchdog_minutes: 30,
  canonical_generation_lag_commits: 1,
  canonical_writer: 'APPEND_ONLY_RECEIPT_V3',
  canonical_board_union: 25,
  github_read_mode: 'SINGLE_GRAPHQL_BATCH',
  failure_propagation: 'FAIL_CLOSED',
  mutations_blocked: mutations.length,
  promotion_eligible: false,
  production: 'HOLD',
  public: 'HOLD',
  g5: 'HOLD'
}, null, 2));
