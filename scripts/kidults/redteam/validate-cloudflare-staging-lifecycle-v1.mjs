#!/usr/bin/env node
import fs from 'node:fs';

const PROJECT = 'kidults-workspace-staging';
const ESTATE_PATH = 'coordination/kidults/redteam/cloudflare-worker-estate-policy-v1.json';
const STAGING_PATH = 'coordination/kidults/runtime/cloudflare-pages-staging-governance-v1.json';
const DOC_PATH = 'docs/kidults/runtime/cloudflare-pages-staging-governance-v1.md';

const readJson = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const readText = (path) => fs.readFileSync(path, 'utf8');

const expectedPreconditions = [
  'PLATFORM_PRODUCTION_CUTOVER_COMPLETED',
  'PRODUCTION_SMOKE_AND_E2E_VERIFIED',
  'STAGING_RUNTIME_ROUTE_DOMAIN_AND_SERVICE_DEPENDENCIES_ZERO',
  'STAGING_REQUIRED_VALIDATION_DEPENDENCIES_ZERO',
  'OBSERVE_24H_PASS',
  'OBSERVE_72H_PASS',
  'FINAL_INVENTORY_AND_DEPENDENCY_PROOF_PASS',
];

const expectedRetirementSequence = [
  'INVENTORY',
  'DEPENDENCY_PROOF',
  'REMOVE_CRON_QUEUE_WRITES',
  'REMOVE_DATA_SECRET_SERVICE_BINDINGS',
  'OBSERVE_24H',
  'MIGRATE_OR_REMOVE_ROUTE',
  'OBSERVE_72H',
  'DELETE_RESOURCE',
  'POST_DELETE_SMOKE_TEST',
];

const expectedPlatformAssets = [
  'KIDULTS Portal',
  'KIDULTS Workspace',
  'KIDULTS Intelligence Runtime (KIR)',
  'Registry and Evidence chain',
  'Track B validation chain',
  'Projection chain',
];

const sameArray = (actual, expected) => Array.isArray(actual)
  && actual.length === expected.length
  && actual.every((value, index) => value === expected[index]);

function validate(estate, staging, docs) {
  const errors = [];
  const req = (condition, id) => { if (!condition) errors.push(id); };
  const lifecycle = estate.temporary_staging_lifecycle?.[PROJECT];
  const retiredNames = (estate.retired_confirmed ?? []).map((item) => item.name);
  const classificationGroups = [
    estate.canonical_keep ?? [],
    estate.temporary_staging_keep ?? [],
    estate.inspect_before_decision ?? [],
    estate.migrate_then_retire ?? [],
    estate.quarantine_retire_candidates ?? [],
    retiredNames,
  ];
  const membershipCount = classificationGroups.reduce(
    (count, group) => count + (Array.isArray(group) && group.includes(PROJECT) ? 1 : 0),
    0,
  );

  req((estate.temporary_staging_keep ?? []).includes(PROJECT), 'STAGING_MUST_REMAIN_TEMPORARY_KEEP');
  req(membershipCount === 1, 'STAGING_LIFECYCLE_CLASSIFICATION_MUST_BE_EXCLUSIVE');
  req(lifecycle?.current_state === 'KEEP_FROZEN', 'CURRENT_STATE_KEEP_FROZEN');
  req(lifecycle?.role === 'CONTROLLED_REMOTE_PORTAL_VALIDATION_SURFACE', 'ROLE_CONTROLLED_REMOTE_VALIDATION');
  req(lifecycle?.is_platform_product_asset === false, 'NOT_PLATFORM_PRODUCT_ASSET');
  req(lifecycle?.is_platform_production_surface === false, 'NOT_PLATFORM_PRODUCTION_SURFACE');
  req(lifecycle?.automatic_deployments === 'DISABLED', 'AUTOMATIC_DEPLOYMENTS_DISABLED');
  req(lifecycle?.preview_deployments_expected === 0, 'PREVIEW_ZERO_EXPECTED');
  req(lifecycle?.mutation_state === 'HOLD_UNLESS_SEPARATELY_AUTHORIZED', 'STAGING_MUTATION_SEPARATE_GATE');
  req(lifecycle?.retirement_target === 'AFTER_PLATFORM_PRODUCTION_STABILIZATION', 'RETIRE_ONLY_AFTER_PRODUCTION_STABILIZATION');
  req(sameArray(lifecycle?.retirement_preconditions, expectedPreconditions), 'RETIREMENT_PRECONDITIONS_EXACT');
  req(lifecycle?.retirement_sequence_ref === 'retirement_sequence', 'RETIREMENT_SEQUENCE_REFERENCE');
  req(lifecycle?.delete_before_preconditions === 'PROHIBITED', 'EARLY_DELETE_PROHIBITED');
  req(lifecycle?.post_delete_requirement === 'POST_DELETE_SMOKE_TEST', 'POST_DELETE_SMOKE_REQUIRED');
  req(lifecycle?.production_public_g5_effect === 'NONE', 'RETIREMENT_HAS_NO_RELEASE_AUTHORITY');
  req(sameArray(estate.retirement_sequence, expectedRetirementSequence), 'RETIREMENT_SEQUENCE_EXACT');
  req(sameArray(estate.platform_assets_preserved_independently_of_staging, expectedPlatformAssets), 'PLATFORM_ASSETS_PRESERVED_EXACT');
  req(!retiredNames.includes(PROJECT), 'STAGING_MUST_NOT_BE_RETIRED_NOW');
  req(!(estate.forbidden_new_deploy_targets ?? []).includes(PROJECT), 'KEEP_FROZEN_MUST_NOT_BE_FORBIDDEN_TARGET');
  req(estate.production_public_g5 === 'NO_CHANGE_WITHOUT_EXISTING_APPROVAL_GATE', 'PRODUCTION_PUBLIC_G5_GATE_UNCHANGED');
  req(estate.d1_deletion === 'NOT_AUTHORIZED_BY_THIS_POLICY', 'D1_DELETION_NOT_AUTHORIZED');

  req(staging.project?.name === PROJECT, 'STAGING_PROJECT_BINDING');
  req(staging.project?.platform_role === 'CONTROLLED_STATIC_STAGING_MIRROR', 'STAGING_ROLE_BINDING');
  req(staging.automatic_deployment_boundary?.production_deployments_enabled === false, 'STAGING_AUTO_PRODUCTION_OFF');
  req(staging.automatic_deployment_boundary?.preview_deployment_setting === 'none', 'STAGING_PREVIEW_NONE');
  req(staging.verified_provider_state?.materialized_preview_remaining === 0, 'STAGING_PROVIDER_PREVIEW_ZERO');
  req(staging.deployment_policy?.trigger === 'DISABLED', 'STAGING_DEPLOY_TRIGGER_DISABLED');
  req(staging.deployment_policy?.provider_secret_resolution_reachable === false, 'STAGING_DEPLOY_SECRET_UNREACHABLE');
  req(staging.deployment_policy?.provider_call_reachable === false, 'STAGING_DEPLOY_PROVIDER_UNREACHABLE');
  req(staging.emergency_control?.provider_secret_resolution_reachable === false, 'STAGING_EMERGENCY_SECRET_UNREACHABLE');
  req(staging.emergency_control?.provider_call_reachable === false, 'STAGING_EMERGENCY_PROVIDER_UNREACHABLE');
  req(staging.truth_boundary?.public_release === 'HOLD', 'PUBLIC_HOLD');
  req(staging.truth_boundary?.production === 'HOLD', 'PRODUCTION_HOLD');
  req(staging.truth_boundary?.g5 === 'HOLD', 'G5_HOLD');
  req(staging.truth_boundary?.future_cloudflare_mutation_authorized === false, 'FUTURE_MUTATION_NOT_AUTHORIZED');

  req(docs.includes('KEEP / FROZEN → Production stabilization → RETIRE'), 'DOC_LIFECYCLE_DECLARATION');
  req(docs.includes('Current lifecycle state: `KEEP_FROZEN`'), 'DOC_CURRENT_STATE');
  req(docs.includes('must **not** be deleted'), 'DOC_EARLY_DELETE_PROHIBITION');
  for (const asset of expectedPlatformAssets) req(docs.includes(asset), `DOC_PRESERVES:${asset}`);
  for (const token of ['24-hour post-cutover observation is PASS', '72-hour stability observation is PASS', 'Final Cloudflare inventory and dependency proof are PASS']) {
    req(docs.includes(token), `DOC_RETIREMENT_GATE:${token}`);
  }

  return errors;
}

const estate = readJson(ESTATE_PATH);
const staging = readJson(STAGING_PATH);
const docs = readText(DOC_PATH);
const findings = validate(estate, staging, docs);

const negativeCases = [
  ['EARLY_RETIRE_STATE', (e, s, d) => { e.temporary_staging_lifecycle[PROJECT].current_state = 'RETIRE_READY'; return [e, s, d]; }],
  ['DROP_PRECONDITION', (e, s, d) => { e.temporary_staging_lifecycle[PROJECT].retirement_preconditions.pop(); return [e, s, d]; }],
  ['ALLOW_EARLY_DELETE', (e, s, d) => { e.temporary_staging_lifecycle[PROJECT].delete_before_preconditions = 'ALLOWED'; return [e, s, d]; }],
  ['RETIRE_WHILE_KEEP', (e, s, d) => { e.retired_confirmed.push({name: PROJECT, status: 'RETIRED_FAKE', proof: 'negative-test-only'}); return [e, s, d]; }],
  ['DROP_KIR_PRESERVATION', (e, s, d) => { e.platform_assets_preserved_independently_of_staging = e.platform_assets_preserved_independently_of_staging.filter((x) => x !== 'KIDULTS Intelligence Runtime (KIR)'); return [e, s, d]; }],
  ['PRODUCTION_GO', (e, s, d) => { s.truth_boundary.production = 'GO'; return [e, s, d]; }],
  ['MUTATION_REACHABLE', (e, s, d) => { s.deployment_policy.provider_call_reachable = true; return [e, s, d]; }],
];

const negativeFailures = [];
for (const [id, mutate] of negativeCases) {
  const e = structuredClone(estate);
  const s = structuredClone(staging);
  const [mutatedEstate, mutatedStaging, mutatedDocs] = mutate(e, s, docs);
  if (validate(mutatedEstate, mutatedStaging, mutatedDocs).length === 0) negativeFailures.push(`NEGATIVE_FALSE_GREEN:${id}`);
}
findings.push(...negativeFailures);

const receipt = {
  id: 'kidults-cloudflare-staging-lifecycle-guard-v1',
  state: findings.length ? 'VERIFIED_FAIL' : 'VERIFIED_PASS',
  project: PROJECT,
  lifecycle: 'KEEP_FROZEN',
  retirement_eligible_now: false,
  retirement_preconditions_enforced: expectedPreconditions.length,
  platform_assets_preserved: expectedPlatformAssets.length,
  negative_cases: negativeCases.length,
  future_cloudflare_mutation_authorized: false,
  public_release: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
  findings,
};

console.log(JSON.stringify(receipt, null, 2));
if (findings.length) process.exit(1);
