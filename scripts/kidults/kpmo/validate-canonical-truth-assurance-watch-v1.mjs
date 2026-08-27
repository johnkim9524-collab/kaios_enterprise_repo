import fs from 'node:fs';

const assurancePath = '.github/workflows/kidults-platform-continuous-assurance-v1.yml';
const truthPath = '.github/workflows/kpmo-live-canonical-issue-truth-v1.yml';
const assurance = fs.readFileSync(assurancePath, 'utf8');
const truth = fs.readFileSync(truthPath, 'utf8');

function count(source, needle) {
  return source.split(needle).length - 1;
}

function validate(assuranceSource, truthSource) {
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

  return failures;
}

const baseFailures = validate(assurance, truth);
if (baseFailures.length) {
  console.error(JSON.stringify({ state: 'VERIFIED_FAIL', failures: baseFailures }, null, 2));
  process.exit(1);
}

const mutations = [
  ['watch removal', assurance.replace("      - 'KPMO Live Canonical Issue Truth V1'\n", ''), truth],
  ['wrong canonical path', assurance.replaceAll('.github/workflows/kpmo-live-canonical-issue-truth-v1.yml', '.github/workflows/wrong.yml'), truth],
  ['wrong exact SHA', assurance.replaceAll('.head_sha==$sha', '.head_sha=="deadbeef"'), truth],
  ['relaxed artifact cardinality', assurance.replace('test "$TRUTH_ARTIFACT_COUNT" -eq 1', 'test "$TRUTH_ARTIFACT_COUNT" -ge 0'), truth],
  ['removed receipt outcome', assurance.replace('and .validation_outcome==$outcome', 'and true'), truth],
  ['removed failure propagation', assurance.replace('if [ "$EXPECTED_TRUTH_STATE" != VERIFIED_PASS ]; then', 'if false; then'), truth],
  ['hard-coded PASS receipt', assurance, truth.replace("state: outcome === 'success' ? 'VERIFIED_PASS' : 'VERIFIED_FAIL'", "state: 'VERIFIED_PASS'")],
  ['receipt upload not always', assurance, truth.replace('      - name: Upload exact canonical-truth receipt\n        if: always()', '      - name: Upload exact canonical-truth receipt')]
];

const escaped = [];
for (const [name, assuranceMutation, truthMutation] of mutations) {
  if (validate(assuranceMutation, truthMutation).length === 0) escaped.push(name);
}
if (escaped.length) {
  console.error(JSON.stringify({ state: 'VERIFIED_FAIL', escaped_mutations: escaped }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  state: 'VERIFIED_PASS',
  truth_watch_cardinality: 1,
  receipt_semantics: 'EXACT_RUN_SHA_PATH_TERMINAL_STATE',
  failure_propagation: 'FAIL_CLOSED',
  mutations_blocked: mutations.length,
  promotion_eligible: false,
  production: 'HOLD',
  public: 'HOLD'
}, null, 2));
