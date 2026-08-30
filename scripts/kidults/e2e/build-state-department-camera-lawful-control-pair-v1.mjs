#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {
  candidatePayloadSha256,
  ensure,
  evidencePayloadSha256,
  expectedIds,
  hashText,
  hashValue,
  pairDigestFor,
  readJson,
  same,
  stableJson,
  strictTimestamp,
  validateControlContract,
  validateControlPair,
} from './lawful-control-chain-common-v1.mjs';

const [observationArg, sourceContractArg, controlContractArg, outputArg] = process.argv.slice(2);
ensure(Boolean(observationArg && sourceContractArg && controlContractArg && outputArg), 'USAGE: build-state-department-camera-lawful-control-pair-v1.mjs <observation.json> <source-contract.json> <control-contract.json> <new-output-directory>');

const observationPath = path.resolve(observationArg);
const sourceContractPath = path.resolve(sourceContractArg);
const controlContractPath = path.resolve(controlContractArg);
const outputDir = path.resolve(outputArg);
const observation = readJson(observationPath);
const sourceContract = readJson(sourceContractPath);
const controlContract = readJson(controlContractPath);

validateControlContract(controlContract);
ensure(controlContract.authoritative_source.observation_path === path.relative(process.cwd(), observationPath), 'CONTROL_BUILDER_OBSERVATION_PATH_NOT_AUTHORITATIVE');
ensure(controlContract.authoritative_source.source_contract_path === path.relative(process.cwd(), sourceContractPath), 'CONTROL_BUILDER_SOURCE_CONTRACT_PATH_NOT_AUTHORITATIVE');

ensure(observation.id === controlContract.authoritative_source.observation_id && observation.version === '1.0.0' && observation.state === 'VERIFIED_PASS', 'CONTROL_BUILDER_OBSERVATION_IDENTITY_INVALID');
ensure(strictTimestamp(observation.as_of) && observation.as_of === observation.source_projection.observed_at, 'CONTROL_BUILDER_OBSERVATION_TIME_INVALID');
ensure(Date.parse(observation.as_of) <= Date.now(), 'CONTROL_BUILDER_OBSERVATION_TIME_IN_FUTURE');
ensure(observation.projection_sha256 === controlContract.authoritative_source.source_projection_sha256, 'CONTROL_BUILDER_SOURCE_PROJECTION_DIGEST_BINDING_INVALID');
ensure(hashValue(observation.source_projection) === observation.projection_sha256, 'CONTROL_BUILDER_SOURCE_PROJECTION_DIGEST_MISMATCH');

const expectedSource = controlContract.authoritative_source;
ensure(observation.source.source_id === expectedSource.source_id, 'CONTROL_BUILDER_SOURCE_ID_INVALID');
ensure(observation.source.source_owner_id === expectedSource.source_owner_id && observation.source.factual_origin_id === expectedSource.factual_origin_id, 'CONTROL_BUILDER_SOURCE_OWNER_OR_ORIGIN_INVALID');
ensure(observation.source.canonical_host === 'online-auction.state.gov' && observation.source.source_url === observation.source_projection.source_url, 'CONTROL_BUILDER_SOURCE_LOCATION_INVALID');
ensure(observation.source.owner_and_origin_state === 'VERIFIED_OFFICIAL_GOVERNMENT_HOST_SAME_OWNER_AND_FACTUAL_ORIGIN', 'CONTROL_BUILDER_SOURCE_OWNER_UNVERIFIED');
ensure(observation.observation_method.mode === 'BOUNDED_PUBLIC_PRIMARY_SOURCE_FACT_PROJECTION', 'CONTROL_BUILDER_OBSERVATION_MODE_INVALID');
for (const field of ['authenticated', 'account_created', 'credential_used', 'bid_or_purchase_executed', 'raw_html_archived_or_republished', 'images_or_graphics_archived_or_republished']) {
  ensure(observation.observation_method[field] === false, `CONTROL_BUILDER_OBSERVATION_METHOD_${field.toUpperCase()}_INVALID`);
}

const facts = observation.source_projection;
ensure(facts.source_schema_version === 'state-department-online-auction-fact-projection-v1', 'CONTROL_BUILDER_SOURCE_SCHEMA_VERSION_INVALID');
ensure(facts.auction_id === '13251474-ac4c-49d5-b3dc-9c9b0cb181e3' && facts.lot_uuid === 'fdc79e90-95ac-452e-8f9b-ac91aede6e3d', 'CONTROL_BUILDER_SOURCE_EVENT_OR_LOT_INVALID');
ensure(facts.title === 'NIKON CAMERA' && same(facts.object_identifiers, ['Nikon D5600', 'Nikon D90']), 'CONTROL_BUILDER_OBJECT_FACTS_INVALID');
ensure(facts.camera_quantity === 2 && facts.lot_quantity === 1 && facts.condition === 'Usable', 'CONTROL_BUILDER_LOT_FACTS_INVALID');
ensure(facts.terminal_page_state === 'SOLD_FOR' && facts.terminal_display_amount === 2110 && facts.currency === 'QAR' && facts.bid_count === 101, 'CONTROL_BUILDER_TERMINAL_FACTS_INVALID');
ensure(facts.auction_close_at === '2024-06-29T12:00:00Z' && facts.scope_id === expectedSource.scope_id && facts.domain_id === expectedSource.domain_id, 'CONTROL_BUILDER_TIME_OR_SCOPE_INVALID');

const expectedRights = expectedSource.required_rights;
ensure(same({
  collect: observation.rights.collect,
  store: observation.rights.store,
  transform: observation.rights.transform,
  display: observation.rights.display,
  redistribute: observation.rights.redistribute,
  sell: observation.rights.sell,
}, expectedRights), 'CONTROL_BUILDER_RIGHTS_BOUNDARY_INVALID');
ensure(observation.rights.decision === 'POLICY_AND_EVIDENCE_PREFLIGHT_PASS_ALLOW_FACTUAL_FIELDS_ONLY' && observation.rights.allowed_material === 'NORMALIZED_FACTUAL_FIELDS_ONLY', 'CONTROL_BUILDER_RIGHTS_DECISION_INVALID');
ensure(observation.rights.legal_conclusion_asserted === false && observation.rights.independent_legal_review_complete === false, 'CONTROL_BUILDER_LEGAL_REVIEW_FALSE_PROMOTION');
ensure(strictTimestamp(observation.rights.review_due_at) && Date.parse(observation.rights.review_due_at) > Date.now(), 'CONTROL_BUILDER_RIGHTS_REVIEW_EXPIRED');
ensure(same(observation.rights.evidence_refs, sourceContract.rights_policy.evidence_refs), 'CONTROL_BUILDER_RIGHTS_EVIDENCE_REFS_INVALID');

ensure(observation.semantic_boundary.admissible_evidence_class === expectedSource.required_evidence_class, 'CONTROL_BUILDER_EVIDENCE_CLASS_INVALID');
ensure(observation.semantic_boundary.event_state === 'SOLD' && observation.semantic_boundary.price_role === 'TERMINAL_HIGHEST_BID_DISPLAY_AMOUNT_NOT_CONFIRMED_SETTLEMENT_OR_ALL_IN_REALIZED', 'CONTROL_BUILDER_SEMANTIC_ROLE_INVALID');
for (const field of ['verified_sold_event', 'hammer_price_confirmed', 'settlement_confirmed', 'buyer_premium_inclusion_known', 'current_price', 'liquidity_or_time_to_sale', 'collector_market_representativeness_verified']) {
  ensure(observation.semantic_boundary[field] === false, `CONTROL_BUILDER_REFERENCE_CLAIM_INFLATION_${field.toUpperCase()}`);
}
for (const excluded of ['PHOTOS', 'GRAPHICS', 'STATE_DEPARTMENT_SEAL_OR_INSIGNIA', 'RAW_HTML', 'FULL_DESCRIPTION_REPRODUCTION', 'BIDDER_IDENTITY', 'ACCOUNT_DATA', 'PAYMENT_DATA', 'BIDDER_BID_HISTORY']) {
  ensure(observation.excluded_capture.includes(excluded), `CONTROL_BUILDER_EXCLUDED_CAPTURE_MISSING_${excluded}`);
}
ensure(observation.public_release === 'HOLD' && observation.production === 'HOLD' && observation.g5 === 'HOLD', 'CONTROL_BUILDER_OBSERVATION_PROTECTED_GATES_INVALID');

ensure(sourceContract.id === 'kidults-asi-state-department-camera-evidence-contract-v1' && sourceContract.status === 'VERIFIED_PASS', 'CONTROL_BUILDER_SOURCE_CONTRACT_INVALID');
ensure(sourceContract.authoritative_inputs.observation === controlContract.authoritative_source.observation_path, 'CONTROL_BUILDER_SOURCE_CONTRACT_OBSERVATION_PATH_INVALID');
ensure(sourceContract.authoritative_inputs.observation_projection_sha256 === observation.projection_sha256, 'CONTROL_BUILDER_SOURCE_CONTRACT_DIGEST_INVALID');
ensure(sourceContract.source_profile.source_id === expectedSource.source_id && sourceContract.source_profile.source_owner_id === expectedSource.source_owner_id && sourceContract.source_profile.factual_origin_id === expectedSource.factual_origin_id, 'CONTROL_BUILDER_SOURCE_CONTRACT_PROFILE_IDENTITY_INVALID');
ensure(sourceContract.admission_target.evidence_class === expectedSource.required_evidence_class && sourceContract.admission_target.price_type === expectedSource.required_price_type, 'CONTROL_BUILDER_SOURCE_CONTRACT_ADMISSION_INVALID');
ensure(hashValue(sourceContract.claim_ceiling) === expectedSource.claim_ceiling_sha256, 'CONTROL_BUILDER_SOURCE_CONTRACT_CLAIM_CEILING_DIGEST_INVALID');
ensure(sourceContract.rights_policy.public_display_redistribution_or_sale === 'HOLD', 'CONTROL_BUILDER_SOURCE_CONTRACT_RIGHTS_PROMOTED');
ensure(sourceContract.truth_boundary.snapshot_candidates_created === 0 && sourceContract.truth_boundary.track_b_input_pairs_created === 0, 'CONTROL_BUILDER_CANONICAL_TRUTH_ALREADY_PROMOTED');
ensure(sourceContract.truth_boundary.public_release === 'HOLD' && sourceContract.truth_boundary.production === 'HOLD' && sourceContract.truth_boundary.g5 === 'HOLD', 'CONTROL_BUILDER_SOURCE_CONTRACT_PROTECTED_GATES_INVALID');

const ids = expectedIds(controlContract);
const sourceObservation = {
  path: controlContract.authoritative_source.observation_path,
  observation_id: observation.id,
  source_id: observation.source.source_id,
  source_projection_sha256: observation.projection_sha256,
};
const protectedFields = {
  canonical_handoff_eligible: false,
  official_track_b_started: false,
  promotable: false,
  real_product_value_proof: false,
  approved_projection: false,
  publication_authorized: false,
  production_authorized: false,
  public_release: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
};

const candidate = {
  record_type: controlContract.track_a_control_pair.candidate_record_type,
  schema_version: '1.0.0',
  fixture_type: controlContract.track_a_control_pair.fixture_type,
  candidate_class: 'CONTROL_ONLY_NOT_CANONICAL_CANDIDATE',
  snapshot_id: ids.snapshotId,
  snapshot_status: 'CONTROL_ONLY',
  as_of: observation.as_of,
  source_observation: sourceObservation,
  bound_evidence_package_id: ids.evidencePackageId,
  evidence_state: 'REFERENCE_ONLY_CONTROL_INPUT',
  ...protectedFields,
  known_limitations: [
    'CONTROL_PAIR_IS_NOT_A_CANONICAL_SNAPSHOT_CANDIDATE',
    'DISPLAY_REDISTRIBUTION_AND_SALE_RIGHTS_REMAIN_UNKNOWN',
    'RAW_LIVE_SOURCE_SNAPSHOT_IS_NOT_VERIFIED',
    'TERMINAL_BID_DISPLAY_IS_NOT_A_CONFIRMED_HAMMER_OR_SETTLEMENT_PRICE',
    'CURRENT_MARKET_VALUE_AND_LIQUIDITY_ARE_NOT_VERIFIED',
    'MARKET_REPRESENTATIVENESS_IS_NOT_VERIFIED',
    'OFFICIAL_TRACK_B_HAS_NOT_STARTED',
    'PUBLIC_PRODUCTION_AND_G5_REMAIN_HOLD',
  ],
  candidate_payload_sha256: '',
  pair_digest: '',
};

const evidence = {
  record_type: controlContract.track_a_control_pair.evidence_record_type,
  schema_version: '1.0.0',
  fixture_type: controlContract.track_a_control_pair.fixture_type,
  evidence_package_id: ids.evidencePackageId,
  package_status: 'CONTROL_CONTENT_ADDRESSED_NOT_CANONICAL_IMMUTABLE',
  as_of: observation.as_of,
  bound_snapshot_id: ids.snapshotId,
  source_observation: sourceObservation,
  rights: {
    collect: observation.rights.collect,
    store: observation.rights.store,
    transform: observation.rights.transform,
    display: observation.rights.display,
    redistribute: observation.rights.redistribute,
    sell: observation.rights.sell,
    review_due_at: observation.rights.review_due_at,
    legal_conclusion_asserted: false,
    independent_legal_review_complete: false,
    evidence_refs: observation.rights.evidence_refs,
  },
  evidence_records: [{
    evidence_id: ids.evidenceId,
    admission_state: 'ADMITTED_CONTROL_REFERENCE_ONLY',
    evidence_class: observation.semantic_boundary.admissible_evidence_class,
    source_id: observation.source.source_id,
    source_owner_id: observation.source.source_owner_id,
    factual_origin_id: observation.source.factual_origin_id,
    scope_id: facts.scope_id,
    domain_id: facts.domain_id,
    internal_normalized_facts: {
      title: facts.title,
      object_identifiers: facts.object_identifiers,
      camera_quantity: facts.camera_quantity,
      lot_quantity: facts.lot_quantity,
      condition: facts.condition,
      event_state: observation.semantic_boundary.event_state,
      event_at: facts.auction_close_at,
      observed_at: facts.observed_at,
      terminal_display_amount: facts.terminal_display_amount,
      currency: facts.currency,
      bid_count: facts.bid_count,
    },
    price_role: observation.semantic_boundary.price_role,
    semantic_boundary: {
      verified_sold_event: false,
      hammer_price_confirmed: false,
      settlement_confirmed: false,
      current_price: false,
      liquidity_or_time_to_sale: false,
      collector_market_representativeness_verified: false,
    },
    provenance: {
      source_url: facts.source_url,
      source_projection_sha256: observation.projection_sha256,
      raw_live_source_snapshot_verified: false,
      lineage_digest_role: 'NORMALIZED_SOURCE_PROJECTION_DIGEST_NOT_RAW_SOURCE_PAYLOAD',
      source_schema_version: facts.source_schema_version,
      source_event_id: facts.auction_id,
      source_lot_id: facts.lot_uuid,
    },
    claim_ceiling: sourceContract.claim_ceiling,
    reference_only: true,
    signal_eligible: false,
    index_eligible: false,
    customer_claim_authorized: false,
  }],
  ...protectedFields,
  evidence_package_payload_sha256: '',
  pair_digest: '',
};

candidate.candidate_payload_sha256 = candidatePayloadSha256(candidate);
evidence.evidence_package_payload_sha256 = evidencePayloadSha256(evidence);
const pairDigest = pairDigestFor(candidate, evidence);
candidate.pair_digest = pairDigest;
evidence.pair_digest = pairDigest;
validateControlPair(candidate, evidence, controlContract);

ensure(!fs.existsSync(outputDir), 'CONTROL_BUILDER_OUTPUT_DIRECTORY_ALREADY_EXISTS');
fs.mkdirSync(path.dirname(outputDir), { recursive: true });
const temporaryDir = fs.mkdtempSync(`${outputDir}.tmp-`);
try {
  const candidateText = stableJson(candidate);
  const evidenceText = stableJson(evidence);
  fs.writeFileSync(path.join(temporaryDir, 'snapshot-candidate.json'), candidateText, { flag: 'wx' });
  fs.writeFileSync(path.join(temporaryDir, 'evidence-package.json'), evidenceText, { flag: 'wx' });
  const manifest = {
    id: `state-department-camera-lawful-control-pair-${pairDigest.slice(7)}`,
    version: '1.0.0',
    state: 'VERIFIED_NON_PROMOTABLE_CONTROL_PAIR',
    as_of: observation.as_of,
    fixture_type: controlContract.track_a_control_pair.fixture_type,
    source_projection_sha256: observation.projection_sha256,
    snapshot_id: candidate.snapshot_id,
    evidence_package_id: evidence.evidence_package_id,
    candidate_payload_sha256: candidate.candidate_payload_sha256,
    evidence_package_payload_sha256: evidence.evidence_package_payload_sha256,
    pair_digest: pairDigest,
    output_files: [
      { name: 'snapshot-candidate.json', sha256: hashText(candidateText), bytes: Buffer.byteLength(candidateText) },
      { name: 'evidence-package.json', sha256: hashText(evidenceText), bytes: Buffer.byteLength(evidenceText) },
    ],
    files_written: controlContract.track_a_control_pair.output_files,
    canonical_handoff_eligible: false,
    official_track_b_started: false,
    real_product_value_proof: false,
    approved_projection: false,
    canonical_truth_counters_mutated: false,
    public_release: 'HOLD',
    production: 'HOLD',
    g5: 'HOLD',
  };
  fs.writeFileSync(path.join(temporaryDir, 'track-a-control-manifest.json'), stableJson(manifest), { flag: 'wx' });
  fs.renameSync(temporaryDir, outputDir);
} catch (error) {
  fs.rmSync(temporaryDir, { recursive: true, force: true });
  throw error;
}

process.stdout.write(stableJson({
  state: 'VERIFIED_NON_PROMOTABLE_CONTROL_PAIR',
  output_directory: outputDir,
  pair_digest: pairDigest,
  canonical_handoff_eligible: false,
  official_track_b_started: false,
  real_product_value_proof: false,
  approved_projection: false,
  public_release: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
}));
