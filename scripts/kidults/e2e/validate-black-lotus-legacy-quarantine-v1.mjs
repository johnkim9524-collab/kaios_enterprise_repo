#!/usr/bin/env node
import fs from 'node:fs';

const workflowPath = '.github/workflows/kidults-black-lotus-positive-product-qualification-v1.yml';
const disabledScripts = [
  'scripts/kidults/e2e/build-black-lotus-positive-slice-v1.mjs',
  'scripts/kidults/e2e/assess-black-lotus-track-b-v1.mjs',
  'scripts/kidults/e2e/build-black-lotus-projection-v1.mjs',
  'scripts/kidults/e2e/validate-black-lotus-positive-slice-v1.mjs'
];
const seedPath = 'coordination/kidults/e2e/black-lotus-positive-evidence-seed-v1.json';
const requireTruth = (condition, message) => {
  if (!condition) throw new Error(message);
};

const workflow = fs.readFileSync(workflowPath, 'utf8');
requireTruth(!workflow.includes('workflow_dispatch:'), 'LEGACY_MANUAL_EXECUTION_MUST_BE_REMOVED');
requireTruth(workflow.includes('runs-on: ubuntu-24.04'), 'RUNNER_MUST_BE_PINNED');
requireTruth(workflow.includes("node-version: '24'"), 'NODE_24_REQUIRED');
requireTruth(workflow.includes('actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1'), 'CHECKOUT_MUST_BE_IMMUTABLE');
requireTruth(workflow.includes('actions/setup-node@820762786026740c76f36085b0efc47a31fe5020'), 'SETUP_NODE_MUST_BE_IMMUTABLE');
requireTruth(workflow.includes('persist-credentials: false'), 'CHECKOUT_CREDENTIALS_MUST_NOT_PERSIST');
requireTruth(workflow.includes('ref: ${{ env.KIDULTS_EXACT_HEAD_SHA }}'), 'EXACT_HEAD_CHECKOUT_REQUIRED');
requireTruth(!workflow.includes('Build live/open + bounded-reference Product Evidence Package'), 'LEGACY_EVIDENCE_BUILD_MUST_NOT_EXECUTE');
requireTruth(!workflow.includes('Independent Track B assessment'), 'LEGACY_TRACK_B_MUST_NOT_EXECUTE');
requireTruth(!workflow.includes('Build Projection Registry slice'), 'LEGACY_PROJECTION_MUST_NOT_EXECUTE');
requireTruth(!workflow.includes('upload-artifact@'), 'LEGACY_PROMOTABLE_ARTIFACT_MUST_NOT_BE_EMITTED');

for (const file of disabledScripts) {
  const source = fs.readFileSync(file, 'utf8');
  requireTruth(source.includes('LEGACY_POSITIVE_QUALIFICATION_DISABLED'), `${file}:DISABLE_GUARD_MISSING`);
}

const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
requireTruth(seed.record_type === 'bounded_official_reference_evidence_seed', 'SEED_MUST_REMAIN_REFERENCE_ONLY');
requireTruth(seed.production === 'HOLD', 'SEED_PRODUCTION_MUST_REMAIN_HOLD');
requireTruth(seed.source_families.some((source) => source.rights_state.includes('REFERENCE_ONLY')), 'REFERENCE_ONLY_RIGHTS_BOUNDARY_MISSING');
requireTruth(seed.source_families.some((source) => source.acquisition_authorized === false), 'NON_AUTHORIZED_SOURCE_BOUNDARY_MISSING');
requireTruth(seed.prohibitions.includes('NO_DISCOVERY_TO_QUALIFICATION_SHORTCUT'), 'QUALIFICATION_SHORTCUT_PROHIBITION_MISSING');

console.log(JSON.stringify({
  suite: 'KIDULTS_BLACK_LOTUS_LEGACY_QUARANTINE_V1',
  result: 'PASS',
  legacy_scripts_disabled: disabledScripts.length,
  reference_seed_promotable: false,
  verified_collector_market_sold_created: 0,
  candidate_evidence_created: false,
  track_b_started: false,
  projection_created: false,
  external_requests: 0,
  production: 'HOLD',
  public: 'HOLD',
  g5: 'EXPLICIT_APPROVAL_REQUIRED',
  autonomous_effect: 'POSITIVE_EXACT_HEAD_PR_VALIDATION_FAILS_CLOSED_ON_LEGACY_REACTIVATION',
  global_effect: 'NEUTRAL_NO_GLOBAL_EMPIRICAL_COVERAGE_PROMOTED',
  irreplaceable_value_effect: 'POSITIVE_GOVERNED_TRACK_A_TO_TRACK_B_TO_PROJECTION_CHAIN_REMAINS_AUTHORITATIVE',
  transparency_effect: 'POSITIVE_REFERENCE_POINTERS_ARE_EXPLICITLY_SEPARATED_FROM_VERIFIED_SOLD_AND_EVIDENCE'
}, null, 2));
