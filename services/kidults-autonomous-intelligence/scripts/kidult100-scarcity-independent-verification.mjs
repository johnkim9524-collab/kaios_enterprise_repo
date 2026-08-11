import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const DEFAULT_POLICY = path.join(ROOT, 'config', 'kidult100-scarcity-independent-verification.json');
const DEFAULT_INPUT = path.join(ROOT, 'reports', 'kidult100-ranking', 'kidult100-scarcity-source-attestation-intake-latest.json');
const DEFAULT_OUT = path.join(ROOT, 'reports', 'kidult100-ranking', 'kidult100-scarcity-independent-verification-latest.json');

function readJsonInput(value, fallbackPath) {
  const raw = value == null || String(value).trim() === '' ? fallbackPath : String(value).trim();
  if (raw.startsWith('{') || raw.startsWith('[')) return JSON.parse(raw);
  const resolved = path.isAbsolute(raw) ? raw : path.join(ROOT, raw);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) throw new Error(`Missing JSON input: ${resolved}`);
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

function httpsUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

function sha256(value) {
  return /^sha256:[a-f0-9]{64}$/i.test(String(value || ''));
}

const policy = readJsonInput(process.env.KIDULTS_SCARCITY_INDEPENDENT_VERIFICATION_JSON, DEFAULT_POLICY);
const input = readJsonInput(process.env.KIDULTS_SCARCITY_SOURCE_ATTESTATION_INTAKE_JSON, DEFAULT_INPUT);
const outputRaw = process.env.KIDULTS_SCARCITY_INDEPENDENT_VERIFICATION_OUTPUT || DEFAULT_OUT;
const outputPath = path.isAbsolute(outputRaw) ? outputRaw : path.join(ROOT, outputRaw);

if (policy?.policy !== 'FAIL_CLOSED_SCARCITY_INDEPENDENT_VERIFICATION') throw new Error('Invalid scarcity independent verification policy');
if (input?.mode !== policy.requiredInputMode) throw new Error(`Invalid scarcity attestation intake mode: ${input?.mode || 'missing'}`);
if (policy?.requiredSignalType !== 'TOTAL_PRODUCED') throw new Error('Scarcity independent verification must require TOTAL_PRODUCED');
if (!Array.isArray(policy.requiredVerificationFields) || policy.requiredVerificationFields.length === 0) throw new Error('Scarcity independent verification requires verification fields');
for (const [key, value] of Object.entries(policy.rules || {})) {
  if (value !== true) throw new Error(`Unsafe scarcity independent verification rule: ${key}`);
}

const accepted = new Map((input.acceptedAttestations || []).map((row) => [row.candidateKey, row]));
const verifications = Array.isArray(policy.verifications) ? policy.verifications : [];
const verified = [];
const rejected = [];
const seen = new Set();

for (const record of verifications) {
  const reasons = [];
  for (const field of policy.requiredVerificationFields) {
    if (record?.[field] == null || record[field] === '') reasons.push(`MISSING_${field.toUpperCase()}`);
  }

  const primary = accepted.get(record?.candidateKey);
  if (!primary) reasons.push('NO_ACCEPTED_PRIMARY_ATTESTATION');
  if (seen.has(record?.candidateKey)) reasons.push('DUPLICATE_CANDIDATE_VERIFICATION');
  if (record?.signalType !== 'TOTAL_PRODUCED') reasons.push('INVALID_SIGNAL_TYPE');
  if (!sha256(record?.primaryPayloadHash) || (primary && record.primaryPayloadHash !== primary.payloadHash)) reasons.push('PRIMARY_PAYLOAD_HASH_MISMATCH');
  if (!sha256(record?.verificationPayloadHash)) reasons.push('INVALID_VERIFICATION_PAYLOAD_HASH');

  const sourceUrl = httpsUrl(record?.verificationSourceUrl);
  const rightsUrl = httpsUrl(record?.verificationRightsUrl);
  const accessUrl = httpsUrl(record?.verificationAccessUrl);
  if (!sourceUrl) reasons.push('VERIFICATION_SOURCE_URL_NOT_HTTPS');
  if (!rightsUrl) reasons.push('VERIFICATION_RIGHTS_URL_NOT_HTTPS');
  if (!accessUrl) reasons.push('VERIFICATION_ACCESS_URL_NOT_HTTPS');
  if (sourceUrl && primary) {
    const primaryUrl = httpsUrl(primary.sourceUrl);
    if (!primaryUrl || sourceUrl.hostname === primaryUrl.hostname) reasons.push('INDEPENDENT_SOURCE_NOT_DISTINCT');
  }

  if (record?.exactEntityMatch !== true) reasons.push('EXACT_ENTITY_MATCH_NOT_VERIFIED');
  if (record?.commercialReuseAllowed !== true) reasons.push('COMMERCIAL_REUSE_NOT_VERIFIED');
  if (record?.automatedAccessDocumented !== true) reasons.push('AUTOMATED_ACCESS_NOT_VERIFIED');
  if (record?.quantityMatchesPrimary !== true) reasons.push('QUANTITY_MATCH_NOT_VERIFIED');
  if (!Number.isSafeInteger(record?.verifiedQuantity) || record.verifiedQuantity <= 0) reasons.push('VERIFIED_QUANTITY_NOT_POSITIVE_INTEGER');
  if (primary && record?.verifiedQuantity !== primary.quantity) reasons.push('VERIFIED_QUANTITY_DIFFERS_FROM_PRIMARY');
  if (String(record?.unit || '').toUpperCase() !== 'UNITS') reasons.push('INVALID_QUANTITY_UNIT');
  if (record?.synthetic === true || record?.estimated === true || record?.inferred === true) reasons.push('SYNTHETIC_ESTIMATED_OR_INFERRED_FORBIDDEN');
  if (!record?.verifiedAt || Number.isNaN(Date.parse(record.verifiedAt))) reasons.push('INVALID_VERIFIED_AT');

  const normalized = {
    candidateKey: record?.candidateKey || null,
    canonicalTitle: primary?.canonicalTitle || null,
    vertical: primary?.vertical || null,
    signalType: record?.signalType || null,
    verifiedQuantity: record?.verifiedQuantity ?? null,
    unit: record?.unit || null,
    primaryPayloadHash: record?.primaryPayloadHash || null,
    verificationPayloadHash: record?.verificationPayloadHash || null,
    verificationSourceUrl: record?.verificationSourceUrl || null,
    verificationRightsUrl: record?.verificationRightsUrl || null,
    verificationAccessUrl: record?.verificationAccessUrl || null,
    verifiedAt: record?.verifiedAt || null,
  };

  if (reasons.length === 0) {
    verified.push({
      ...normalized,
      verificationStatus: 'INDEPENDENTLY_VERIFIED_PROMOTION_READY',
      promotionBoundary: 'NOT_YET_WRITTEN_TO_RIGHT_DATA',
    });
    seen.add(record.candidateKey);
  } else {
    rejected.push({ ...normalized, verificationStatus: 'FAIL_CLOSED_REJECTED', reasons: [...new Set(reasons)] });
  }
}

const pendingPrimary = [...accepted.values()].filter((row) => !seen.has(row.candidateKey));
const verificationDigest = crypto.createHash('sha256').update(JSON.stringify({ verified, rejected })).digest('hex');
const disposition = rejected.length > 0
  ? 'FAIL_CLOSED_VERIFICATION_REJECTIONS_PRESENT'
  : verified.length > 0
    ? 'INDEPENDENT_VERIFICATION_COMPLETE_PROMOTION_GATE_REQUIRED'
    : accepted.size > 0
      ? 'NO_VERIFICATIONS_SUBMITTED_ATTESTATIONS_REMAIN_PENDING'
      : 'NO_ACCEPTED_ATTESTATIONS_TO_VERIFY';

const report = {
  schemaVersion: '1.0.0',
  mode: 'KIDULT100_SCARCITY_INDEPENDENT_VERIFICATION',
  generatedAt: new Date().toISOString(),
  policy: policy.policy,
  metrics: {
    acceptedPrimaryAttestations: accepted.size,
    submittedVerifications: verifications.length,
    independentlyVerified: verified.length,
    rejectedVerifications: rejected.length,
    pendingPrimaryAttestations: pendingPrimary.length,
    promotedRightDataEvidence: 0,
    qualifiedScarcitySources: verified.length,
  },
  promotionBoundary: {
    independentVerificationIsNotRightDataMutation: true,
    explicitPromotionGateStillRequired: true,
    productionScoringActivated: false,
  },
  safety: {
    syntheticOrEstimatedQuantityCreated: false,
    discoveryResultAcceptedAsEvidence: false,
    searchSnippetAcceptedAsEvidence: false,
    unauthorizedScrapingRequested: false,
    paidProviderProcurementRequested: false,
    contractExecutionRequested: false,
  },
  disposition,
  verificationDigest: `sha256:${verificationDigest}`,
  verifiedAttestations: verified,
  rejectedVerifications: rejected,
  pendingPrimaryAttestations: pendingPrimary.map(({ candidateKey, canonicalTitle, vertical, payloadHash, quantity, unit }) => ({
    candidateKey,
    canonicalTitle,
    vertical,
    payloadHash,
    quantity,
    unit,
  })),
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
console.log(`Scarcity independent verification: acceptedPrimary=${accepted.size} submitted=${verifications.length} verified=${verified.length} rejected=${rejected.length} pending=${pendingPrimary.length}`);
console.log(`disposition=${disposition}`);
if (rejected.length > 0) process.exitCode = 1;
