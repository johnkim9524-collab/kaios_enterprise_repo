#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { classifyPurposeRights, RIGHTS_CLEAR } from './lib/source-purpose-rights-gate-v1.mjs';

const discoveryPath = process.argv[2] || 'discovery-out/bounded-live-discovery.json';
const previousPath = process.argv[3] || '';
const outPath = process.argv[4] || '/tmp/asi-proactive-source-pool-v1.json';
const top16PreflightPath = process.argv[5] || 'coordination/kidults/source-intelligence/top16-empirical-activation-preflight-v1.json';
const openPreflightPath = process.argv[6] || 'coordination/kidults/source-intelligence/rights-first-current-sold-source-preflight-v1.json';
const contract = JSON.parse(fs.readFileSync('coordination/kidults/source-intelligence/asi-proactive-source-pool-accumulator-v1.json', 'utf8'));
const discovery = JSON.parse(fs.readFileSync(discoveryPath, 'utf8'));
let previous = null;
if (previousPath && fs.existsSync(previousPath)) previous = JSON.parse(fs.readFileSync(previousPath, 'utf8'));

const readLedger = (file, ledgerId) => {
  if (!file || !fs.existsSync(file)) return [];
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(value.rows)) throw new Error(`PREFLIGHT_ROWS_INVALID:${file}`);
  return value.rows.map(row => ({ ...row, _ledger_id: value.id || ledgerId }));
};
const governedRows = [
  ...readLedger(top16PreflightPath, 'top16-preflight'),
  ...readLedger(openPreflightPath, 'open-current-sold-preflight')
];
const governedSourceIds = new Set();
for (const row of governedRows) {
  if (!row.source_id || governedSourceIds.has(row.source_id)) throw new Error(`DUPLICATE_SOURCE_ID_IN_GOVERNED_LEDGERS:${row.source_id || ''}`);
  governedSourceIds.add(row.source_id);
}

const sha = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const normalizeUrl = value => {
  try {
    const url = new URL(value);
    url.hash = '';
    url.searchParams.sort();
    return url.toString().replace(/\/$/, '');
  } catch {
    return String(value || '').trim();
  }
};
const array = value => Array.isArray(value) ? value : [];
const unique = values => [...new Set(values.filter(value => value !== undefined && value !== null && value !== ''))].sort();
const earlier = (a, b) => !a ? b : !b ? a : (new Date(a) <= new Date(b) ? a : b);
const later = (a, b) => !a ? b : !b ? a : (new Date(a) >= new Date(b) ? a : b);
const now = process.env.ASI_AS_OF || new Date().toISOString();
const asOf = new Date(now);
if (Number.isNaN(asOf.getTime())) throw new Error('ASI_AS_OF_INVALID');

const ROLE_PURPOSES = {
  SOLD_TRANSACTION: ['CURRENT_SOLD_TRANSACTION'],
  LISTING_SUPPLY: ['ACTIVE_LISTING_CONTEXT'],
  PRIMARY_AUTHORITY: ['IDENTITY_CATALOG'],
  CATALOG_REFERENCE: ['IDENTITY_CATALOG'],
  AUTHENTICATION_CONDITION: ['AUTHENTICATION_CONDITION'],
  PROVENANCE_HISTORY: ['PROVENANCE_HISTORY'],
  CULTURE_ATTENTION: ['CULTURE_ATTENTION']
};
const purposeForRoles = (roles, intents = []) => unique([
  ...array(intents),
  ...array(roles).flatMap(role => ROLE_PURPOSES[role] || [])
]);
const rowLocators = row => unique([
  row.official_locator,
  row.official_data_endpoint,
  row.endpoint_url,
  ...array(row.evidence_refs)
].filter(value => /^https?:\/\//i.test(String(value || ''))).map(normalizeUrl));

const safeState = candidate => ({
  ...candidate,
  discovery_providers: array(candidate.discovery_providers),
  source_family_hints: array(candidate.source_family_hints),
  candidate_source_roles: array(candidate.candidate_source_roles),
  candidate_purpose_intents: array(candidate.candidate_purpose_intents),
  representative_product_ids: array(candidate.representative_product_ids),
  demand_instance_ids: array(candidate.demand_instance_ids),
  target_regions: array(candidate.target_regions),
  target_languages: array(candidate.target_languages),
  provider_record_ids: array(candidate.provider_record_ids),
  governed_source_ids: array(candidate.governed_source_ids),
  provider_switchable_identity: true,
  rights_state: 'UNASSESSED',
  admission_state: 'NOT_ADMITTED',
  source_pool_state: 'CANDIDATE_ONLY',
  evidence_state: 'DISCOVERY_METADATA_ONLY',
  candidate_state: 'SOURCE_X_PURPOSE_RIGHTS_PREFLIGHT_REQUIRED',
  acquisition_authorized: false,
  target_site_traversal_authorized: false,
  market_claim_authorized: false,
  public_projection: false,
  production: 'HOLD',
  next_action: 'PURPOSE_SPECIFIC_RIGHTS_COMMERCIAL_SCHEMA_AND_DOMAIN_PREFLIGHT'
});
const mergeRestored = (left, right) => safeState({
  ...left,
  canonical_locator: left.canonical_locator,
  source_name: left.source_name || right.source_name || left.canonical_locator,
  first_seen_at: earlier(left.first_seen_at, right.first_seen_at),
  last_seen_at: later(left.last_seen_at, right.last_seen_at),
  observation_count: Number(left.observation_count || 0) + Number(right.observation_count || 0),
  discovery_providers: unique([...array(left.discovery_providers), ...array(right.discovery_providers)]),
  source_family_hints: unique([...array(left.source_family_hints), ...array(right.source_family_hints)]),
  candidate_source_roles: unique([...array(left.candidate_source_roles), ...array(right.candidate_source_roles)]),
  candidate_purpose_intents: unique([...array(left.candidate_purpose_intents), ...array(right.candidate_purpose_intents)]),
  representative_product_ids: unique([...array(left.representative_product_ids), ...array(right.representative_product_ids)]),
  demand_instance_ids: unique([...array(left.demand_instance_ids), ...array(right.demand_instance_ids)]),
  target_regions: unique([...array(left.target_regions), ...array(right.target_regions)]),
  target_languages: unique([...array(left.target_languages), ...array(right.target_languages)]),
  provider_record_ids: unique([...array(left.provider_record_ids), ...array(right.provider_record_ids)]),
  governed_source_ids: unique([...array(left.governed_source_ids), ...array(right.governed_source_ids)])
});

const byKey = new Map();
const keyByLocator = new Map();
let migratedDuplicateLocatorCount = 0;
for (const candidate of array(previous?.candidates)) {
  const locator = normalizeUrl(candidate.canonical_locator);
  if (!locator) continue;
  const restored = safeState({ ...candidate, canonical_locator: locator });
  const existingKey = keyByLocator.get(locator);
  if (existingKey) {
    byKey.set(existingKey, mergeRestored(byKey.get(existingKey), restored));
    migratedDuplicateLocatorCount++;
  } else {
    const key = candidate.source_candidate_key || `src-cand:${sha(locator).slice(0, 24)}`;
    byKey.set(key, { ...restored, source_candidate_key: key });
    keyByLocator.set(locator, key);
  }
}

let newCount = 0;
let reobserved = 0;
const currentBatchKeys = new Set();
for (const candidate of array(discovery.candidates)) {
  const locator = normalizeUrl(candidate.endpoint_url || candidate.source_locator || candidate.provider_record_id);
  if (!locator) continue;
  const existingKey = keyByLocator.get(locator);
  const canonicalKey = `src-cand:${sha(candidate.underlying_work_key || locator).slice(0, 24)}`;
  const key = existingKey || canonicalKey;
  const prior = byKey.get(key);
  const next = safeState({
    ...prior,
    source_candidate_key: key,
    canonical_locator: locator,
    source_name: candidate.source_name || candidate.owner || prior?.source_name || locator,
    first_seen_at: prior?.first_seen_at || candidate.observed_at || now,
    last_seen_at: candidate.observed_at || now,
    observation_count: Number(prior?.observation_count || 0) + 1,
    discovery_providers: unique([...(prior?.discovery_providers || []), ...array(candidate.discovery_providers), candidate.discovery_provider]),
    source_family_hints: unique([...(prior?.source_family_hints || []), ...array(candidate.source_family_hints), candidate.source_family_hint]),
    candidate_source_roles: unique([...(prior?.candidate_source_roles || []), ...array(candidate.candidate_source_roles)]),
    candidate_purpose_intents: unique([...(prior?.candidate_purpose_intents || []), ...array(candidate.candidate_purpose_intents)]),
    representative_product_ids: unique([...(prior?.representative_product_ids || []), candidate.representative_product_id]),
    demand_instance_ids: unique([...(prior?.demand_instance_ids || []), ...array(candidate.demand_instance_ids)]),
    target_regions: unique([...(prior?.target_regions || []), ...array(candidate.target_regions)]),
    target_languages: unique([...(prior?.target_languages || []), ...array(candidate.target_languages)]),
    provider_record_ids: unique([...(prior?.provider_record_ids || []), ...array(candidate.provider_record_ids), candidate.provider_record_id]),
    governed_source_ids: unique([...(prior?.governed_source_ids || []), ...array(candidate.governed_source_ids)])
  });
  byKey.set(key, next);
  keyByLocator.set(locator, key);
  currentBatchKeys.add(key);
  if (prior) reobserved++; else newCount++;
}

for (const row of governedRows) {
  const locators = rowLocators(row);
  const locator = locators[0];
  if (!locator) continue;
  const existingKey = locators.map(value => keyByLocator.get(value)).find(Boolean);
  const key = existingKey || `src-cand:${sha(locator).slice(0, 24)}`;
  const prior = byKey.get(key);
  const bindingPurposes = array(row.purpose_bindings).map(binding => binding.purpose);
  const next = safeState({
    ...prior,
    source_candidate_key: key,
    canonical_locator: prior?.canonical_locator || locator,
    source_name: prior?.source_name || row.source_name || row.source_id,
    first_seen_at: prior?.first_seen_at || row.observed_at || now,
    last_seen_at: later(prior?.last_seen_at, row.observed_at || now),
    observation_count: Math.max(1, Number(prior?.observation_count || 0)),
    discovery_providers: unique([...(prior?.discovery_providers || []), 'GOVERNED_RIGHTS_PREFLIGHT_LEDGER']),
    source_family_hints: unique([...(prior?.source_family_hints || []), 'RIGHTS_FIRST_PREFLIGHTED_SOURCE']),
    candidate_source_roles: unique([...(prior?.candidate_source_roles || []), ...array(row.source_roles)]),
    candidate_purpose_intents: unique([...(prior?.candidate_purpose_intents || []), ...bindingPurposes, ...array(row.candidate_purpose_intents)]),
    representative_product_ids: array(prior?.representative_product_ids),
    demand_instance_ids: array(prior?.demand_instance_ids),
    target_regions: array(prior?.target_regions),
    target_languages: array(prior?.target_languages),
    provider_record_ids: unique([...(prior?.provider_record_ids || []), row.source_id]),
    governed_source_ids: unique([...(prior?.governed_source_ids || []), row.source_id])
  });
  byKey.set(key, next);
  keyByLocator.set(next.canonical_locator, key);
}

const rowsById = new Map(governedRows.map(row => [row.source_id, row]));
const matchingRows = candidate => unique([
  ...candidate.governed_source_ids,
  ...candidate.provider_record_ids
])
  .map(id => rowsById.get(id))
  .filter(Boolean);

const candidates = [...byKey.values()].map(candidate => {
  const rows = matchingRows(candidate);
  const wrongPurpose = rows.some(row => /WRONG_PURPOSE|CONTEXT_ONLY|NOT_CANDIDATE|UNPROVEN_ACCOUNT_GATED/.test(String(row.current_sold_purpose_candidate_state || row.semantic_state || '')));
  let purposes = purposeForRoles(candidate.candidate_source_roles, candidate.candidate_purpose_intents);
  if (wrongPurpose) purposes = purposes.filter(purpose => !purpose.startsWith('CURRENT_SOLD_TRANSACTION'));
  for (const row of rows) {
    for (const binding of array(row.purpose_bindings)) purposes.push(binding.purpose);
    purposes.push(...array(row.candidate_purpose_intents));
  }
  purposes = unique(purposes);
  if (!purposes.length) purposes = ['SOURCE_ROLE_CLASSIFICATION'];
  return safeState({
    ...candidate,
    candidate_purpose_intents: purposes,
    governed_source_ids: rows.map(row => row.source_id),
    rights_friction_hint: rows.length ? 'GOVERNED_PREFLIGHT_AVAILABLE' : 'UNASSESSED'
  });
}).sort((a, b) =>
  b.demand_instance_ids.length - a.demand_instance_ids.length ||
  b.candidate_source_roles.length - a.candidate_source_roles.length ||
  a.source_candidate_key.localeCompare(b.source_candidate_key)
);

const supportedGatePurpose = purpose => [
  'CURRENT_SOLD_TRANSACTION_REFERENCE',
  'CURRENT_SOLD_TRANSACTION',
  'CURRENT_SOLD_TRANSACTION_AND_LIQUIDITY_ACQUISITION'
].includes(purpose);
const friction = (row, decision) => {
  if (decision === RIGHTS_CLEAR) return { tier: 'RIGHTS_CLEAR_NO_EXTERNAL_COMMITMENT', rank: 0 };
  const combined = JSON.stringify(row || {}).toUpperCase();
  if (/DENY|PROHIBIT|NO_GO/.test(combined)) return { tier: 'DENY_OR_PROHIBITED', rank: 4 };
  if (/WRITTEN_PERMISSION|ACCOUNT|LOGIN|CREDENTIAL|PAID|SPEND|EULA|CONTRACT|WAF/.test(combined)) return { tier: 'EXTERNAL_COMMITMENT_OR_ACCESS_REQUIRED', rank: 3 };
  if (row) return { tier: 'OFFICIAL_PREFLIGHT_HOLD', rank: 1 };
  return { tier: 'UNASSESSED', rank: 2 };
};
const purposeRank = purpose => purpose === 'CURRENT_SOLD_TRANSACTION' ? 0 :
  purpose === 'CURRENT_SOLD_TRANSACTION_REFERENCE' ? 1 :
  purpose === 'CURRENT_SOLD_TRANSACTION_AND_LIQUIDITY_ACQUISITION' ? 2 : 3;

const sourcePurposePackages = [];
for (const candidate of candidates) {
  const rows = matchingRows(candidate);
  for (const purpose of candidate.candidate_purpose_intents) {
    const row = rows.find(value => array(value.purpose_bindings).some(binding => binding.purpose === purpose)) || rows[0] || null;
    const decision = supportedGatePurpose(purpose) && row
      ? classifyPurposeRights(row, purpose, asOf)
      : {
          purpose,
          decision: 'RIGHTS_HOLD',
          eligible_for_acquisition_or_adapter_backlog: false,
          reason_codes: [row ? 'PURPOSE_NOT_BOUND_BY_EXACT_PREFLIGHT' : 'SOURCE_PURPOSE_PREFLIGHT_MISSING'],
          evidence_refs: array(row?.evidence_refs),
          evidence_digest: row?.evidence_digest || null,
          purpose_binding_id: null,
          source_roles: array(row?.source_roles),
          evidence_classes: [],
          observed_at: row?.observed_at || null,
          review_due_at: row?.review_due_at || null,
          external_approval_required: false,
          external_approval_bound: false
        };
    const exactBinding = Boolean(row && array(row.purpose_bindings).some(binding => binding.purpose === purpose));
    const domainFitState = row?.domain_fit_state || 'UNASSESSED';
    const roleFitState = exactBinding ? 'CONFIRMED' : candidate.candidate_source_roles.length ? 'CANDIDATE_UNVERIFIED' : 'UNCLASSIFIED';
    const f = friction(row, decision.decision);
    sourcePurposePackages.push({
      package_id: `source-purpose:${candidate.source_candidate_key}:${purpose}`,
      source_candidate_key: candidate.source_candidate_key,
      source_id: row?.source_id || null,
      canonical_locator: candidate.canonical_locator,
      source_name: candidate.source_name,
      purpose,
      purpose_rank: purposeRank(purpose),
      source_roles: unique([...candidate.candidate_source_roles, ...array(decision.source_roles)]),
      evidence_classes: array(decision.evidence_classes),
      purpose_role_fit_state: roleFitState,
      domain_fit_state: domainFitState,
      rights_decision: decision.decision,
      rights_reason_codes: array(decision.reason_codes),
      rights_evidence_refs: array(decision.evidence_refs),
      rights_evidence_digest: decision.evidence_digest || null,
      purpose_binding_id: decision.purpose_binding_id || null,
      rights_observed_at: decision.observed_at || null,
      rights_review_due_at: decision.review_due_at || null,
      external_approval_required: decision.external_approval_required === true,
      external_approval_bound: decision.external_approval_bound === true,
      rights_commercial_friction_tier: f.tier,
      rights_commercial_friction_rank: f.rank,
      gate_eligible_for_acquisition_or_adapter_backlog: decision.eligible_for_acquisition_or_adapter_backlog === true,
      acquisition_authorized: false,
      adapter_development_authorized: false,
      evidence_admission_authorized: false,
      market_claim_authorized: false,
      public_projection: false,
      production: 'HOLD'
    });
  }
}

sourcePurposePackages.sort((a, b) =>
  a.rights_commercial_friction_rank - b.rights_commercial_friction_rank ||
  a.purpose_rank - b.purpose_rank ||
  Number(b.purpose_role_fit_state === 'CONFIRMED') - Number(a.purpose_role_fit_state === 'CONFIRMED') ||
  Number(currentBatchKeys.has(b.source_candidate_key)) - Number(currentBatchKeys.has(a.source_candidate_key)) ||
  (candidates.find(x => x.source_candidate_key === b.source_candidate_key)?.demand_instance_ids.length || 0) -
    (candidates.find(x => x.source_candidate_key === a.source_candidate_key)?.demand_instance_ids.length || 0) ||
  a.package_id.localeCompare(b.package_id)
);

const candidateByKey = new Map(candidates.map(candidate => [candidate.source_candidate_key, candidate]));
const maxPackets = Number(contract.rights_review_queue?.max_packets_per_cycle || 64);
const previousReviewAges = previous?.rights_review_age_by_package || {};
const previousQueuedPackages = new Set(array(previous?.rights_review_queue).map(packet => packet.package_id));
for (const pkg of sourcePurposePackages) {
  pkg.review_age_cycles = previous
    ? (previousQueuedPackages.has(pkg.package_id) ? 0 : Number(previousReviewAges[pkg.package_id] || 0) + 1)
    : 0;
}
const reviewCandidates = sourcePurposePackages
  .filter(pkg => pkg.rights_decision !== RIGHTS_CLEAR)
  .sort((a, b) =>
    Number(b.review_age_cycles >= 2) - Number(a.review_age_cycles >= 2) ||
    a.rights_commercial_friction_rank - b.rights_commercial_friction_rank ||
    a.purpose_rank - b.purpose_rank ||
    Number(b.purpose_role_fit_state === 'CONFIRMED') - Number(a.purpose_role_fit_state === 'CONFIRMED') ||
    Number(b.review_age_cycles) - Number(a.review_age_cycles) ||
    (candidates.find(x => x.source_candidate_key === b.source_candidate_key)?.demand_instance_ids.length || 0) -
      (candidates.find(x => x.source_candidate_key === a.source_candidate_key)?.demand_instance_ids.length || 0) ||
    a.package_id.localeCompare(b.package_id)
  );
const rightsReviewQueue = reviewCandidates
  .slice(0, maxPackets)
  .map((pkg, index) => {
    const candidate = candidateByKey.get(pkg.source_candidate_key);
    return {
      packet_id: `rights-review:${pkg.source_candidate_key}:${pkg.purpose}:${index + 1}`,
      source_candidate_key: pkg.source_candidate_key,
      source_id: pkg.source_id,
      canonical_locator: pkg.canonical_locator,
      source_name: pkg.source_name,
      discovery_providers: candidate.discovery_providers,
      candidate_source_roles: candidate.candidate_source_roles,
      purpose: pkg.purpose,
      rights_commercial_friction_tier: pkg.rights_commercial_friction_tier,
      rights_commercial_friction_rank: pkg.rights_commercial_friction_rank,
      purpose_rank: pkg.purpose_rank,
      ranking_vector: [
        pkg.review_age_cycles >= 2 ? 0 : 1,
        pkg.rights_commercial_friction_rank,
        pkg.purpose_rank,
        pkg.purpose_role_fit_state === 'CONFIRMED' ? 0 : 1,
        -pkg.review_age_cycles,
        -candidate.demand_instance_ids.length
      ],
      rights_reason_codes: pkg.rights_reason_codes,
      review_age_cycles: pkg.review_age_cycles,
      review_overdue: pkg.review_age_cycles >= 2,
      rights_state: 'UNASSESSED',
      admission_state: 'NOT_ADMITTED',
      acquisition_authorized: false,
      external_route: 'TRACK_Z_ISSUE_1166_THEN_KPMO_ISSUE_344_THEN_FOUNDER',
      next_action: pkg.rights_commercial_friction_rank >= 3
        ? 'TRACK_Z_EXTERNAL_RIGHTS_COMMERCIAL_DECISION'
        : 'INTERNAL_PURPOSE_RIGHTS_SCHEMA_AND_DOMAIN_PREFLIGHT'
    };
  });

const rightsClearSourcePool = sourcePurposePackages.filter(pkg => pkg.rights_decision === RIGHTS_CLEAR);
const permissionRequiredQueue = sourcePurposePackages.filter(pkg =>
  pkg.external_approval_required ||
  pkg.rights_commercial_friction_tier === 'EXTERNAL_COMMITMENT_OR_ACCESS_REQUIRED'
);
const noGoQueue = sourcePurposePackages.filter(pkg => pkg.rights_commercial_friction_tier === 'DENY_OR_PROHIBITED');
const domainFitHoldQueue = sourcePurposePackages.filter(pkg =>
  /NON_COLLECTOR|WRONG_PURPOSE|PUBLIC_SURPLUS|DOMAIN_FIT_HOLD/.test(pkg.domain_fit_state)
);
const adapterDevelopmentBacklog = sourcePurposePackages.filter(pkg =>
  pkg.purpose === 'CURRENT_SOLD_TRANSACTION' &&
  pkg.rights_decision === RIGHTS_CLEAR &&
  pkg.purpose_role_fit_state === 'CONFIRMED' &&
  pkg.domain_fit_state === 'COLLECTOR_MARKET_SCOPE_VERIFIED'
).map(pkg => ({
  ...pkg,
  adapter_development_authorized: true,
  acquisition_authorized: false,
  evidence_admission_authorized: false,
  next_action: 'IMPLEMENT_ADAPTER_THEN_REPLAY_MUTATION_AND_ADMISSION_REVIEW'
}));

const cycleCount = Number(previous?.cycle_count || 0) + 1;
const providerNames = unique(candidates.flatMap(candidate => candidate.discovery_providers));
const rightsClearCurrentSold = rightsClearSourcePool.filter(pkg => pkg.purpose === 'CURRENT_SOLD_TRANSACTION');
const rightsClearReferences = rightsClearSourcePool.filter(pkg => pkg.purpose === 'CURRENT_SOLD_TRANSACTION_REFERENCE');
const rightsHoldPackages = sourcePurposePackages.filter(pkg => pkg.rights_decision !== RIGHTS_CLEAR);
const contextExcluded = candidates.filter(candidate =>
  !candidate.candidate_purpose_intents.some(purpose => purpose.startsWith('CURRENT_SOLD_TRANSACTION')) &&
  candidate.candidate_purpose_intents.some(purpose => purpose !== 'SOURCE_ROLE_CLASSIFICATION')
).length;

const artifact = {
  id: 'kidults-asi-proactive-source-pool-v1',
  version: '1.1.0',
  rights_first_engine_version: '1.0.0',
  status: 'ROLLING_DISCOVERY_CANDIDATE_POOL',
  operating_mode: 'RIGHTS_FIRST_SOURCE_X_PURPOSE',
  cycle_count: cycleCount,
  rotation_cycle_index: (cycleCount - 1) % contract.discovery.rotation_cycle_count,
  updated_at: now,
  previous_candidate_count: Number(previous?.candidate_count || 0),
  migrated_duplicate_locator_count: migratedDuplicateLocatorCount,
  discovery_batch_candidate_count: Number(discovery.candidate_count || 0),
  new_candidate_count: newCount,
  reobserved_candidate_count: reobserved,
  candidate_count: candidates.length,
  covered_representative_products: unique(candidates.flatMap(candidate => candidate.representative_product_ids)).length,
  covered_regions: unique(candidates.flatMap(candidate => candidate.target_regions)),
  provider_counts: Object.fromEntries(providerNames.map(provider => [provider, candidates.filter(candidate => candidate.discovery_providers.includes(provider)).length])),
  lineage_policy: 'CANONICAL_LOCATOR_STABLE_PROVIDER_SWITCHABLE',
  provider_switching_preserves_source_candidate_identity: true,
  ranking_policy: 'RIGHTS_AND_COMMERCIAL_FRICTION_THEN_PURPOSE_FIT_THEN_DEMAND',
  source_x_purpose_partition_enforced: true,
  source_purpose_package_count: sourcePurposePackages.length,
  rights_clear_purpose_package_count: rightsClearSourcePool.length,
  rights_hold_purpose_package_count: rightsHoldPackages.length,
  rights_decision_partition_equation: `${sourcePurposePackages.length}=${rightsClearSourcePool.length}+${rightsHoldPackages.length}`,
  rights_clear_current_sold_reference_count: rightsClearReferences.length,
  rights_clear_current_sold_source_count: rightsClearCurrentSold.length,
  context_only_excluded_from_current_sold_count: contextExcluded,
  rights_review_queue_count: rightsReviewQueue.length,
  rights_review_age_by_package: Object.fromEntries(sourcePurposePackages
    .filter(pkg => pkg.rights_decision !== RIGHTS_CLEAR)
    .map(pkg => [pkg.package_id, pkg.review_age_cycles])),
  permission_required_queue_count: permissionRequiredQueue.length,
  no_go_queue_count: noGoQueue.length,
  domain_fit_hold_queue_count: domainFitHoldQueue.length,
  adapter_development_backlog_count: adapterDevelopmentBacklog.length,
  source_purpose_packages: sourcePurposePackages,
  rights_clear_source_pool: rightsClearSourcePool,
  rights_review_queue: rightsReviewQueue,
  permission_required_queue: permissionRequiredQueue,
  no_go_queue: noGoQueue,
  domain_fit_hold_queue: domainFitHoldQueue,
  adapter_development_backlog: adapterDevelopmentBacklog,
  candidates,
  content_acquired: false,
  rights_promoted_automatically: false,
  admission_promoted_automatically: false,
  acquisition_authorized: false,
  provider_contacted: false,
  account_created: false,
  eula_accepted: false,
  spend_authorized: false,
  external_provider_route: 'TRACK_Z_ISSUE_1166_THEN_KPMO_ISSUE_344_THEN_FOUNDER',
  public_release: 'HOLD',
  production: 'HOLD',
  truth_boundary: contract.truth_boundary
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify({
  status: artifact.status,
  operating_mode: artifact.operating_mode,
  cycle_count: cycleCount,
  candidate_count: artifact.candidate_count,
  source_purpose_packages: artifact.source_purpose_package_count,
  rights_clear_current_sold_references: artifact.rights_clear_current_sold_reference_count,
  rights_clear_current_sold_sources: artifact.rights_clear_current_sold_source_count,
  rights_review_packets: artifact.rights_review_queue_count,
  adapter_backlog: artifact.adapter_development_backlog_count,
  production: 'HOLD'
}));
