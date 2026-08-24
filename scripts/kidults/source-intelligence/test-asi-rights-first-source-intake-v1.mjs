#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { classifyPurposeRights, RIGHTS_CLEAR, RIGHTS_HOLD } from './lib/source-purpose-rights-gate-v1.mjs';

const fail = message => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };
const root = process.cwd();
const fixedNow = '2026-08-24T05:30:00Z';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-rights-first-intake-'));
const builder = 'scripts/kidults/source-intelligence/build-asi-proactive-source-pool-v1.mjs';
const validator = 'scripts/kidults/source-intelligence/validate-asi-proactive-source-pool-v1.mjs';
const top16Path = 'coordination/kidults/source-intelligence/top16-empirical-activation-preflight-v1.json';
const openPath = 'coordination/kidults/source-intelligence/rights-first-current-sold-source-preflight-v1.json';
const runtimeContractPath = 'coordination/kidults/source-intelligence/asi-p1-market-event-adapter-runtime-contract-v1.json';
const write = (name, value) => {
  const file = path.join(tmp, name);
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
  return file;
};
const run = (args, expectPass = true) => {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    env: { ...process.env, ASI_AS_OF: fixedNow },
    encoding: 'utf8'
  });
  if (expectPass && result.status !== 0) {
    throw new Error(`COMMAND_FAILED:${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  }
  if (!expectPass && result.status === 0) {
    throw new Error(`NEGATIVE_CASE_ACCEPTED:${args.join(' ')}`);
  }
  return result;
};

const top16 = JSON.parse(fs.readFileSync(top16Path, 'utf8'));
const open = JSON.parse(fs.readFileSync(openPath, 'utf8'));
const runtimeContract = JSON.parse(fs.readFileSync(runtimeContractPath, 'utf8'));
assert(top16.preflighted_sources === 16 && top16.rows.length === 16, 'TOP16_PREFLIGHT_COVERAGE');
assert(top16.portfolio?.rights_clear_current_sold_sources === 0, 'TOP16_RIGHTS_CLEAR_OVERCLAIM');
assert(top16.portfolio?.adapter_development_backlog_eligible === 0, 'TOP16_BACKLOG_OVERCLAIM');
assert(top16.rows.every(row => row.adapter_development_backlog_eligible === false && row.acquisition_authorized === false), 'TOP16_ROW_BOUNDARY');
assert(top16.rows.every(row => Array.isArray(row.purpose_bindings) && row.purpose_bindings.length === 0), 'TOP16_EXACT_BINDING_OVERCLAIM');
assert(open.summary?.rights_clear_current_sold_reference_sources === 1, 'OPEN_REFERENCE_COUNT');
assert(open.summary?.rights_clear_collector_current_sold_sources === 0, 'OPEN_COLLECTOR_OVERCLAIM');
assert(open.summary?.adapter_development_backlog === 0, 'OPEN_BACKLOG_OVERCLAIM');

const ceilingIds = [
  'pricecharting-api',
  'bricklink-catalog-api',
  'comc-marketplace',
  'goat-sneaker-marketplace',
  'hasbro-pulse-collections',
  'nike-snkrs-launch-calendar'
];
for (const sourceId of ceilingIds) {
  const ceiling = runtimeContract.purpose_claim_ceiling_overrides?.[sourceId];
  assert(ceiling?.suppressed_target_claims?.length > 0, `CLAIM_CEILING_MISSING:${sourceId}`);
  assert(ceiling?.context_only_claims?.length > 0, `CONTEXT_CLAIM_MISSING:${sourceId}`);
}
assert(runtimeContract.claim_ceiling_policy?.claim_ceiling_override_precedes_mission_impact_ranking === true, 'CLAIM_CEILING_ORDER');

const discoveryPath = write('discovery.json', {
  id: 'rights-first-discovery-fixture',
  candidate_count: 2,
  candidates: [
    {
      endpoint_url: 'https://fixture.invalid/catalog',
      source_name: 'Catalog Fixture',
      observed_at: fixedNow,
      discovery_provider: 'SYNTHETIC_FIXTURE',
      candidate_source_roles: ['CATALOG_REFERENCE'],
      candidate_purpose_intents: ['IDENTITY_CATALOG'],
      provider_record_id: 'catalog-fixture',
      demand_instance_ids: ['demand-high-1', 'demand-high-2', 'demand-high-3']
    },
    {
      endpoint_url: 'https://fixture.invalid/unknown',
      source_name: 'Unknown Fixture',
      observed_at: fixedNow,
      discovery_provider: 'SYNTHETIC_FIXTURE',
      candidate_source_roles: [],
      candidate_purpose_intents: [],
      provider_record_id: 'unknown-fixture',
      demand_instance_ids: []
    }
  ]
});
const actualOne = path.join(tmp, 'actual-one.json');
const actualTwo = path.join(tmp, 'actual-two.json');
run([builder, discoveryPath, '', actualOne, top16Path, openPath]);
run([validator, actualOne]);
run([builder, discoveryPath, '', actualTwo, top16Path, openPath]);
run([validator, actualTwo]);
assert(fs.readFileSync(actualOne, 'utf8') === fs.readFileSync(actualTwo, 'utf8'), 'NON_DETERMINISTIC_RIGHTS_FIRST_BUILD');

const actual = JSON.parse(fs.readFileSync(actualOne, 'utf8'));
assert(actual.operating_mode === 'RIGHTS_FIRST_SOURCE_X_PURPOSE', 'RIGHTS_FIRST_MODE');
assert(actual.ranking_policy === 'RIGHTS_AND_COMMERCIAL_FRICTION_THEN_PURPOSE_FIT_THEN_DEMAND', 'RIGHTS_FIRST_RANKING');
assert(actual.rights_clear_current_sold_reference_count === 1, 'ACTUAL_REFERENCE_COUNT');
assert(actual.rights_clear_current_sold_source_count === 0, 'ACTUAL_CURRENT_SOLD_OVERCLAIM');
assert(actual.adapter_development_backlog_count === 0, 'ACTUAL_BACKLOG_OVERCLAIM');
assert(actual.context_only_excluded_from_current_sold_count >= 6, 'CONTEXT_EXCLUSION_COVERAGE');
assert(actual.permission_required_queue_count > 0, 'PERMISSION_QUEUE_EMPTY');
assert(actual.no_go_queue_count > 0, 'NO_GO_QUEUE_EMPTY');
assert(actual.domain_fit_hold_queue.some(pkg => pkg.source_id === 'seattle-sold-fleet-equipment-open-data'), 'SEATTLE_DOMAIN_HOLD_MISSING');
assert(actual.rights_clear_source_pool.every(pkg => pkg.acquisition_authorized === false), 'RIGHTS_CLEAR_AUTO_ACQUISITION');

const digest = `sha256:${'a'.repeat(64)}`;
const binding = (purpose = 'CURRENT_SOLD_TRANSACTION') => ({
  binding_id: `synthetic-binding-${purpose.toLowerCase()}`,
  purpose,
  source_roles: ['SOLD_TRANSACTION'],
  evidence_classes: [purpose],
  fields: ['transaction_id', 'sold_status', 'final_price', 'currency', 'sale_date'],
  outputs: ['INTERNAL_CURRENT_SOLD_EVIDENCE'],
  scope_verified: true,
  time_scope_verified: true,
  freshness_verified: true,
  license_scope_verified: true,
  observed_at: '2026-08-24T00:00:00Z',
  review_due_at: '2099-01-01T00:00:00Z',
  evidence_refs: ['https://fixture.invalid/rights'],
  evidence_digest: digest
});
const exactRow = (sourceId, domainFit) => ({
  source_id: sourceId,
  source_name: sourceId,
  official_locator: `https://fixture.invalid/${sourceId}`,
  source_roles: ['SOLD_TRANSACTION'],
  rights_state: 'PASS',
  access_state: 'OPEN_API',
  field_purpose_rights_verified: true,
  commercial_reuse_authorized: true,
  purpose_rights: { collect: 'PASS', store: 'PASS', derive: 'PASS' },
  purpose_bindings: [binding()],
  evidence_refs: ['https://fixture.invalid/rights'],
  evidence_digest: digest,
  observed_at: '2026-08-24T00:00:00Z',
  review_due_at: '2099-01-01T00:00:00Z',
  domain_fit_state: domainFit
});
const syntheticPreflight = write('synthetic-preflight.json', {
  id: 'synthetic-positive-preflight',
  rows: [
    exactRow('collector-current-sold-fixture', 'COLLECTOR_MARKET_SCOPE_VERIFIED'),
    exactRow('noncollector-current-sold-fixture', 'NON_COLLECTOR_DOMAIN_HOLD')
  ]
});
const emptyPreflight = write('empty-preflight.json', { id: 'empty-preflight', rows: [] });
const syntheticDiscovery = write('synthetic-discovery.json', { id: 'synthetic-discovery', candidate_count: 0, candidates: [] });
const positiveOut = path.join(tmp, 'positive.json');
run([builder, syntheticDiscovery, '', positiveOut, syntheticPreflight, emptyPreflight]);
run([validator, positiveOut]);
const positive = JSON.parse(fs.readFileSync(positiveOut, 'utf8'));
assert(positive.rights_clear_current_sold_source_count === 2, 'SYNTHETIC_CLEAR_COUNT');
assert(positive.adapter_development_backlog_count === 1, 'COLLECTOR_DOMAIN_BACKLOG_GATE');
assert(positive.adapter_development_backlog[0].source_id === 'collector-current-sold-fixture', 'NONCOLLECTOR_BACKLOG_LEAK');

const clear = classifyPurposeRights(exactRow('direct-clear', 'COLLECTOR_MARKET_SCOPE_VERIFIED'), 'CURRENT_SOLD_TRANSACTION', new Date(fixedNow));
assert(clear.decision === RIGHTS_CLEAR, 'EXACT_PURPOSE_CLEAR_REJECTED');
const cases = [
  ['GENERIC_PASS_NO_BINDING', { ...exactRow('missing-binding', 'COLLECTOR_MARKET_SCOPE_VERIFIED'), purpose_bindings: [] }, 'CURRENT_SOLD_TRANSACTION'],
  ['LISTING_ROLE_FORGED_AS_SOLD', {
    ...exactRow('listing-forgery', 'COLLECTOR_MARKET_SCOPE_VERIFIED'),
    source_roles: ['LISTING_SUPPLY'],
    purpose_bindings: [{ ...binding(), source_roles: ['LISTING_SUPPLY'] }]
  }, 'CURRENT_SOLD_TRANSACTION'],
  ['PAID_WITHOUT_APPROVAL', { ...exactRow('paid-no-approval', 'COLLECTOR_MARKET_SCOPE_VERIFIED'), paid_plan_required: true }, 'CURRENT_SOLD_TRANSACTION'],
  ['CREDENTIAL_WITHOUT_APPROVAL', { ...exactRow('credential-no-approval', 'COLLECTOR_MARKET_SCOPE_VERIFIED'), credential_required: true }, 'CURRENT_SOLD_TRANSACTION'],
  ['STALE_RIGHTS', {
    ...exactRow('stale', 'COLLECTOR_MARKET_SCOPE_VERIFIED'),
    review_due_at: '2026-08-23T00:00:00Z',
    purpose_bindings: [{ ...binding(), review_due_at: '2026-08-23T00:00:00Z' }]
  }, 'CURRENT_SOLD_TRANSACTION'],
  ['TERMS_CHANGED', { ...exactRow('terms-changed', 'COLLECTOR_MARKET_SCOPE_VERIFIED'), terms_changed: true }, 'CURRENT_SOLD_TRANSACTION'],
  ['FAKE_EVIDENCE', {
    ...exactRow('fake-evidence', 'COLLECTOR_MARKET_SCOPE_VERIFIED'),
    evidence_digest: 'fake',
    evidence_refs: ['x'],
    purpose_bindings: [{ ...binding(), evidence_digest: 'fake', evidence_refs: ['x'] }]
  }, 'CURRENT_SOLD_TRANSACTION'],
  ['UNSUPPORTED_PURPOSE', exactRow('unsupported', 'COLLECTOR_MARKET_SCOPE_VERIFIED'), 'ACTIVE_LISTING_CONTEXT']
];
for (const [name, row, purpose] of cases) {
  const result = classifyPurposeRights(row, purpose, new Date(fixedNow));
  assert(result.decision === RIGHTS_HOLD, `MUTATION_ACCEPTED:${name}`);
}

const badBacklog = structuredClone(actual);
const holdPackage = badBacklog.source_purpose_packages.find(pkg => pkg.rights_decision === RIGHTS_HOLD);
badBacklog.adapter_development_backlog.push({ ...holdPackage, adapter_development_authorized: true });
badBacklog.adapter_development_backlog_count = badBacklog.adapter_development_backlog.length;
const badBacklogPath = write('bad-backlog.json', badBacklog);
run([validator, badBacklogPath], false);

const badContext = structuredClone(actual);
const contextPackage = badContext.source_purpose_packages.find(pkg => ['IDENTITY_CATALOG', 'ACTIVE_LISTING_CONTEXT'].includes(pkg.purpose));
contextPackage.rights_decision = RIGHTS_CLEAR;
contextPackage.gate_eligible_for_acquisition_or_adapter_backlog = true;
badContext.rights_clear_purpose_package_count += 1;
badContext.rights_hold_purpose_package_count -= 1;
badContext.rights_clear_source_pool.push(contextPackage);
const badContextPath = write('bad-context.json', badContext);
run([validator, badContextPath], false);

const receipt = {
  id: 'kidults-asi-rights-first-source-intake-test-v1',
  version: '1.0.0',
  state: 'VERIFIED_PASS',
  as_of: fixedNow,
  facts: {
    top16_preflighted: 16,
    top16_rights_clear_current_sold: 0,
    rights_clear_current_sold_references: actual.rights_clear_current_sold_reference_count,
    context_only_excluded_from_current_sold: actual.context_only_excluded_from_current_sold_count,
    adapter_development_backlog: actual.adapter_development_backlog_count,
    synthetic_exact_current_sold_clear: positive.rights_clear_current_sold_source_count,
    synthetic_collector_domain_backlog: positive.adapter_development_backlog_count,
    mutation_cases_rejected: cases.length + 2
  },
  authority_boundary: {
    provider_contacted: false,
    account_created: false,
    eula_accepted: false,
    spend_authorized: false,
    live_records_acquired: false,
    public_release: 'HOLD',
    production: 'HOLD',
    g5: 'HOLD'
  }
};
const receiptPath = process.env.RIGHTS_FIRST_RECEIPT_OUT || path.join(tmp, 'rights-first-receipt.json');
fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify(receipt, null, 2));
