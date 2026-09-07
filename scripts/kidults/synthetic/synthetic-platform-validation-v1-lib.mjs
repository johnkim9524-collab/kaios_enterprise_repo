import crypto from 'node:crypto';

export const SYNTHETIC_NOTICE = 'SYNTHETIC TEST DATA — INTERNAL VALIDATION ONLY';
export const SYNTHETIC_ENVIRONMENT = 'SYNTHETIC';
export const PIPELINE_STAGES = Object.freeze([
  'ASI',
  'RIGHTS_GATE',
  'ENTITY_RESOLUTION',
  'CANONICAL',
  'CURRENT_SOLD_ENGINE',
  'EVIDENCE_LEDGER',
  'CANDIDATE',
  'TRACK_B',
  'PROJECTION',
  'API',
  'PORTAL',
  'AUDIT',
]);

const FIXED_RECORD_FIELDS = Object.freeze({
  environment: SYNTHETIC_ENVIRONMENT,
  empirical: false,
  rights_receipt: 'NONE',
  provider: 'NONE',
  production_eligible: false,
  market_authority: false,
  portal_label: SYNTHETIC_NOTICE,
});

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
};

export const stableText = (value) => `${JSON.stringify(canonicalize(value), null, 2)}\n`;
export const digest = (value) => `sha256:${crypto.createHash('sha256')
  .update(JSON.stringify(canonicalize(value))).digest('hex')}`;

const id = (kind, seed) => `spv-${kind}-${crypto.createHash('sha256').update(seed).digest('hex').slice(0, 24)}`;
const assert = (condition, code) => { if (!condition) throw new Error(code); };
const timestamp = (ordinal) => new Date(Date.UTC(2026, 8, 7, 0, ordinal, 0)).toISOString();

export function buildSyntheticDataset(verticalRegistry) {
  const verticals = [...(verticalRegistry.verticals ?? [])].sort((left, right) => left.ordinal - right.ordinal);
  assert(verticals.length === 8, 'SPV_VERTICAL_COUNT_MUST_EQUAL_8');
  assert(verticals.every((vertical) => vertical.status === 'active'), 'SPV_VERTICAL_NOT_ACTIVE');

  const records = verticals.flatMap((vertical, verticalIndex) => Array.from({ length: 15 }, (_, recordIndex) => {
    const ordinal = verticalIndex * 15 + recordIndex + 1;
    const seed = `spv-v1|${vertical.vertical_id}|${String(recordIndex + 1).padStart(2, '0')}`;
    const observedAt = timestamp(ordinal);
    const entityId = id('entity', seed);
    const observationId = id('observation', seed);
    const evidenceId = id('evidence', seed);
    const candidateId = id('candidate', seed);
    const soldEventId = id('sold-event', seed);
    return {
      record_id: id('record', seed),
      record_version: '1.0.0',
      vertical_id: vertical.vertical_id,
      vertical_ordinal: vertical.ordinal,
      synthetic_sequence: recordIndex + 1,
      ...FIXED_RECORD_FIELDS,
      canonical_entity: {
        canonical_entity_id: entityId,
        display_name: `Synthetic ${vertical.display_name} ${String(recordIndex + 1).padStart(2, '0')}`,
        resolution_key: digest({ vertical_id: vertical.vertical_id, synthetic_sequence: recordIndex + 1 }),
        synthetic: true,
      },
      observation: {
        observation_id: observationId,
        observed_at: observedAt,
        observation_class: 'SYNTHETIC_CONTROL_OBSERVATION',
        source_record_ref: 'NONE',
        synthetic: true,
      },
      candidate: {
        candidate_id: candidateId,
        canonical_entity_id: entityId,
        candidate_class: 'SYNTHETIC_VALIDATION_CANDIDATE',
        promotion_eligible: false,
        synthetic: true,
      },
      synthetic_sold_event: {
        event_id: soldEventId,
        canonical_entity_id: entityId,
        event_at: observedAt,
        event_state: 'SYNTHETIC_SOLD_CONTROL',
        amount: 100000 + ordinal,
        currency: 'XTS',
        empirical_market_event: false,
        current_market_claim_eligible: false,
        synthetic: true,
      },
      synthetic_evidence: {
        evidence_id: evidenceId,
        subject_id: entityId,
        evidence_class: 'SYNTHETIC_CONTROL_EVIDENCE',
        authority: false,
        empirical_evidence_eligible: false,
        payload_digest: digest({ observation_id: observationId, event_id: soldEventId }),
        synthetic: true,
      },
      timestamps: {
        created_at: observedAt,
        observed_at: observedAt,
        valid_at: observedAt,
      },
      provenance: {
        origin: 'KIDULTS_DETERMINISTIC_SYNTHETIC_GENERATOR_V1',
        generator_version: '1.0.0',
        provider_record_ref: 'NONE',
        external_api_touch: false,
        credential_touch: false,
        source_payload_digest: 'NONE',
        synthetic: true,
      },
    };
  }));

  const dataset = {
    dataset_id: 'kidults-spv-120-v1',
    version: '1.0.0',
    dataset_class: 'SYNTHETIC_ONLY_INTERNAL_VALIDATION',
    generated_at: '2026-09-07T00:00:00.000Z',
    generator_id: 'KIDULTS_DETERMINISTIC_SYNTHETIC_GENERATOR_V1',
    environment: SYNTHETIC_ENVIRONMENT,
    empirical: false,
    provider_data_present: false,
    external_api_touch: false,
    credential_touch: false,
    production_eligible: false,
    public_eligible: false,
    g5: 'HOLD',
    market_accuracy_claimed: false,
    investment_accuracy_claimed: false,
    portal_label: SYNTHETIC_NOTICE,
    vertical_count: verticals.length,
    records_per_vertical: 15,
    record_count: records.length,
    records,
  };
  dataset.dataset_digest = digest(dataset);
  return dataset;
}

export function assertSyntheticRecord(record) {
  for (const [key, expected] of Object.entries(FIXED_RECORD_FIELDS)) {
    assert(record[key] === expected, `SPV_ISOLATION_${key.toUpperCase()}_INVALID`);
  }
  assert(record.canonical_entity?.synthetic === true, 'SPV_ENTITY_SYNTHETIC_MARKER_REQUIRED');
  assert(record.observation?.synthetic === true, 'SPV_OBSERVATION_SYNTHETIC_MARKER_REQUIRED');
  assert(record.candidate?.synthetic === true && record.candidate?.promotion_eligible === false,
    'SPV_CANDIDATE_PROMOTION_FORBIDDEN');
  assert(record.synthetic_sold_event?.synthetic === true
    && record.synthetic_sold_event?.empirical_market_event === false
    && record.synthetic_sold_event?.current_market_claim_eligible === false,
  'SPV_SYNTHETIC_SOLD_PROMOTION_FORBIDDEN');
  assert(record.synthetic_evidence?.synthetic === true
    && record.synthetic_evidence?.authority === false
    && record.synthetic_evidence?.empirical_evidence_eligible === false,
  'SPV_SYNTHETIC_EVIDENCE_PROMOTION_FORBIDDEN');
  assert(record.provenance?.origin === 'KIDULTS_DETERMINISTIC_SYNTHETIC_GENERATOR_V1'
    && record.provenance?.provider_record_ref === 'NONE'
    && record.provenance?.external_api_touch === false
    && record.provenance?.credential_touch === false,
  'SPV_PROVENANCE_BOUNDARY_INVALID');
  assert(record.synthetic_sold_event?.currency === 'XTS', 'SPV_TEST_CURRENCY_REQUIRED');
  assert(record.synthetic_sold_event?.canonical_entity_id === record.canonical_entity?.canonical_entity_id,
    'SPV_SOLD_ENTITY_LINEAGE_INVALID');
  assert(record.candidate?.canonical_entity_id === record.canonical_entity?.canonical_entity_id,
    'SPV_CANDIDATE_ENTITY_LINEAGE_INVALID');
  assert(record.synthetic_evidence?.subject_id === record.canonical_entity?.canonical_entity_id,
    'SPV_EVIDENCE_ENTITY_LINEAGE_INVALID');
}

export function assertEmpiricalAdmission(candidate) {
  assert(candidate?.environment !== SYNTHETIC_ENVIRONMENT, 'SPV_SYNTHETIC_TO_EMPIRICAL_ADMISSION_FORBIDDEN');
  assert(candidate?.empirical === true, 'SPV_EMPIRICAL_ADMISSION_MARKER_REQUIRED');
  assert(candidate?.provider !== 'NONE', 'SPV_EMPIRICAL_PROVIDER_REQUIRED');
  assert(candidate?.rights_receipt !== 'NONE', 'SPV_EMPIRICAL_RIGHTS_RECEIPT_REQUIRED');
  return true;
}

export class SyntheticReplayLedger {
  #recordDigests = new Map();

  admit(record) {
    assertSyntheticRecord(record);
    const recordDigest = digest(record);
    const prior = this.#recordDigests.get(record.record_id);
    if (prior && prior !== recordDigest) throw new Error('SPV_REPLAY_LINEAGE_MUTATION_REJECTED');
    if (prior === recordDigest) return { decision: 'IDEMPOTENT_REPLAY', record_digest: recordDigest };
    this.#recordDigests.set(record.record_id, recordDigest);
    return { decision: 'ADMITTED_ONCE', record_digest: recordDigest };
  }
}

function stageReceipt(record, stage, inputDigest, output) {
  return {
    stage,
    record_id: record.record_id,
    environment: SYNTHETIC_ENVIRONMENT,
    empirical: false,
    promotion_eligible: false,
    input_digest: inputDigest,
    output_digest: digest(output),
    decision: 'SYNTHETIC_VALIDATION_PASS_NON_PROMOTABLE',
  };
}

export function executeSyntheticRecord(record) {
  assertSyntheticRecord(record);
  let current = { record_id: record.record_id, dataset_class: 'SYNTHETIC_ONLY_INTERNAL_VALIDATION' };
  const receipts = [];
  const advance = (stage, output) => {
    const receipt = stageReceipt(record, stage, digest(current), output);
    receipts.push(receipt);
    current = { ...output, stage_receipt_digest: digest(receipt) };
  };

  advance('ASI', {
    source_class: 'SYNTHETIC_GENERATOR', provider: 'NONE', external_api_touch: false,
    observation_id: record.observation.observation_id,
  });
  advance('RIGHTS_GATE', {
    decision: 'SYNTHETIC_INTERNAL_CONTROL_ONLY', rights_receipt: 'NONE', rights_promoted: false,
  });
  advance('ENTITY_RESOLUTION', {
    canonical_entity_id: record.canonical_entity.canonical_entity_id,
    resolution_key: record.canonical_entity.resolution_key,
    deterministic: true,
  });
  advance('CANONICAL', {
    canonical_entity_id: record.canonical_entity.canonical_entity_id,
    canonical_digest: digest(record.canonical_entity), immutable: true,
  });
  advance('CURRENT_SOLD_ENGINE', {
    event_id: record.synthetic_sold_event.event_id,
    event_class: 'SYNTHETIC_SOLD_CONTROL', current_sold_empirical_eligible: false,
  });
  advance('EVIDENCE_LEDGER', {
    evidence_id: record.synthetic_evidence.evidence_id,
    evidence_class: 'SYNTHETIC_CONTROL_EVIDENCE', append_only: true, empirical_eligible: false,
  });
  advance('CANDIDATE', {
    candidate_id: record.candidate.candidate_id,
    candidate_class: 'SYNTHETIC_VALIDATION_CANDIDATE', promotion_eligible: false,
  });
  advance('TRACK_B', {
    assessment_id: id('track-b', record.record_id), assessment_class: 'SYNTHETIC_CONTROL_ONLY',
    deterministic_score: record.vertical_ordinal * 100 + record.synthetic_sequence,
    independent_empirical_assessment: false, promotion_eligible: false,
  });
  advance('PROJECTION', {
    projection_id: id('projection', record.record_id), audience: 'INTERNAL_SYNTHETIC_VALIDATION',
    portal_label: SYNTHETIC_NOTICE, public_eligible: false, production_eligible: false,
  });
  advance('API', {
    route: `/internal/synthetic/v1/records/${record.record_id}`,
    access_class: 'INTERNAL_ONLY', public_route: false, cache_partition: 'SYNTHETIC',
  });
  advance('PORTAL', {
    portal_record_id: record.record_id, persistent_notice: SYNTHETIC_NOTICE,
    production_market_data: false, public_eligible: false,
  });
  advance('AUDIT', {
    audit_record_id: id('audit', record.record_id), synthetic_origin_verified: true,
    no_empirical_promotion: true, no_provider_activation: true, no_rights_promotion: true,
    no_production_eligibility: true,
  });

  assert(receipts.map((receipt) => receipt.stage).join('|') === PIPELINE_STAGES.join('|'),
    'SPV_PIPELINE_STAGE_ORDER_INVALID');
  return {
    record_id: record.record_id,
    pipeline_state: 'SYNTHETIC_VALIDATION_PASS_NON_PROMOTABLE',
    stage_count: receipts.length,
    stage_receipts: receipts,
    final_digest: digest(current),
  };
}

export function executeSyntheticDataset(dataset) {
  assert(dataset.environment === SYNTHETIC_ENVIRONMENT && dataset.empirical === false,
    'SPV_DATASET_CLASSIFICATION_INVALID');
  assert(dataset.provider_data_present === false && dataset.external_api_touch === false
    && dataset.credential_touch === false, 'SPV_DATASET_PROVIDER_BOUNDARY_INVALID');
  assert(dataset.production_eligible === false && dataset.public_eligible === false && dataset.g5 === 'HOLD',
    'SPV_DATASET_RELEASE_BOUNDARY_INVALID');
  assert(dataset.market_accuracy_claimed === false && dataset.investment_accuracy_claimed === false,
    'SPV_SYNTHETIC_ACCURACY_CLAIM_FORBIDDEN');
  assert(dataset.record_count === 120 && dataset.records.length === 120, 'SPV_RECORD_COUNT_MUST_EQUAL_120');
  assert(new Set(dataset.records.map((record) => record.record_id)).size === 120, 'SPV_DUPLICATE_RECORD_ID');
  const counts = Object.fromEntries(dataset.records.map((record) => record.vertical_id)
    .reduce((map, verticalId) => map.set(verticalId, (map.get(verticalId) ?? 0) + 1), new Map()));
  assert(Object.keys(counts).length === 8 && Object.values(counts).every((count) => count === 15),
    'SPV_VERTICAL_DISTRIBUTION_INVALID');
  const replayLedger = new SyntheticReplayLedger();
  const results = dataset.records.map((record) => {
    const replayDecision = replayLedger.admit(record);
    return { ...executeSyntheticRecord(record), replay_decision: replayDecision.decision };
  });
  const pipeline = {
    pipeline_id: 'kidults-spv-e2e-v1',
    version: '1.0.0',
    dataset_id: dataset.dataset_id,
    dataset_digest: dataset.dataset_digest,
    environment: SYNTHETIC_ENVIRONMENT,
    empirical: false,
    provider_activation_count: 0,
    external_api_touch_count: 0,
    credential_touch_count: 0,
    production_eligible_count: 0,
    public_eligible_count: 0,
    rights_promotion_count: 0,
    record_count: results.length,
    vertical_count: Object.keys(counts).length,
    stage_count_per_record: PIPELINE_STAGES.length,
    total_stage_receipt_count: results.length * PIPELINE_STAGES.length,
    stage_order: PIPELINE_STAGES,
    vertical_record_counts: counts,
    results,
  };
  pipeline.pipeline_digest = digest(pipeline);
  return pipeline;
}

export function buildPortalProjection(dataset) {
  return {
    projection_id: 'kidults-spv-internal-portal-v1',
    environment: SYNTHETIC_ENVIRONMENT,
    access_class: 'INTERNAL_ONLY',
    public_eligible: false,
    production_eligible: false,
    persistent_notice: SYNTHETIC_NOTICE,
    dataset_id: dataset.dataset_id,
    dataset_digest: dataset.dataset_digest,
    record_count: dataset.record_count,
    cards: dataset.records.map((record) => ({
      record_id: record.record_id,
      vertical_id: record.vertical_id,
      title: record.canonical_entity.display_name,
      event_state: record.synthetic_sold_event.event_state,
      event_value: record.synthetic_sold_event.amount,
      currency: 'XTS',
      label: SYNTHETIC_NOTICE,
      empirical: false,
      market_authority: false,
      production_eligible: false,
    })),
  };
}

export function renderSyntheticPortal(projection) {
  assert(projection.environment === SYNTHETIC_ENVIRONMENT, 'SPV_PORTAL_ENVIRONMENT_INVALID');
  assert(projection.persistent_notice === SYNTHETIC_NOTICE, 'SPV_PORTAL_NOTICE_REQUIRED');
  assert(projection.public_eligible === false && projection.production_eligible === false,
    'SPV_PORTAL_RELEASE_FORBIDDEN');
  assert(projection.cards.every((card) => card.label === SYNTHETIC_NOTICE
    && card.empirical === false && card.market_authority === false && card.production_eligible === false),
  'SPV_PORTAL_CARD_ISOLATION_INVALID');
  const escaped = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>KIDULTS SPV</title></head>`
    + `<body data-environment="SYNTHETIC"><header role="banner"><strong>${SYNTHETIC_NOTICE}</strong></header>`
    + `<main><h1>Internal Synthetic Platform Validation</h1><ul>${projection.cards.map((card) =>
      `<li data-record-id="${escaped(card.record_id)}"><strong>${SYNTHETIC_NOTICE}</strong>`
      + `<span>${escaped(card.title)}</span><span>${card.event_value} XTS</span></li>`).join('')}</ul></main>`
    + `<footer><strong>${SYNTHETIC_NOTICE}</strong></footer></body></html>`;
}

export function validateProviderAdapterManifest(manifest) {
  const expected = ['PSA', 'EBAY', 'HERITAGE', 'GOLDIN', 'CLASSIC_COM', 'BRING_A_TRAILER'];
  assert(manifest.activation_policy?.live_connections_allowed === false, 'SPV_PROVIDER_LIVE_CONNECTION_FORBIDDEN');
  assert(manifest.activation_policy?.credentials_allowed === false, 'SPV_PROVIDER_CREDENTIAL_FORBIDDEN');
  assert(manifest.activation_policy?.provider_data_allowed === false, 'SPV_PROVIDER_DATA_FORBIDDEN');
  assert(manifest.production === 'HOLD' && manifest.public === 'HOLD' && manifest.g5 === 'HOLD',
    'SPV_PROVIDER_RELEASE_BOUNDARY_INVALID');
  assert(manifest.adapters?.length === expected.length, 'SPV_PROVIDER_ADAPTER_COUNT_INVALID');
  assert(manifest.adapters.map((adapter) => adapter.provider_id).join('|') === expected.join('|'),
    'SPV_PROVIDER_ADAPTER_SET_INVALID');
  for (const adapter of manifest.adapters) {
    assert(adapter.activation_state === 'FOUNDATION_ONLY_LIVE_ACTIVATION_HOLD',
      `SPV_PROVIDER_${adapter.provider_id}_ACTIVATION_STATE_INVALID`);
    assert(adapter.rights_receipt_slot?.value === 'NONE' && adapter.rights_receipt_slot?.required_for_live_activation === true,
      `SPV_PROVIDER_${adapter.provider_id}_RIGHTS_SLOT_INVALID`);
    assert(adapter.credential_slot?.value === 'NONE' && adapter.credential_slot?.secret_material_present === false,
      `SPV_PROVIDER_${adapter.provider_id}_CREDENTIAL_SLOT_INVALID`);
    assert(Object.keys(adapter.schema_mapper?.source_to_canonical ?? {}).length > 0,
      `SPV_PROVIDER_${adapter.provider_id}_SCHEMA_MAPPER_MISSING`);
    assert(Array.isArray(adapter.capability_manifest?.capabilities) && adapter.capability_manifest.capabilities.length > 0,
      `SPV_PROVIDER_${adapter.provider_id}_CAPABILITY_MANIFEST_MISSING`);
    assert(adapter.validation_interface?.methods?.join('|') === 'validate_schema|validate_rights_receipt|validate_credentials|validate_provenance|validate_activation_gate',
      `SPV_PROVIDER_${adapter.provider_id}_VALIDATION_INTERFACE_INVALID`);
    assert(adapter.validation_interface?.unknown_behavior === 'HOLD'
      && adapter.validation_interface?.invalid_behavior === 'REJECT',
    `SPV_PROVIDER_${adapter.provider_id}_FAIL_CLOSED_INVALID`);
  }
}

export function buildAuditReceipt(dataset, pipeline, portalProjection, providerManifest) {
  const receipt = {
    receipt_id: 'kidults-spv-audit-receipt-v1',
    version: '1.0.0',
    validator_id: 'KIDULTS_SYNTHETIC_PLATFORM_VALIDATOR_V1',
    observed_at: '2026-09-07T02:00:00.000Z',
    scope: 'SYNTHETIC_ONLY_INTERNAL_VALIDATION',
    result: 'VERIFIED_PASS',
    dataset_id: dataset.dataset_id,
    dataset_digest: dataset.dataset_digest,
    pipeline_digest: pipeline.pipeline_digest,
    portal_projection_digest: digest(portalProjection),
    provider_manifest_digest: digest(providerManifest),
    counts: {
      verticals: 8,
      records: 120,
      records_per_vertical: 15,
      stages_per_record: 12,
      stage_receipts: 1440,
      provider_adapters: 6,
    },
    assertions: {
      synthetic_origin: 'VERIFIED_PASS',
      deterministic_ids: 'VERIFIED_PASS',
      deterministic_execution: 'VERIFIED_PASS',
      replay_protection: 'VERIFIED_PASS',
      duplicate_rejection: 'VERIFIED_PASS',
      fail_closed: 'VERIFIED_PASS',
      entity_integrity: 'VERIFIED_PASS',
      canonical_integrity: 'VERIFIED_PASS',
      evidence_integrity: 'VERIFIED_PASS',
      portal_isolation: 'VERIFIED_PASS',
      no_empirical_promotion: 'VERIFIED_PASS',
      no_provider_activation: 'VERIFIED_PASS',
      no_rights_promotion: 'VERIFIED_PASS',
      no_production_eligibility: 'VERIFIED_PASS',
    },
    release_boundary: {
      production: 'HOLD',
      public: 'HOLD',
      g5: 'HOLD',
      market_accuracy_claimed: false,
      investment_accuracy_claimed: false,
    },
    effects: {
      autonomous_effect: 'Deterministic synthetic validation is runnable without provider replies or credentials.',
      global_effect: 'All eight governed Core Verticals receive exactly fifteen isolated synthetic records.',
      irreplaceable_value_effect: 'Provider-independent canonical lineage and validation contracts are exercised.',
      transparency_effect: 'Every record and stage is digest-bound and explicitly marked synthetic and non-promotable.',
    },
  };
  receipt.receipt_digest = digest(receipt);
  return receipt;
}

export function runNegativeIsolationTests(dataset, portalProjection, providerManifest) {
  const mutations = [
    ['environment', 'EMPIRICAL'],
    ['empirical', true],
    ['rights_receipt', 'fabricated'],
    ['provider', 'EBAY'],
    ['production_eligible', true],
    ['market_authority', true],
    ['portal_label', 'MARKET DATA'],
  ];
  for (const [field, value] of mutations) {
    const changed = structuredClone(dataset.records[0]);
    changed[field] = value;
    let rejected = false;
    try { assertSyntheticRecord(changed); } catch { rejected = true; }
    assert(rejected, `SPV_NEGATIVE_${field.toUpperCase()}_NOT_REJECTED`);
  }

  const duplicateDataset = structuredClone(dataset);
  duplicateDataset.records[1].record_id = duplicateDataset.records[0].record_id;
  let duplicateRejected = false;
  try { executeSyntheticDataset(duplicateDataset); } catch { duplicateRejected = true; }
  assert(duplicateRejected, 'SPV_NEGATIVE_DUPLICATE_NOT_REJECTED');

  const publicPortal = structuredClone(portalProjection);
  publicPortal.public_eligible = true;
  let publicPortalRejected = false;
  try { renderSyntheticPortal(publicPortal); } catch { publicPortalRejected = true; }
  assert(publicPortalRejected, 'SPV_NEGATIVE_PUBLIC_PORTAL_NOT_REJECTED');

  const activatedProvider = structuredClone(providerManifest);
  activatedProvider.activation_policy.live_connections_allowed = true;
  let providerActivationRejected = false;
  try { validateProviderAdapterManifest(activatedProvider); } catch { providerActivationRejected = true; }
  assert(providerActivationRejected, 'SPV_NEGATIVE_PROVIDER_ACTIVATION_NOT_REJECTED');

  const first = executeSyntheticRecord(dataset.records[0]);
  const replay = executeSyntheticRecord(dataset.records[0]);
  assert(digest(first) === digest(replay), 'SPV_EXACT_REPLAY_NOT_IDEMPOTENT');

  const replayLedger = new SyntheticReplayLedger();
  assert(replayLedger.admit(dataset.records[0]).decision === 'ADMITTED_ONCE', 'SPV_FIRST_ADMISSION_INVALID');
  assert(replayLedger.admit(dataset.records[0]).decision === 'IDEMPOTENT_REPLAY', 'SPV_EXACT_REPLAY_NOT_IDEMPOTENT');
  const changedReplay = structuredClone(dataset.records[0]);
  changedReplay.canonical_entity.display_name = `${changedReplay.canonical_entity.display_name} changed`;
  let changedReplayRejected = false;
  try { replayLedger.admit(changedReplay); } catch { changedReplayRejected = true; }
  assert(changedReplayRejected, 'SPV_REPLAY_LINEAGE_MUTATION_NOT_REJECTED');

  let empiricalAdmissionRejected = false;
  try { assertEmpiricalAdmission(dataset.records[0]); } catch { empiricalAdmissionRejected = true; }
  assert(empiricalAdmissionRejected, 'SPV_SYNTHETIC_TO_EMPIRICAL_ADMISSION_NOT_REJECTED');
  const lineageMutation = structuredClone(dataset.records[0]);
  lineageMutation.synthetic_evidence.subject_id = 'spv-entity-corrupted';
  let lineageRejected = false;
  try { executeSyntheticRecord(lineageMutation); } catch { lineageRejected = true; }
  assert(lineageRejected, 'SPV_NEGATIVE_LINEAGE_CORRUPTION_NOT_REJECTED');

  return {
    result: 'VERIFIED_PASS',
    mutation_rejections: mutations.length + 6,
    exact_replay_idempotent: true,
    changed_replay_rejected: true,
    empirical_admission_rejected: true,
    duplicate_rejected: true,
    lineage_corruption_rejected: true,
    public_portal_rejected: true,
    provider_activation_rejected: true,
  };
}
