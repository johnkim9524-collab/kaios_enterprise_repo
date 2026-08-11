import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const DEFAULT_POLICY = path.join(ROOT, 'config', 'kidult100-scarcity-evidence-promotion.json');
const DEFAULT_VERIFICATION = path.join(ROOT, 'reports', 'kidult100-ranking', 'kidult100-scarcity-independent-verification-latest.json');
const DEFAULT_ATTESTATION = path.join(ROOT, 'reports', 'kidult100-ranking', 'kidult100-scarcity-source-attestation-intake-latest.json');
const DEFAULT_OUT = path.join(ROOT, 'reports', 'kidult100-ranking', 'kidult100-scarcity-evidence-promotion-latest.json');

function readJsonInput(value, fallbackPath) {
  const raw = value == null || String(value).trim() === '' ? fallbackPath : String(value).trim();
  if (raw.startsWith('{') || raw.startsWith('[')) return JSON.parse(raw);
  const resolved = path.isAbsolute(raw) ? raw : path.join(ROOT, raw);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) throw new Error(`Missing JSON input: ${resolved}`);
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

function isSha256(value) {
  return /^sha256:[a-f0-9]{64}$/i.test(String(value || ''));
}

function digest(value) {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

const policy = readJsonInput(process.env.KIDULTS_SCARCITY_EVIDENCE_PROMOTION_POLICY_JSON, DEFAULT_POLICY);
const verification = readJsonInput(process.env.KIDULTS_SCARCITY_INDEPENDENT_VERIFICATION_JSON, DEFAULT_VERIFICATION);
const attestation = readJsonInput(process.env.KIDULTS_SCARCITY_SOURCE_ATTESTATION_INTAKE_JSON, DEFAULT_ATTESTATION);
const outputRaw = process.env.KIDULTS_SCARCITY_EVIDENCE_PROMOTION_OUTPUT || DEFAULT_OUT;
const outputPath = path.isAbsolute(outputRaw) ? outputRaw : path.join(ROOT, outputRaw);

if (policy?.policy !== 'FAIL_CLOSED_SCARCITY_EVIDENCE_PROMOTION') throw new Error('Invalid scarcity evidence promotion policy');
if (verification?.mode !== policy.requiredInputMode) throw new Error(`Invalid scarcity verification input mode: ${verification?.mode || 'missing'}`);
if (attestation?.mode !== 'KIDULT100_SCARCITY_SOURCE_ATTESTATION_INTAKE') throw new Error(`Invalid scarcity attestation input mode: ${attestation?.mode || 'missing'}`);
if (policy.requiredVerificationStatus !== 'INDEPENDENTLY_VERIFIED_PROMOTION_READY') throw new Error('Invalid scarcity promotion verification status contract');
if (policy.requiredSignalType !== 'TOTAL_PRODUCED' || policy.requiredUnit !== 'UNITS') throw new Error('Scarcity evidence promotion must require TOTAL_PRODUCED in UNITS');
for (const [key, value] of Object.entries(policy.rules || {})) if (value !== true) throw new Error(`Unsafe scarcity evidence promotion rule: ${key}`);
if (policy?.promotionBoundary?.outputMode !== 'KIDULT100_SCARCITY_PROMOTION_ENVELOPE'
  || policy?.promotionBoundary?.envelopeStatus !== 'PROMOTION_ENVELOPE_READY_NOT_MATERIALIZED'
  || policy?.promotionBoundary?.materializedRightDataEvidence !== 0
  || policy?.promotionBoundary?.qualifiedProductionScores !== 0) {
  throw new Error('Unsafe scarcity evidence promotion boundary');
}

const verified = Array.isArray(verification.verifiedAttestations) ? verification.verifiedAttestations : [];
const rejectedVerifications = Array.isArray(verification.rejectedVerifications) ? verification.rejectedVerifications : [];
const expectedVerificationDigest = digest({ verified, rejected: rejectedVerifications });
if (!isSha256(verification.verificationDigest) || verification.verificationDigest !== expectedVerificationDigest) throw new Error('Scarcity verification digest mismatch');
if (Number(verification?.metrics?.promotedRightDataEvidence || 0) !== 0) throw new Error('Upstream verification already mutated Right Data');

const primaryAccepted = Array.isArray(attestation.acceptedAttestations) ? attestation.acceptedAttestations : [];
const primaryRejected = Array.isArray(attestation.rejectedAttestations) ? attestation.rejectedAttestations : [];
const expectedIntakeDigest = digest({ accepted: primaryAccepted, rejected: primaryRejected });
if (!isSha256(attestation.intakeDigest) || attestation.intakeDigest !== expectedIntakeDigest) throw new Error('Scarcity attestation digest mismatch');
const primaryByCandidate = new Map(primaryAccepted.map((row) => [row.candidateKey, row]));

const envelopes = [];
const rejected = [];
const seen = new Set();
for (const row of verified) {
  const reasons = [];
  const primary = primaryByCandidate.get(row?.candidateKey);
  if (!row?.candidateKey || !row?.canonicalTitle || !row?.vertical) reasons.push('MISSING_CANDIDATE_IDENTITY');
  if (seen.has(row?.candidateKey)) reasons.push('DUPLICATE_PROMOTION_CANDIDATE');
  if (!primary) reasons.push('NO_MATCHING_PRIMARY_ATTESTATION');
  if (row?.verificationStatus !== policy.requiredVerificationStatus) reasons.push('INVALID_VERIFICATION_STATUS');
  if (row?.promotionBoundary !== 'NOT_YET_WRITTEN_TO_RIGHT_DATA') reasons.push('UPSTREAM_PROMOTION_BOUNDARY_VIOLATION');
  if (row?.signalType !== policy.requiredSignalType) reasons.push('INVALID_SIGNAL_TYPE');
  if (String(row?.unit || '').toUpperCase() !== policy.requiredUnit) reasons.push('INVALID_QUANTITY_UNIT');
  if (!Number.isSafeInteger(row?.verifiedQuantity) || row.verifiedQuantity <= 0) reasons.push('INVALID_VERIFIED_QUANTITY');
  if (!isSha256(row?.primaryPayloadHash)) reasons.push('INVALID_PRIMARY_PAYLOAD_HASH');
  if (!isSha256(row?.verificationPayloadHash)) reasons.push('INVALID_VERIFICATION_PAYLOAD_HASH');
  if (primary && row.primaryPayloadHash !== primary.payloadHash) reasons.push('PRIMARY_HASH_CHAIN_MISMATCH');
  if (primary && row.verifiedQuantity !== primary.quantity) reasons.push('PRIMARY_QUANTITY_CHAIN_MISMATCH');
  if (primary && (row.canonicalTitle !== primary.canonicalTitle || row.vertical !== primary.vertical)) reasons.push('PRIMARY_IDENTITY_CHAIN_MISMATCH');

  const normalized = {
    candidateKey: row?.candidateKey || null,
    canonicalTitle: row?.canonicalTitle || null,
    vertical: row?.vertical || null,
    signalType: row?.signalType || null,
    quantity: row?.verifiedQuantity ?? null,
    unit: row?.unit || null,
    primaryPayloadHash: row?.primaryPayloadHash || null,
    verificationPayloadHash: row?.verificationPayloadHash || null,
  };

  if (reasons.length === 0) {
    envelopes.push({
      ...normalized,
      primaryProvenance: {
        sourceTier: primary.sourceTier || null,
        sourceUrl: primary.sourceUrl || null,
        rightsClass: primary.rightsClass || null,
        rightsUrl: primary.rightsUrl || null,
        automatedAccessUrl: primary.automatedAccessUrl || null,
        observedAt: primary.observedAt || null,
      },
      independentVerification: {
        sourceUrl: row.verificationSourceUrl || null,
        rightsUrl: row.verificationRightsUrl || null,
        automatedAccessUrl: row.verificationAccessUrl || null,
        verifiedAt: row.verifiedAt || null,
      },
      chainDigests: {
        attestationIntakeDigest: attestation.intakeDigest,
        independentVerificationDigest: verification.verificationDigest,
      },
      promotionStatus: policy.promotionBoundary.envelopeStatus,
      materializedRightDataEvidence: false,
      productionScoreActivated: false,
    });
    seen.add(row.candidateKey);
  } else {
    rejected.push({ ...normalized, promotionStatus: 'FAIL_CLOSED_REJECTED', reasons: [...new Set(reasons)] });
  }
}

const promotionDigest = digest({ envelopes, rejected });
const disposition = rejected.length > 0
  ? 'FAIL_CLOSED_PROMOTION_REJECTIONS_PRESENT'
  : envelopes.length > 0
    ? 'PROMOTION_ENVELOPES_READY_EXPLICIT_RIGHT_DATA_MATERIALIZATION_REQUIRED'
    : 'NO_INDEPENDENTLY_VERIFIED_RECORDS_TO_PROMOTE';

const report = {
  schemaVersion: '1.0.0',
  mode: policy.promotionBoundary.outputMode,
  generatedAt: new Date().toISOString(),
  policy: policy.policy,
  metrics: {
    independentlyVerifiedInput: verified.length,
    promotionReadyEnvelopes: envelopes.length,
    rejectedPromotionRecords: rejected.length,
    materializedRightDataEvidence: 0,
    qualifiedProductionScores: 0,
  },
  boundary: {
    promotionEnvelopeIsNotRightDataMutation: true,
    explicitRightDataMaterializationStillRequired: true,
    automaticEvidenceQualificationAllowed: false,
    productionScoringActivated: false,
  },
  safety: {
    syntheticOrEstimatedQuantityCreated: false,
    searchOrDiscoveryAcceptedAsEvidence: false,
    unauthorizedScrapingRequested: false,
    paidProviderProcurementRequested: false,
    contractExecutionRequested: false,
  },
  disposition,
  promotionDigest,
  promotionEnvelopes: envelopes,
  rejectedPromotionRecords: rejected,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
console.log(`Scarcity evidence promotion: verified=${verified.length} ready=${envelopes.length} rejected=${rejected.length} materialized=0`);
console.log(`disposition=${disposition}`);
if (rejected.length > 0) process.exitCode = 1;
