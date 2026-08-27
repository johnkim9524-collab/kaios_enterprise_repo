import fs from 'node:fs';

const assurancePath = '.github/workflows/kidults-platform-continuous-assurance-v1.yml';
const truthPath = '.github/workflows/kpmo-live-canonical-issue-truth-v1.yml';
const validatorPath = 'scripts/kidults/kpmo/validate-live-canonical-issue-truth-v1.mjs';
const assurance = fs.readFileSync(assurancePath, 'utf8');
const truth = fs.readFileSync(truthPath, 'utf8');
const validator = fs.readFileSync(validatorPath, 'utf8');

function count(source, needle) {
  return source.split(needle).length - 1;
}

function validate(assuranceSource, truthSource, validatorSource) {
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
  require(/- name: Emit exact canonical-truth receipt\n\s+if: always\(\)/.test(truthSource), 'TRUTH_RECEIPT_EMIT_ALWAYS_MISSING');
  require(/- name: Upload exact canonical-truth receipt\n\s+if: always\(\)/.test(truthSource), 'TRUTH_RECEIPT_UPLOAD_ALWAYS_MISSING');
  require(truthSource.includes("receipt_id: 'kpmo-live-canonical-issue-truth-receipt-v1'"), 'TRUTH_RECEIPT_ID_MISSING');
  require(truthSource.includes("state: outcome === 'success' ? 'VERIFIED_PASS' : 'VERIFIED_FAIL'"), 'TRUTH_RECEIPT_STATE_DERIVATION_MISSING');
  require(truthSource.includes('kpmo-live-canonical-issue-truth-v1-${{ github.run_id }}'), 'TRUTH_ARTIFACT_RUN_BINDING_MISSING');
  require(truthSource.includes('promotion_eligible: false'), 'TRUTH_PROMOTION_HOLD_MISSING');
  require(truthSource.includes("production: 'HOLD'") && truthSource.includes("public: 'HOLD'"), 'TRUTH_RELEASE_HOLD_MISSING');

  require(truthSource.includes("EXPECTED_CANONICAL_BODY_MAIN_SHA: ${{ github.event_name == 'push' && github.event.before || '' }}"), 'TRUTH_PREVIOUS_GENERATION_BINDING_MISSING');
  require(truthSource.includes("CANONICAL_TRUTH_PHASE: ${{ github.event_name == 'push' && 'TRANSITION' || 'SYNCHRONIZED' }}"), 'TRUTH_PHASE_BINDING_MISSING');
  require(truthSource.includes("cron: '13,43 * * * *'"), 'TRUTH_BOUNDED_SYNC_WATCHDOG_MISSING');
  require(truthSource.includes("version: '1.1.0'"), 'TRUTH_RECEIPT_PHASE_VERSION_MISSING');
  require(truthSource.includes('truth_phase: process.env.RECEIPT_PHASE'), 'TRUTH_RECEIPT_PHASE_MISSING');
  require(truthSource.includes('canonical_body_main_sha: process.env.RECEIPT_BODY_MAIN_SHA'), 'TRUTH_RECEIPT_BODY_GENERATION_MISSING');

  require(validatorSource.includes("truthPhase === 'TRANSITION'"), 'TRUTH_TRANSITION_VALIDATION_MISSING');
  require(validatorSource.includes('expectedCanonicalBodyMainSha'), 'TRUTH_PREVIOUS_GENERATION_VALIDATOR_MISSING');
  require(validatorSource.includes("fail('future-SHA transition mutation was not rejected')"), 'TRUTH_FUTURE_SHA_MUTATION_MISSING');
  require(validatorSource.includes("github_read_mode: 'SINGLE_GRAPHQL_BATCH'"), 'TRUTH_BATCH_READ_REGRESSION');

  return failures;
}

const baseFailures = validate(assurance, truth, validator);
if (baseFailures.length) {
  console.error(JSON.stringify({ state: 'VERIFIED_FAIL', failures: baseFailures }, null, 2));
  process.exit(1);
}

const mutations = [
  ['watch removal', assurance.replace("      - 'KPMO Live Canonical Issue Truth V1'\n", ''), truth, validator],
  ['wrong canonical path', assurance.replaceAll('.github/workflows/kpmo-live-canonical-issue-truth-v1.yml', '.github/workflows/wrong.yml'), truth, validator],
  ['wrong exact SHA', assurance.replaceAll('.head_sha==$sha', '.head_sha=="deadbeef"'), truth, validator],
  ['relaxed artifact cardinality', assurance.replace('test "$TRUTH_ARTIFACT_COUNT" -eq 1', 'test "$TRUTH_ARTIFACT_COUNT" -ge 0'), truth, validator],
  ['removed receipt outcome', assurance.replace('and .validation_outcome==$outcome', 'and true'), truth, validator],
  ['removed failure propagation', assurance.replace('if [ "$EXPECTED_TRUTH_STATE" != VERIFIED_PASS ]; then', 'if false; then'), truth, validator],
  ['hard-coded PASS receipt', assurance, truth.replace("state: outcome === 'success' ? 'VERIFIED_PASS' : 'VERIFIED_FAIL'", "state: 'VERIFIED_PASS'"), validator],
  ['receipt upload not always', assurance, truth.replace('      - name: Upload exact canonical-truth receipt\n        if: always()', '      - name: Upload exact canonical-truth receipt'), validator],
  ['removed previous generation binding', assurance, truth.replace("          EXPECTED_CANONICAL_BODY_MAIN_SHA: ${{ github.event_name == 'push' && github.event.before || '' }}\n", ''), validator],
  ['removed phase binding', assurance, truth.replace("          CANONICAL_TRUTH_PHASE: ${{ github.event_name == 'push' && 'TRANSITION' || 'SYNCHRONIZED' }}\n", ''), validator],
  ['removed bounded watchdog', assurance, truth.replace("  schedule:\n    - cron: '13,43 * * * *'\n", ''), validator],
  ['removed transition validator', assurance, truth, validator.replaceAll("truthPhase === 'TRANSITION'", "truthPhase === 'DISABLED'")],
  ['removed future-SHA mutation', assurance, truth, validator.replace("if (!validateBodies(bodyMainSha, correctionHead, futureShaMutation, activeDefects, requireLiveCorrectionHead).length) fail('future-SHA transition mutation was not rejected');", "void futureShaMutation;")]
];

const escaped = [];
for (const [name, assuranceMutation, truthMutation, validatorMutation] of mutations) {
  if (validate(assuranceMutation, truthMutation, validatorMutation).length === 0) escaped.push(name);
}
if (escaped.length) {
  console.error(JSON.stringify({ state: 'VERIFIED_FAIL', escaped_mutations: escaped }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  state: 'VERIFIED_PASS',
  truth_watch_cardinality: 1,
  receipt_semantics: 'EXACT_RUN_SHA_PATH_TERMINAL_STATE_AND_TRUTH_PHASE',
  transition_protocol: 'PRIOR_GENERATION_TO_SYNCHRONIZED_CURRENT_MAIN',
  bounded_sync_watchdog_minutes: 30,
  github_read_mode: 'SINGLE_GRAPHQL_BATCH',
  failure_propagation: 'FAIL_CLOSED',
  mutations_blocked: mutations.length,
  promotion_eligible: false,
  production: 'HOLD',
  public: 'HOLD'
}, null, 2));
