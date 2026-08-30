#!/usr/bin/env node
/** Build one nonfixture, exact-pair-bound OBJECT_PASSPORT Projection. */

import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  admitProofProductProjectionWithVerifiedCapability,
} from '../portal/runtime/proof-product-admission.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const [
  candidateArgument,
  evidenceArgument,
  assessmentArgument,
  replayArgument,
  projectionArgument,
  admissionArgument,
  requestedObjectId = null,
] = process.argv.slice(2);
if (![candidateArgument, evidenceArgument, assessmentArgument, replayArgument, projectionArgument, admissionArgument].every(Boolean)) {
  throw new Error(
    'Usage: build-canonical-object-projection-v1.mjs <snapshot-candidate.json> <evidence-package.json> '
    + '<assessment-envelope.json> <staging-replay-receipt.json> <output-projection.json> '
    + '<output-admission-receipt.json> [canonical-object-id]',
  );
}

const stable = (value) => Array.isArray(value)
  ? value.map(stable)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
    : value;
const stableText = (value) => `${JSON.stringify(stable(value), null, 2)}\n`;
const digest = (value) => `sha256:${crypto.createHash('sha256')
  .update(JSON.stringify(stable(value))).digest('hex')}`;
const digestText = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const requireValue = (condition, code) => { if (!condition) throw new Error(code); };
const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;
const parseTime = (value, code) => {
  const parsed = Date.parse(value || '');
  requireValue(nonempty(value) && Number.isFinite(parsed), code);
  return parsed;
};
const relativeReference = (file) => path.relative(ROOT, file).replaceAll(path.sep, '/');

function resolveRepositoryPath(argument) {
  const resolved = path.resolve(ROOT, argument);
  requireValue(resolved === ROOT || resolved.startsWith(`${ROOT}${path.sep}`), 'PATH_ESCAPES_REPOSITORY');
  return resolved;
}

function objectIdentity(record) {
  for (const key of ['canonical_object_id', 'asset_identity_id']) {
    if (nonempty(record?.[key])) return record[key];
  }
  return null;
}

function verifiedField(fieldId, value, evidenceReferences, confidence = 'HIGH') {
  return {
    field_id: fieldId,
    state: 'VERIFIED',
    value,
    evidence_references: [...new Set(evidenceReferences)].sort(),
    rights_state: 'CLEARED',
    freshness_state: 'CURRENT',
    confidence_classification: confidence,
    limitations: [],
  };
}

function unavailableField(fieldId, reason, openingConditions) {
  return {
    field_id: fieldId,
    state: 'UNAVAILABLE',
    evidence_references: [],
    rights_state: 'UNKNOWN',
    freshness_state: 'UNKNOWN',
    confidence_classification: 'NOT_ASSESSED',
    reason,
    opening_conditions: openingConditions,
    limitations: ['MISSING_PRESERVED_NEVER_ZERO'],
  };
}

function optionalField(records, fieldId, keys, evidenceReferences) {
  const values = [...new Set(records.flatMap((record) => keys
    .map((key) => record?.[key])
    .filter((value) => value !== null && value !== undefined && value !== '')))]
    .sort((left, right) => String(left).localeCompare(String(right)));
  return values.length
    ? verifiedField(fieldId, values.length === 1 ? values[0] : values, evidenceReferences)
    : unavailableField(fieldId, `No rights-cleared ${fieldId} value exists in the exact pair.`, [`Admit a current ${fieldId} observation for this canonical object.`]);
}

const candidatePath = resolveRepositoryPath(candidateArgument);
const evidencePath = resolveRepositoryPath(evidenceArgument);
const assessmentPath = resolveRepositoryPath(assessmentArgument);
const replayPath = resolveRepositoryPath(replayArgument);
const projectionPath = resolveRepositoryPath(projectionArgument);
const admissionPath = resolveRepositoryPath(admissionArgument);
const [snapshot, evidence, envelope, replay] = await Promise.all(
  [candidatePath, evidencePath, assessmentPath, replayPath]
    .map((file) => fs.readFile(file, 'utf8').then(JSON.parse)),
);

const pairDigest = digest({ snapshot, evidence });
const correlationId = digestText(`kidults-live-chain-v1|${pairDigest}`);
requireValue(envelope.record_type === 'live_rankability_assessment_envelope' && envelope.version === '1.0.0', 'ASSESSMENT_ENVELOPE_INVALID');
requireValue(envelope.synthetic === false && envelope.promotable === true, 'ASSESSMENT_NON_PROMOTABLE');
requireValue(envelope.exact_pair_digest === pairDigest && envelope.correlation_id === correlationId, 'ASSESSMENT_PAIR_BINDING_MISMATCH');
const assessment = envelope.assessment || {};
requireValue(assessment.record_type === 'rankability_assessment' && assessment.assessment_status === 'COMPLETED', 'ASSESSMENT_BODY_INVALID');
requireValue(assessment.immutable === true && assessment.overall_rankability === true, 'ASSESSMENT_NOT_RANKABLE');
requireValue(['PUBLISHABLE_INTERNAL', 'PUBLISHABLE_PUBLIC'].includes(assessment.recommendation), 'ASSESSMENT_NOT_PASS');
requireValue(assessment.production_eligible === false && assessment.publication_eligible === false, 'ASSESSMENT_PREAUTH_FORBIDDEN');
const assessmentWithoutFingerprint = { ...assessment };
delete assessmentWithoutFingerprint.assessment_fingerprint;
requireValue(assessment.assessment_fingerprint === digest(assessmentWithoutFingerprint), 'ASSESSMENT_FINGERPRINT_INVALID');
requireValue(assessment.snapshot_id === snapshot.snapshot_id, 'ASSESSMENT_SNAPSHOT_ID_MISMATCH');
const evidencePackageId = evidence.package_id || evidence.evidence_package_id;
requireValue(assessment.evidence_package_id === evidencePackageId, 'ASSESSMENT_EVIDENCE_ID_MISMATCH');

const assessmentId = assessment.assessment_id || assessment.id;
requireValue(replay.record_type === 'kidults_internal_staging_replay_receipt' && replay.version === '1.0.0', 'REPLAY_RECEIPT_INVALID');
requireValue(replay.result === 'PASS' && replay.workload_result === 'PASS' && replay.projection_ready === true, 'REPLAY_NOT_PASS');
requireValue(replay.environment === 'STAGING' && replay.production_touch === false && replay.public_touch === false && replay.g5 === 'HOLD', 'REPLAY_BOUNDARY_VIOLATION');
requireValue(replay.synthetic === false && replay.promotable === true, 'REPLAY_NON_PROMOTABLE');
requireValue(replay.exact_pair_digest === pairDigest && replay.correlation_id === correlationId && replay.assessment_id === assessmentId, 'REPLAY_PAIR_BINDING_MISMATCH');
const replayWithoutFingerprint = { ...replay };
delete replayWithoutFingerprint.replay_fingerprint;
requireValue(replay.replay_fingerprint === digest(replayWithoutFingerprint), 'REPLAY_FINGERPRINT_INVALID');

const allRecords = Array.isArray(evidence.evidence_records) ? evidence.evidence_records : [];
const objectIds = [...new Set(allRecords.map(objectIdentity).filter(Boolean))].sort();
requireValue(objectIds.length > 0, 'CANONICAL_OBJECT_ID_MISSING');
let canonicalObjectId;
if (requestedObjectId) {
  requireValue(objectIds.includes(requestedObjectId), 'REQUESTED_CANONICAL_OBJECT_NOT_IN_PAIR');
  canonicalObjectId = requestedObjectId;
} else {
  requireValue(objectIds.length === 1, 'CANONICAL_OBJECT_SELECTION_REQUIRED');
  [canonicalObjectId] = objectIds;
}
requireValue(replay.canonical_object_id === canonicalObjectId, 'REPLAY_OBJECT_ID_MISMATCH');
const records = allRecords.filter((record) => objectIdentity(record) === canonicalObjectId);
requireValue(records.length > 0 && records.every((record) => record.rights_state === 'ALLOW'), 'OBJECT_EVIDENCE_RIGHTS_NOT_ALLOW');
const soldRecords = records.filter((record) => record.temporality === 'CURRENT_MARKET'
  && record.market_observation_type === 'SOLD_TRANSACTION');
requireValue(soldRecords.length > 0, 'OBJECT_CURRENT_SOLD_EVIDENCE_MISSING');
const evidenceReferences = [...new Set(records.map((record) => record.evidence_id).filter(nonempty))].sort();
requireValue(evidenceReferences.length === records.length, 'OBJECT_EVIDENCE_ID_MISSING_OR_DUPLICATE');

const observedTimes = records.map((record) => parseTime(record.observed_at, 'EVIDENCE_OBSERVED_AT_INVALID'));
const validUntilTimes = records.map((record) => parseTime(record.valid_until, 'EVIDENCE_VALID_UNTIL_INVALID'));
const observedAtMs = Math.max(...observedTimes);
const validUntilMs = Math.min(...validUntilTimes);
const snapshotAsOfMs = parseTime(snapshot.as_of, 'SNAPSHOT_AS_OF_INVALID');
requireValue(observedAtMs <= snapshotAsOfMs && snapshotAsOfMs < validUntilMs, 'PROJECTION_EVIDENCE_NOT_CURRENT_AT_SNAPSHOT');
const generatedAtMs = process.env.KIDULTS_PROJECTION_GENERATED_AT
  ? parseTime(process.env.KIDULTS_PROJECTION_GENERATED_AT, 'PROJECTION_GENERATED_AT_INVALID')
  : snapshotAsOfMs;
requireValue(observedAtMs <= generatedAtMs && generatedAtMs < validUntilMs, 'PROJECTION_GENERATION_OUTSIDE_FRESHNESS_WINDOW');
const generatedAt = new Date(generatedAtMs).toISOString();
const observedAt = new Date(observedAtMs).toISOString();
const validUntil = new Date(validUntilMs).toISOString();

const confidences = records.map((record) => Number(record.evidence_strength));
requireValue(confidences.every((value) => Number.isFinite(value) && value > 0 && value <= 1), 'EVIDENCE_CONFIDENCE_INVALID');
const confidenceValue = Math.min(...confidences);
const confidenceClassification = confidenceValue >= 0.85 ? 'HIGH' : confidenceValue >= 0.6 ? 'MEDIUM' : 'LOW';
const sourceOwners = [...new Set(records.map((record) => record.source_owner_id).filter(nonempty))].sort();
const factualOrigins = [...new Set(records.map((record) => record.factual_origin_id).filter(nonempty))].sort();
requireValue(sourceOwners.length > 0 && factualOrigins.length > 0, 'SOURCE_INDEPENDENCE_IDENTITIES_MISSING');
const rightsAssertions = records.map((record) => record.rights_assertion).filter(Boolean);
requireValue(rightsAssertions.length === records.length, 'RIGHTS_ASSERTION_MISSING');
requireValue(rightsAssertions.every((assertion) => Array.isArray(assertion.rights_atoms)
  && ['COLLECT', 'DERIVE', 'DISPLAY', 'STORE'].every((atom) => assertion.rights_atoms.includes(atom))), 'RIGHTS_ATOMS_INCOMPLETE');
const rightsProfileId = `rights-${digest(rightsAssertions).split(':')[1].slice(0, 24)}`;

const transactionValues = soldRecords.map((record) => ({
  evidence_id: record.evidence_id,
  transaction_occurred_at: record.transaction_occurred_at,
  sold_price: record.sold_price,
  grade_or_condition: record.grade_or_condition,
  market_venue_id: record.market_venue_id,
}));
const liquidityRecords = records.filter((record) => record.market_observation_type === 'LIQUIDITY_EXPOSURE');
const liquidityValues = liquidityRecords.map((record) => ({
  evidence_id: record.evidence_id,
  exposure_started_at: record.exposure_started_at,
  exposure_ended_at: record.exposure_ended_at ?? null,
  exposure_days: record.exposure_days,
  censoring_state: record.censoring_state,
}));
const comparableValues = transactionValues.length >= 2 ? transactionValues : null;
const fields = {
  identity: verifiedField('identity', { canonical_object_id: canonicalObjectId }, evidenceReferences, confidenceClassification),
  maker: optionalField(records, 'maker', ['maker', 'manufacturer', 'brand'], evidenceReferences),
  model: optionalField(records, 'model', ['model'], evidenceReferences),
  variant: optionalField(records, 'variant', ['variant', 'edition'], evidenceReferences),
  year: optionalField(records, 'year', ['year', 'model_year'], evidenceReferences),
  provenance: optionalField(records, 'provenance', ['provenance_refs'], evidenceReferences),
  specification: optionalField(records, 'specification', ['specification'], evidenceReferences),
  condition: optionalField(records, 'condition', ['grade_or_condition', 'condition_segment'], evidenceReferences),
  market_observations: verifiedField('market_observations', transactionValues, soldRecords.map((record) => record.evidence_id), confidenceClassification),
  comparables: comparableValues
    ? verifiedField('comparables', comparableValues, soldRecords.map((record) => record.evidence_id), confidenceClassification)
    : unavailableField('comparables', 'Fewer than two admitted sold observations exist for this object.', ['Admit an independently sourced comparable sold observation.']),
  liquidity: liquidityValues.length
    ? verifiedField('liquidity', liquidityValues, liquidityRecords.map((record) => record.evidence_id), confidenceClassification)
    : unavailableField('liquidity', 'No rights-cleared exposure denominator exists in the exact pair.', ['Admit a governed liquidity exposure record.']),
  scarcity: unavailableField('scarcity', 'The exact pair does not establish scarcity.', ['Admit bounded universe and supply evidence.']),
  cultural_significance: unavailableField('cultural_significance', 'The exact pair does not establish cultural significance.', ['Admit rights-cleared cultural evidence.']),
  risks: verifiedField('risks', assessment.residual_risks || [], evidenceReferences, confidenceClassification),
  evidence: verifiedField('evidence', evidenceReferences, evidenceReferences, confidenceClassification),
  rights: verifiedField('rights', { profile_id: rightsProfileId, decisions: ['INTERNAL_ANALYSIS', 'STAGING_PORTAL_DISPLAY'] }, evidenceReferences, confidenceClassification),
  audit_history: verifiedField('audit_history', { assessment_id: assessmentId, replay_id: replay.replay_id, exact_pair_digest: pairDigest }, evidenceReferences, confidenceClassification),
};

const projectionSeed = {
  pair_digest: pairDigest,
  assessment_id: assessmentId,
  replay_id: replay.replay_id,
  canonical_object_id: canonicalObjectId,
  producer_version: 'canonical-object-projection-v1',
};
const projectionId = `projection-object-${digest(projectionSeed).split(':')[1].slice(0, 32)}`;
const currencies = [...new Set(soldRecords.map((record) => record.sold_price?.currency).filter(nonempty))].sort();
const venues = [...new Set(soldRecords.map((record) => record.market_venue_id).filter(nonempty))].sort();
const geographies = [...new Set(records.flatMap((record) => [
  record.jurisdiction,
  record.rights_assertion?.jurisdiction,
]).filter(nonempty))].sort();
const verticals = [...new Set(records.flatMap((record) => [record.vertical_id, record.category_id]).filter(nonempty))].sort();

const projection = {
  record_type: 'kidults_proof_product_projection',
  contract_version: '1.0.0',
  projection_id: projectionId,
  product_type: 'OBJECT_PASSPORT',
  projection_state: 'APPROVED_INTERNAL',
  display_eligibility: 'INTERNAL_ONLY',
  scope: {
    verticals: verticals.length ? verticals : ['OBJECT_PASSPORT'],
    period: {
      start: new Date(Math.min(...soldRecords.map((record) => parseTime(record.transaction_occurred_at, 'TRANSACTION_TIME_INVALID')))).toISOString(),
      end: observedAt,
    },
    geographies: geographies.length ? geographies : ['GLOBAL'],
    venues,
    currencies,
  },
  method_version: 'canonical-object-projection-v1',
  lineage: {
    snapshot_id: snapshot.snapshot_id,
    evidence_package_id: evidencePackageId,
    assessment_id: assessmentId,
    previous_projection_id: null,
  },
  evidence_summary: {
    state: 'PAIRED',
    source_count: sourceOwners.length,
    independent_source_family_count: factualOrigins.length,
    evidence_references: evidenceReferences,
  },
  rights: {
    state: 'PARTIAL',
    internal_analysis: 'ALLOWED',
    public_display: 'ALLOWED',
    api_redistribution: 'UNKNOWN',
    profile_id: rightsProfileId,
  },
  freshness: {
    state: 'CURRENT',
    observed_at: observedAt,
    valid_until: validUntil,
  },
  confidence: {
    state: 'ASSESSED',
    classification: confidenceClassification,
    value: confidenceValue,
    method_version: 'track-b-minimum-admitted-evidence-v1',
  },
  rankability: {
    state: 'RANKABLE',
    assessment_id: assessmentId,
    reasons: ['OFFICIAL_TRACK_B_PUBLISHABLE_INTERNAL', 'EXACT_PAIR_AND_REPLAY_BOUND'],
  },
  limitations: [
    ...(assessment.residual_risks || []),
    'INTERNAL_STAGING_ONLY',
    'PUBLIC_PRODUCTION_G5_HOLD',
  ],
  missing_data: Object.values(fields)
    .filter((field) => field.state === 'UNAVAILABLE')
    .map((field) => ({
      field_id: field.field_id,
      reason: field.reason,
      opening_conditions: field.opening_conditions,
      treatment: 'PRESERVE_MISSING_NEVER_ZERO',
    })),
  actions: [
    { action_id: 'VIEW_GOVERNANCE', state: 'ENABLED', destination: `/governance/projections/${encodeURIComponent(projectionId)}`, reason: '' },
    { action_id: 'OPEN_PROVENANCE', state: 'ENABLED', destination: `/portal/objects?id=${encodeURIComponent(canonicalObjectId)}#evidence`, reason: '' },
    { action_id: 'COMPARE', state: 'ENABLED', destination: `/portal/compare?object=${encodeURIComponent(canonicalObjectId)}`, reason: '' },
    { action_id: 'WATCHLIST', state: 'ENABLED', destination: `/portal/watchlist?object=${encodeURIComponent(canonicalObjectId)}`, reason: '' },
  ],
  audit: {
    governance_record_uri: `/governance/assessments/${encodeURIComponent(assessmentId)}`,
    projection_record_uri: `/governance/projections/${encodeURIComponent(projectionId)}`,
    events: [
      { event_id: `track-b-${assessmentId}`, event_type: 'OFFICIAL_TRACK_B_ASSESSMENT_BOUND', occurred_at: generatedAt },
      { event_id: replay.replay_id, event_type: 'STAGING_REPLAY_BOUND', occurred_at: generatedAt },
      { event_id: `projection-${projectionId}`, event_type: 'APPROVED_INTERNAL_PROJECTION_CREATED', occurred_at: generatedAt },
    ],
  },
  payload: {
    canonical_object_id: canonicalObjectId,
    fields,
  },
  generated_at: generatedAt,
  updated_at: generatedAt,
};

const admission = admitProofProductProjectionWithVerifiedCapability(projection, {
  surface: 'PORTAL_RENDER',
  trustedNow: new Date(generatedAt),
  clockAuthority: 'KIDULTS_CONTROL_PLANE',
  releaseAuthority: 'SIGNED_SERVER_CAPABILITY',
  capabilityVerified: true,
  capabilityId: `producer-${projectionId}`,
  capabilityDigest: digest(projectionSeed),
});
requireValue(admission.accepted === true && admission.receipt.payload_exposed === true, `PROJECTION_SCHEMA_OR_SEMANTICS_REJECTED:${admission.receipt.reason}`);

const projectionText = stableText(projection);
const projectionFileSha256 = digestText(projectionText);
const admissionReceipt = {
  record_type: 'kidults_canonical_projection_admission_receipt',
  version: '1.0.0',
  result: 'PASS',
  projection_id: projectionId,
  product_type: 'OBJECT_PASSPORT',
  projection_state: 'APPROVED_INTERNAL',
  projection_path: relativeReference(projectionPath),
  projection_file_sha256: projectionFileSha256,
  exact_pair_digest: pairDigest,
  correlation_id: correlationId,
  snapshot_id: snapshot.snapshot_id,
  evidence_package_id: evidencePackageId,
  assessment_id: assessmentId,
  replay_id: replay.replay_id,
  canonical_object_id: canonicalObjectId,
  evidence_references: evidenceReferences,
  enabled_actions: projection.actions.filter((action) => action.state === 'ENABLED').map((action) => action.action_id),
  schema_and_semantics_admitted: true,
  synthetic: false,
  fixture: false,
  promotable: true,
  production: false,
  public: false,
  g5: 'HOLD',
  release_boundary: 'GOVERNED_INTERNAL_STAGING_ONLY',
  autonomous_effect: 'A genuine exact pair can progress deterministically through Track B, replay, and Projection production.',
  global_effect: 'Projection production is canonical-object and source neutral; empirical global coverage remains evidence bounded.',
  irreplaceable_value_effect: 'Canonical identity, lineage, evidence and actions remain KIDULTS-owned.',
  transparency_effect: 'The receipt binds every product output to pair, assessment, replay, evidence, rights and freshness.',
};
admissionReceipt.admission_fingerprint = digest(admissionReceipt);

await fs.mkdir(path.dirname(projectionPath), { recursive: true });
await fs.mkdir(path.dirname(admissionPath), { recursive: true });
await fs.writeFile(projectionPath, projectionText, { flag: 'wx' });
await fs.writeFile(admissionPath, stableText(admissionReceipt), { flag: 'wx' });
console.log(JSON.stringify({
  suite: 'KIDULTS_CANONICAL_OBJECT_PROJECTION_PRODUCER_V1',
  result: 'PASS',
  projection_id: projectionId,
  canonical_object_id: canonicalObjectId,
  evidence_reference_count: evidenceReferences.length,
  enabled_actions: admissionReceipt.enabled_actions,
  public: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
}, null, 2));
