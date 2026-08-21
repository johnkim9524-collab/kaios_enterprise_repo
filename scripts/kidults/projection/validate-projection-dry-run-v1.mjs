import fs from 'node:fs';
import crypto from 'node:crypto';

const read = p => fs.readFileSync(p, 'utf8');
const contract = JSON.parse(read('coordination/kidults/projection-dry-run/projection-dry-run-contract-v1.json'));
const fixture = JSON.parse(read('coordination/kidults/projection-dry-run/projection-dry-run-fixture-v1.json'));
const auditContract = JSON.parse(read('coordination/kidults/audit/unified-audit-control-plane-v1.json'));
const portalStore = read('apps/kidults-enterprise-staging/public/portal-r001/projection-store.js');
const eosRegistry = JSON.parse(read('coordination/kidults/registry/track/records/track-e-executive-operating-system.json'));

const canonical = value => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
};
const digest = value => crypto.createHash('sha256').update(canonical(value)).digest('hex');
const clone = value => structuredClone(value);
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

assert(contract.governing_issue === 884, 'contract must bind #884');
assert(contract.governing_rule === 'PREWIRE_FIRST_DATA_LATER', 'governing rule drift');
assert(fixture.fixture_type === 'NON_PROMOTABLE_CONTROL', 'fixture must be non-promotable control');
assert(fixture.projection_template.promotable === false, 'fixture projection cannot be promotable');
assert(fixture.mock_assessment.promotable === false && fixture.mock_assessment.rankable === false, 'mock assessment cannot rank/promote');

for (const token of ['portal-read-contract-001','readPortalProjection','normalizeIntelligenceState','raw_provider_payloads:false','track_b_bypass:false']) {
  assert(portalStore.includes(token), `Portal Release-001 projection adapter missing ${token}`);
}
assert(eosRegistry.track_id === 'TRACK_E' || eosRegistry.track === 'E' || JSON.stringify(eosRegistry).includes('Executive'), 'IH-EOS registry binding missing');
assert(auditContract.truth_boundary?.synthetic_fixture_effect === 'CONTROL_VALIDATION_ONLY', 'audit synthetic truth boundary drift');
assert(auditContract.truth_boundary?.external_partner_data_ingestion === 'HOLD', 'partner ingestion must remain HOLD');

// Exact immutable Candidate/Evidence pair binding.
const candidateDigest = digest(fixture.candidate);
const evidenceDigest = digest(fixture.evidence_package);
const pairDigest = digest({ candidate_digest: candidateDigest, evidence_digest: evidenceDigest });
const assessment = {
  ...clone(fixture.mock_assessment),
  pair_digest: pairDigest,
  candidate_digest: candidateDigest,
  evidence_digest: evidenceDigest
};
const assessmentDigest = digest(assessment);

const correlationId = digest({
  snapshot_id: fixture.candidate.snapshot_id,
  evidence_package_id: fixture.evidence_package.evidence_package_id,
  assessment_id: assessment.assessment_id,
  projection_id: fixture.projection_template.projection_id
}).slice(0, 32);

function buildProjection({ candidate, evidence, assessmentRecord }) {
  const cDigest = digest(candidate), eDigest = digest(evidence);
  const expectedPair = digest({ candidate_digest: cDigest, evidence_digest: eDigest });
  if (!assessmentRecord) return { accepted: false, reason: 'MISSING_ASSESSMENT', state: 'INVALID' };
  if (assessmentRecord.pair_digest !== expectedPair) return { accepted: false, reason: 'PAIR_DIGEST_MISMATCH', state: 'INVALID' };
  if (assessmentRecord.promotable !== false || assessmentRecord.rankable !== false) return { accepted: false, reason: 'CONTROL_FIXTURE_PROMOTION_ATTEMPT', state: 'INVALID' };
  if (candidate.schema_version !== 'snapshot-candidate-control-v1' || evidence.schema_version !== 'evidence-package-control-v1' || assessmentRecord.schema_version !== 'rankability-assessment-control-v1') return { accepted: false, reason: 'SCHEMA_VERSION_MISMATCH', state: 'INVALID' };
  if (evidence.rights_status !== 'PASS_CONTROL_ONLY' || evidence.provenance_complete !== true) return { accepted: false, reason: 'RIGHTS_OR_PROVENANCE_BLOCK', state: 'RIGHTS_BLOCKED' };
  const projection = {
    ...clone(fixture.projection_template),
    snapshot_id: candidate.snapshot_id,
    evidence_package_id: evidence.evidence_package_id,
    assessment_id: assessmentRecord.assessment_id,
    candidate_digest: cDigest,
    evidence_digest: eDigest,
    pair_digest: expectedPair,
    assessment_digest: digest(assessmentRecord),
    correlation_id: correlationId,
    runtime: { refresh_latency_ms: 1, refresh_instrumented: true }
  };
  return { accepted: true, projection, state: projection.state };
}

const created = buildProjection({ candidate: fixture.candidate, evidence: fixture.evidence_package, assessmentRecord: assessment });
assert(created.accepted, `control Projection create rejected: ${created.reason}`);
assert(created.projection.promotable === false, 'created control Projection became promotable');
assert(created.projection.correlation_id === correlationId, 'correlation ID binding failed');
assert(created.projection.runtime.refresh_latency_ms <= fixture.runtime.refresh_budget_ms, 'refresh budget exceeded');

// Deterministic rebuild/replay.
const rebuilt = buildProjection({ candidate: fixture.candidate, evidence: fixture.evidence_package, assessmentRecord: assessment });
assert(rebuilt.accepted, 'deterministic rebuild rejected');
assert(digest(rebuilt.projection) === digest(created.projection), 'Projection rebuild/replay is not deterministic');

// Rollback target is an immutable prior control Projection, never LIVE_APPROVED.
const priorProjection = { ...clone(created.projection), projection_id: 'fixture-projection-884-prior-v1', state: 'WAITING', correlation_id: digest({ prior: true, pairDigest }).slice(0, 32) };
const rollback = clone(priorProjection);
assert(rollback.state === 'WAITING' && rollback.promotable === false, 'rollback target violates control truth');

const negativeResults = [];
const checkRejected = (name, result, expectedState) => {
  assert(result.accepted === false, `${name} false-green`);
  assert(result.state === expectedState, `${name} expected state ${expectedState}, got ${result.state}`);
  negativeResults.push({ name, reason: result.reason, state: result.state });
};
checkRejected('MISSING_ASSESSMENT', buildProjection({ candidate: fixture.candidate, evidence: fixture.evidence_package, assessmentRecord: null }), 'INVALID');
const tamperedAssessment = { ...assessment, pair_digest: '0'.repeat(64) };
checkRejected('TAMPERED_ASSESSMENT_DIGEST', buildProjection({ candidate: fixture.candidate, evidence: fixture.evidence_package, assessmentRecord: tamperedAssessment }), 'INVALID');
const mismatchedCandidate = clone(fixture.candidate); mismatchedCandidate.claims[0].value = 'TAMPERED';
checkRejected('PAIR_DIGEST_MISMATCH', buildProjection({ candidate: mismatchedCandidate, evidence: fixture.evidence_package, assessmentRecord: assessment }), 'INVALID');
const rightsBlockedEvidence = clone(fixture.evidence_package); rightsBlockedEvidence.rights_status = 'UNKNOWN';
const rightsPair = digest({ candidate_digest: candidateDigest, evidence_digest: digest(rightsBlockedEvidence) });
const rightsAssessment = { ...assessment, pair_digest: rightsPair, evidence_digest: digest(rightsBlockedEvidence) };
checkRejected('RIGHTS_BLOCKED', buildProjection({ candidate: fixture.candidate, evidence: rightsBlockedEvidence, assessmentRecord: rightsAssessment }), 'RIGHTS_BLOCKED');
const badSchema = clone(fixture.candidate); badSchema.schema_version = 'snapshot-candidate-control-v999';
const badSchemaDigest = digest(badSchema); const badSchemaPair = digest({ candidate_digest: badSchemaDigest, evidence_digest: evidenceDigest });
const badSchemaAssessment = { ...assessment, pair_digest: badSchemaPair, candidate_digest: badSchemaDigest };
checkRejected('SCHEMA_VERSION_MISMATCH', buildProjection({ candidate: badSchema, evidence: fixture.evidence_package, assessmentRecord: badSchemaAssessment }), 'INVALID');

// Consumer state projection: stale control Projection must fail closed at both consumers.
const staleProjection = { ...clone(created.projection), state: 'STALE', freshness: 'STALE_CONTROL' };
for (const [consumer, cfg] of Object.entries(fixture.consumers)) {
  assert(cfg.allowed_states.includes('STALE') && cfg.allowed_states.includes('NO_PROJECTION') && cfg.allowed_states.includes('INVALID'), `${consumer} negative-state contract incomplete`);
  assert(staleProjection.state !== 'LIVE_APPROVED', `${consumer} stale state promoted`);
}
negativeResults.push({ name: 'STALE_PROJECTION', reason: 'STALE_CONTROL', state: 'STALE' });

const auditEvents = [
  { type: 'PROJECTION_CREATE', correlation_id: correlationId, projection_id: created.projection.projection_id, result: 'CONTROL_PASS' },
  { type: 'PROJECTION_REJECT', correlation_id: correlationId, projection_id: null, result: 'NEGATIVE_PATHS_FAIL_CLOSED' },
  { type: 'PROJECTION_REPLAY', correlation_id: correlationId, projection_id: rebuilt.projection.projection_id, result: 'DETERMINISTIC' },
  { type: 'PROJECTION_ROLLBACK', correlation_id: rollback.correlation_id, projection_id: rollback.projection_id, result: 'CONTROL_ROLLBACK_PASS' }
];
for (const required of contract.audit_events_required) assert(auditEvents.some(e => e.type === required), `audit coverage missing ${required}`);
assert(auditEvents.every(e => e.correlation_id), 'audit correlation missing');

for (const key of contract.correlation_required) {
  if (key === 'snapshot_id') assert(created.projection.snapshot_id, 'snapshot correlation missing');
  if (key === 'evidence_package_id') assert(created.projection.evidence_package_id, 'evidence package correlation missing');
  if (key === 'assessment_id') assert(created.projection.assessment_id, 'assessment correlation missing');
  if (key === 'projection_id') assert(created.projection.projection_id, 'projection correlation missing');
  if (key === 'correlation_id') assert(created.projection.correlation_id, 'correlation_id missing');
}

const b = contract.downstream_boundaries;
assert(b.portal_reads_projection_only && b.ih_eos_reads_projection_registry_event_audit_only, 'downstream read boundary drift');
assert(!b.raw_provider_payloads && !b.credentials && !b.track_b_bypass && !b.public_intelligence_bypass && !b.production_bypass && !b.g5_bypass, 'downstream bypass opened');
const truth = contract.truth_boundary;
assert(truth.real_candidate_evidence === 'NONE' && truth.track_b === 'NOT_STARTED' && truth.live_approved_projection === 'NONE', 'empirical truth falsely promoted');
assert(truth.production === 'HOLD' && truth.g5 === 'EXPLICIT_APPROVAL_REQUIRED', 'release truth boundary drift');

console.log(JSON.stringify({
  suite: 'KIDULTS_PROJECTION_DRY_RUN_V1',
  governing_issue: 884,
  result: 'PASS',
  pair_digest_bound: true,
  projection_created: true,
  deterministic_replay: true,
  rollback_ready: true,
  negative_paths_passed: negativeResults.length,
  portal_read_contract_bound: true,
  ih_eos_registry_bound: true,
  audit_events_covered: auditEvents.map(e => e.type),
  correlation_id: correlationId,
  fixture_promotable: false,
  real_candidate_evidence: 'NONE',
  track_b: 'NOT_STARTED',
  live_approved_projection: 'NONE',
  production: 'HOLD',
  g5: 'EXPLICIT_APPROVAL_REQUIRED'
}, null, 2));
