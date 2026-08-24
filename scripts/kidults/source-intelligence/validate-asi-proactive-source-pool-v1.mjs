#!/usr/bin/env node
import fs from 'node:fs';

const filePath = process.argv[2] || '/tmp/asi-proactive-source-pool-v1.json';
const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
const fail = message => { throw new Error(message); };
const array = input => Array.isArray(input) ? input : [];
const canonicalRef = input => /^https:\/\/[^\s]+$/i.test(String(input || '')) ||
  /^repo:[^\s#]+#[^\s]+$/i.test(String(input || '')) ||
  /^artifact:sha256:[a-f0-9]{64}$/i.test(String(input || '')) ||
  /^registry:[^\s]+$/i.test(String(input || ''));

if (value.id !== 'kidults-asi-proactive-source-pool-v1') fail('ID');
if (value.version !== '1.1.0') fail('VERSION');
if (value.rights_first_engine_version !== '1.0.0') fail('RIGHTS_FIRST_ENGINE_VERSION');
if (value.status !== 'ROLLING_DISCOVERY_CANDIDATE_POOL') fail('STATUS');
if (value.operating_mode !== 'RIGHTS_FIRST_SOURCE_X_PURPOSE') fail('OPERATING_MODE');
if (value.ranking_policy !== 'RIGHTS_AND_COMMERCIAL_FRICTION_THEN_PURPOSE_FIT_THEN_DEMAND') fail('RANKING_POLICY');
if (value.source_x_purpose_partition_enforced !== true) fail('SOURCE_X_PURPOSE_PARTITION');
if (value.lineage_policy !== 'CANONICAL_LOCATOR_STABLE_PROVIDER_SWITCHABLE') fail('LINEAGE_POLICY');
if (value.provider_switching_preserves_source_candidate_identity !== true) fail('PROVIDER_SWITCHING_BOUNDARY');
if (value.external_provider_route !== 'TRACK_Z_ISSUE_1166_THEN_KPMO_ISSUE_344_THEN_FOUNDER') fail('EXTERNAL_ROUTING');
if (value.production !== 'HOLD' || value.public_release !== 'HOLD') fail('RELEASE_BOUNDARY');
for (const [key, expected] of Object.entries({
  acquisition_authorized: false,
  rights_promoted_automatically: false,
  admission_promoted_automatically: false,
  content_acquired: false,
  provider_contacted: false,
  account_created: false,
  eula_accepted: false,
  spend_authorized: false
})) if (value[key] !== expected) fail(`GLOBAL_BOUNDARY:${key}`);

for (const key of [
  'candidates',
  'source_purpose_packages',
  'rights_clear_source_pool',
  'rights_review_queue',
  'permission_required_queue',
  'no_go_queue',
  'domain_fit_hold_queue',
  'adapter_development_backlog'
]) if (!Array.isArray(value[key])) fail(`ARRAY:${key}`);

const keys = new Set();
const locators = new Set();
for (const candidate of value.candidates) {
  if (keys.has(candidate.source_candidate_key)) fail(`DUPLICATE_KEY:${candidate.source_candidate_key}`);
  keys.add(candidate.source_candidate_key);
  if (locators.has(candidate.canonical_locator)) fail(`DUPLICATE_LOCATOR:${candidate.canonical_locator}`);
  locators.add(candidate.canonical_locator);
  for (const field of [
    'source_candidate_key', 'canonical_locator', 'source_name', 'first_seen_at', 'last_seen_at', 'observation_count',
    'discovery_providers', 'source_family_hints', 'candidate_source_roles', 'candidate_purpose_intents',
    'representative_product_ids', 'demand_instance_ids', 'target_regions', 'target_languages',
    'provider_record_ids', 'governed_source_ids', 'rights_state', 'admission_state', 'source_pool_state',
    'evidence_state', 'next_action'
  ]) if (candidate[field] === undefined || candidate[field] === null) fail(`MISSING:${field}`);
  for (const field of [
    'discovery_providers', 'source_family_hints', 'candidate_source_roles', 'candidate_purpose_intents',
    'representative_product_ids', 'demand_instance_ids', 'target_regions', 'target_languages',
    'provider_record_ids', 'governed_source_ids'
  ]) if (!Array.isArray(candidate[field])) fail(`NOT_ARRAY:${candidate.source_candidate_key}:${field}`);
  if (candidate.discovery_providers.length < 1) fail(`PROVIDER_EMPTY:${candidate.source_candidate_key}`);
  if (new Set(candidate.discovery_providers).size !== candidate.discovery_providers.length) fail(`PROVIDER_DUPLICATE:${candidate.source_candidate_key}`);
  if (candidate.candidate_purpose_intents.length < 1) fail(`PURPOSE_EMPTY:${candidate.source_candidate_key}`);
  if (candidate.provider_switchable_identity !== true) fail(`PROVIDER_SWITCHING_DISABLED:${candidate.source_candidate_key}`);
  if (candidate.rights_state !== 'UNASSESSED' ||
      candidate.admission_state !== 'NOT_ADMITTED' ||
      candidate.source_pool_state !== 'CANDIDATE_ONLY' ||
      candidate.evidence_state !== 'DISCOVERY_METADATA_ONLY') fail(`RAW_DISCOVERY_PROMOTION:${candidate.source_candidate_key}`);
  if (candidate.acquisition_authorized !== false ||
      candidate.target_site_traversal_authorized !== false ||
      candidate.market_claim_authorized !== false ||
      candidate.public_projection !== false ||
      candidate.production !== 'HOLD') fail(`CANDIDATE_BOUNDARY:${candidate.source_candidate_key}`);
  if (Number(candidate.observation_count) < 1) fail(`OBSERVATION_COUNT:${candidate.source_candidate_key}`);
}
if (Number(value.candidate_count) !== value.candidates.length) fail('CANDIDATE_COUNT');

const packageIds = new Set();
const packageById = new Map();
let rightsClearCount = 0;
let rightsHoldCount = 0;
let currentSoldClearCount = 0;
let referenceClearCount = 0;
const gatePurposes = new Set([
  'CURRENT_SOLD_TRANSACTION_REFERENCE',
  'CURRENT_SOLD_TRANSACTION',
  'CURRENT_SOLD_TRANSACTION_AND_LIQUIDITY_ACQUISITION'
]);
const allowedSourceStates = new Set([
  'RIGHTS_CLEAR_COLLECTOR_CURRENT_SOLD_CANDIDATE',
  'RIGHTS_CLEAR_REFERENCE_ONLY',
  'CURRENT_SOLD_PURPOSE_HOLD',
  'REFERENCE_PURPOSE_HOLD',
  'DISCOVERY_OR_CONTEXT_ONLY'
]);
for (const pkg of value.source_purpose_packages) {
  if (packageIds.has(pkg.package_id)) fail(`DUPLICATE_PACKAGE:${pkg.package_id}`);
  packageIds.add(pkg.package_id);
  packageById.set(pkg.package_id, pkg);
  if (!keys.has(pkg.source_candidate_key)) fail(`PACKAGE_ORPHAN:${pkg.package_id}`);
  if (!pkg.purpose || !Array.isArray(pkg.source_roles) || !Array.isArray(pkg.evidence_classes)) fail(`PACKAGE_SHAPE:${pkg.package_id}`);
  if (!allowedSourceStates.has(pkg.source_state)) fail(`SOURCE_STATE:${pkg.package_id}`);
  if (!['RIGHTS_CLEAR_FOR_PURPOSE', 'RIGHTS_HOLD'].includes(pkg.rights_decision)) fail(`RIGHTS_DECISION:${pkg.package_id}`);
  if (pkg.acquisition_authorized !== false ||
      pkg.adapter_development_authorized !== false ||
      pkg.evidence_admission_authorized !== false ||
      pkg.market_claim_authorized !== false ||
      pkg.public_projection !== false ||
      pkg.production !== 'HOLD') fail(`PACKAGE_BOUNDARY:${pkg.package_id}`);
  if (pkg.rights_decision === 'RIGHTS_CLEAR_FOR_PURPOSE') {
    rightsClearCount++;
    if (!gatePurposes.has(pkg.purpose)) fail(`UNSUPPORTED_CLEAR_PURPOSE:${pkg.package_id}`);
    if (pkg.gate_eligible_for_acquisition_or_adapter_backlog !== true) fail(`CLEAR_GATE_ELIGIBILITY:${pkg.package_id}`);
    if (!pkg.purpose_binding_id) fail(`CLEAR_BINDING_MISSING:${pkg.package_id}`);
    if (!/^sha256:[a-f0-9]{64}$/i.test(String(pkg.rights_evidence_digest || ''))) fail(`CLEAR_DIGEST:${pkg.package_id}`);
    if (!pkg.rights_evidence_refs.length || pkg.rights_evidence_refs.some(ref => !canonicalRef(ref))) fail(`CLEAR_REFS:${pkg.package_id}`);
    if (pkg.purpose_role_fit_state !== 'CONFIRMED') fail(`CLEAR_ROLE_FIT:${pkg.package_id}`);
  } else {
    rightsHoldCount++;
    if (pkg.gate_eligible_for_acquisition_or_adapter_backlog !== false) fail(`HOLD_GATE_ELIGIBILITY:${pkg.package_id}`);
  }
  if (pkg.purpose === 'CURRENT_SOLD_TRANSACTION') {
    if (!pkg.source_roles.includes('SOLD_TRANSACTION')) fail(`CURRENT_SOLD_ROLE:${pkg.package_id}`);
    if (pkg.rights_decision === 'RIGHTS_CLEAR_FOR_PURPOSE') {
      currentSoldClearCount++;
      if (!pkg.evidence_classes.includes('CURRENT_SOLD_TRANSACTION')) fail(`CURRENT_SOLD_EVIDENCE_CLASS:${pkg.package_id}`);
    }
  }
  if (pkg.purpose === 'CURRENT_SOLD_TRANSACTION_REFERENCE' && pkg.rights_decision === 'RIGHTS_CLEAR_FOR_PURPOSE') {
    referenceClearCount++;
    if (!pkg.evidence_classes.includes('CURRENT_SOLD_TRANSACTION_REFERENCE')) fail(`REFERENCE_EVIDENCE_CLASS:${pkg.package_id}`);
  }
  if (['ACTIVE_LISTING_CONTEXT', 'IDENTITY_CATALOG', 'CULTURE_ATTENTION'].includes(pkg.purpose) &&
      pkg.rights_decision === 'RIGHTS_CLEAR_FOR_PURPOSE') fail(`CONTEXT_WIDENED_TO_CLEAR:${pkg.package_id}`);
}
if (Number(value.source_purpose_package_count) !== value.source_purpose_packages.length) fail('PACKAGE_COUNT');
if (Number(value.rights_clear_purpose_package_count) !== rightsClearCount) fail('RIGHTS_CLEAR_COUNT');
if (Number(value.rights_hold_purpose_package_count) !== rightsHoldCount) fail('RIGHTS_HOLD_COUNT');
if (Number(value.rights_clear_current_sold_source_count) !== currentSoldClearCount) fail('CURRENT_SOLD_CLEAR_COUNT');
if (Number(value.rights_clear_current_sold_reference_count) !== referenceClearCount) fail('REFERENCE_CLEAR_COUNT');
if (value.source_purpose_packages.length !== rightsClearCount + rightsHoldCount) fail('RIGHTS_PARTITION');

const assertSubset = (items, label) => {
  for (const item of items) {
    if (!packageIds.has(item.package_id)) fail(`${label}_ORPHAN:${item.package_id}`);
    if (item.source_candidate_key !== packageById.get(item.package_id).source_candidate_key) fail(`${label}_MISMATCH:${item.package_id}`);
  }
};
assertSubset(value.rights_clear_source_pool, 'CLEAR_POOL');
assertSubset(value.permission_required_queue, 'PERMISSION_QUEUE');
assertSubset(value.no_go_queue, 'NO_GO_QUEUE');
assertSubset(value.domain_fit_hold_queue, 'DOMAIN_FIT_QUEUE');
assertSubset(value.adapter_development_backlog, 'ADAPTER_BACKLOG');

if (value.rights_clear_source_pool.some(pkg => pkg.rights_decision !== 'RIGHTS_CLEAR_FOR_PURPOSE')) fail('CLEAR_POOL_CONTAMINATION');
if (Number(value.rights_review_queue_count) !== value.rights_review_queue.length) fail('REVIEW_QUEUE_COUNT');
if (value.rights_review_queue.length > 64) fail('RIGHTS_QUEUE_LIMIT');
if (!value.rights_review_age_by_package || typeof value.rights_review_age_by_package !== 'object') fail('REVIEW_AGE_STATE_MISSING');
if (!value.review_state_by_package || typeof value.review_state_by_package !== 'object') fail('REVIEW_STATE_MISSING');
if (!value.rights_eval_cache || typeof value.rights_eval_cache !== 'object') fail('RIGHTS_EVAL_CACHE_MISSING');
let previousRanking = null;
for (const receipt of value.rights_review_queue) {
  if (receipt.rights_state !== 'UNASSESSED' ||
      receipt.admission_state !== 'NOT_ADMITTED' ||
      receipt.acquisition_authorized !== false) fail(`RIGHTS_PACKET_PROMOTION:${receipt.packet_id}`);
  if (!keys.has(receipt.source_candidate_key)) fail(`RIGHTS_PACKET_ORPHAN:${receipt.packet_id}`);
  if (!Array.isArray(receipt.discovery_providers) || receipt.discovery_providers.length < 1) fail(`RIGHTS_PACKET_PROVIDER_MISSING:${receipt.packet_id}`);
  if (!Array.isArray(receipt.ranking_vector) || receipt.ranking_vector.length !== 6) fail(`RANKING_VECTOR:${receipt.packet_id}`);
  if (!Number.isInteger(receipt.review_age_cycles) || receipt.review_age_cycles < 0) fail(`REVIEW_AGE:${receipt.packet_id}`);
  if (receipt.review_overdue !== (receipt.review_age_cycles >= 2)) fail(`REVIEW_OVERDUE:${receipt.packet_id}`);
  if (!['PENDING', 'IN_REVIEW', 'CLOSED', 'REVIEWED_PASS', 'REVIEWED_NO_GO'].includes(packageById.get(receipt.package_id)?.review_state || 'PENDING')) fail(`REVIEW_STATE:${receipt.packet_id}`);
  if (Number(value.rights_review_age_by_package[`source-purpose:${receipt.source_candidate_key}:${receipt.purpose}`]) !== receipt.review_age_cycles) fail(`REVIEW_AGE_STATE:${receipt.packet_id}`);
  if (receipt.external_route !== 'TRACK_Z_ISSUE_1166_THEN_KPMO_ISSUE_344_THEN_FOUNDER') fail(`RIGHTS_PACKET_ROUTE:${receipt.packet_id}`);
  if (previousRanking) {
    for (let i = 0; i < 6; i++) {
      if (receipt.ranking_vector[i] < previousRanking[i]) fail(`RIGHTS_FIRST_RANKING_INVERSION:${receipt.packet_id}`);
      if (receipt.ranking_vector[i] > previousRanking[i]) break;
    }
  }
  previousRanking = receipt.ranking_vector;
}

for (const backlog of value.adapter_development_backlog) {
  if (backlog.purpose !== 'CURRENT_SOLD_TRANSACTION' ||
      backlog.rights_decision !== 'RIGHTS_CLEAR_FOR_PURPOSE' ||
      backlog.purpose_role_fit_state !== 'CONFIRMED' ||
      backlog.domain_fit_state !== 'COLLECTOR_MARKET_SCOPE_VERIFIED') fail(`ADAPTER_BACKLOG_GATE_BYPASS:${backlog.package_id}`);
  if (backlog.adapter_development_authorized !== true ||
      backlog.acquisition_authorized !== false ||
      backlog.evidence_admission_authorized !== false) fail(`ADAPTER_BACKLOG_BOUNDARY:${backlog.package_id}`);
}
for (const [key, actual] of Object.entries({
  permission_required_queue_count: value.permission_required_queue.length,
  no_go_queue_count: value.no_go_queue.length,
  domain_fit_hold_queue_count: value.domain_fit_hold_queue.length,
  adapter_development_backlog_count: value.adapter_development_backlog.length
})) if (Number(value[key]) !== actual) fail(`QUEUE_COUNT:${key}`);

const providers = [...new Set(value.candidates.flatMap(candidate => candidate.discovery_providers))];
for (const provider of providers) {
  const actual = value.candidates.filter(candidate => candidate.discovery_providers.includes(provider)).length;
  if (Number(value.provider_counts?.[provider] || 0) !== actual) fail(`PROVIDER_COUNT:${provider}`);
}
for (const provider of Object.keys(value.provider_counts || {})) if (!providers.includes(provider)) fail(`ORPHAN_PROVIDER_COUNT:${provider}`);

console.log(JSON.stringify({
  status: 'PASS',
  operating_mode: value.operating_mode,
  cycle_count: value.cycle_count,
  candidate_count: value.candidate_count,
  source_purpose_packages: value.source_purpose_package_count,
  rights_clear_current_sold_references: value.rights_clear_current_sold_reference_count,
  rights_clear_current_sold_sources: value.rights_clear_current_sold_source_count,
  rights_review_packets: value.rights_review_queue.length,
  adapter_backlog: value.adapter_development_backlog.length,
  production: value.production
}));
