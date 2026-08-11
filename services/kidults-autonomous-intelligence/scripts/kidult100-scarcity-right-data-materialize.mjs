import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const DEFAULT_POLICY = path.join(ROOT, 'config', 'kidult100-scarcity-right-data-materialization.json');
const DEFAULT_PROMOTION = path.join(ROOT, 'reports', 'kidult100-ranking', 'kidult100-scarcity-evidence-promotion-latest.json');
const DEFAULT_RIGHT_DATA = path.join(ROOT, 'reports', 'kidult100-right-data', 'right-data-latest.json');
const DEFAULT_OUT = path.join(ROOT, 'reports', 'kidult100-right-data', 'scarcity-materialized-evidence-latest.json');

function readJsonInput(value, fallbackPath) {
  const raw = value == null || String(value).trim() === '' ? fallbackPath : String(value).trim();
  if (raw.startsWith('{') || raw.startsWith('[')) return JSON.parse(raw);
  const resolved = path.isAbsolute(raw) ? raw : path.join(ROOT, raw);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) throw new Error(`Missing JSON input: ${resolved}`);
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

function digest(value) {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function isSha256(value) {
  return /^sha256:[a-f0-9]{64}$/i.test(String(value || ''));
}

function isHttps(value) {
  try {
    return new URL(String(value || '')).protocol === 'https:';
  } catch {
    return false;
  }
}

function nonEmpty(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

const policy = readJsonInput(process.env.KIDULTS_SCARCITY_MATERIALIZATION_POLICY_JSON, DEFAULT_POLICY);
const promotion = readJsonInput(process.env.KIDULTS_SCARCITY_PROMOTION_ENVELOPE_JSON, DEFAULT_PROMOTION);
const rightData = readJsonInput(process.env.KIDULTS_SCARCITY_MATERIALIZATION_RIGHT_DATA_JSON, DEFAULT_RIGHT_DATA);
const outputRaw = process.env.KIDULTS_SCARCITY_MATERIALIZATION_OUTPUT || DEFAULT_OUT;
const outputPath = path.isAbsolute(outputRaw) ? outputRaw : path.join(ROOT, outputRaw);

if (policy?.policy !== 'FAIL_CLOSED_SCARCITY_RIGHT_DATA_MATERIALIZATION') throw new Error('Invalid scarcity materialization policy');
if (promotion?.mode !== policy.requiredPromotionMode) throw new Error(`Invalid scarcity promotion input mode: ${promotion?.mode || 'missing'}`);
if (rightData?.mode !== policy.requiredRightDataMode) throw new Error(`Invalid Right Data input mode: ${rightData?.mode || 'missing'}`);
if (policy.requiredPromotionStatus !== 'PROMOTION_ENVELOPE_READY_NOT_MATERIALIZED') throw new Error('Invalid promotion status contract');
if (policy.requiredPrimitive !== 'SCARCITY' || policy.requiredSignalType !== 'TOTAL_PRODUCED' || policy.requiredUnit !== 'UNITS') throw new Error('Invalid scarcity materialization evidence contract');
if (policy?.output?.mode !== 'KIDULT100_SCARCITY_MATERIALIZED_EVIDENCE' || policy?.output?.evidenceClass !== 'INDEPENDENT_VERIFICATION' || !nonEmpty(policy?.output?.source)) throw new Error('Invalid scarcity materialization output contract');
for (const [key, value] of Object.entries(policy.rules || {})) if (value !== true) throw new Error(`Unsafe scarcity materialization rule: ${key}`);

const envelopes = Array.isArray(promotion.promotionEnvelopes) ? promotion.promotionEnvelopes : [];
const promotionRejected = Array.isArray(promotion.rejectedPromotionRecords) ? promotion.rejectedPromotionRecords : [];
const expectedPromotionDigest = digest({ envelopes, rejected: promotionRejected });
if (!isSha256(promotion.promotionDigest) || promotion.promotionDigest !== expectedPromotionDigest) throw new Error('Scarcity promotion digest mismatch');
if (Number(promotion?.metrics?.materializedRightDataEvidence || 0) !== 0) throw new Error('Promotion input already claims materialized Right Data evidence');
if (Number(promotion?.metrics?.qualifiedProductionScores || 0) !== 0) throw new Error('Promotion input already claims production scores');

const existingEligibleScarcity = new Set();
for (const candidate of rightData.candidates || []) {
  for (const record of candidate?.rightData?.evidence || []) {
    if (record?.primitive !== policy.requiredPrimitive) continue;
    if (record?.value?.signalType !== policy.requiredSignalType) continue;
    if (record?.safety?.synthetic === true || record?.safety?.estimated === true || record?.safety?.inferred === true) continue;
    existingEligibleScarcity.add(candidate.candidateKey);
  }
}

const evidence = [];
const rejected = [];
const seen = new Set();
for (const envelope of envelopes) {
  const reasons = [];
  const primary = envelope?.primaryProvenance || {};
  const independent = envelope?.independentVerification || {};
  if (!envelope?.candidateKey || !envelope?.canonicalTitle || !envelope?.vertical) reasons.push('MISSING_CANDIDATE_IDENTITY');
  if (seen.has(envelope?.candidateKey)) reasons.push('DUPLICATE_MATERIALIZATION_CANDIDATE');
  if (existingEligibleScarcity.has(envelope?.candidateKey)) reasons.push('EXISTING_ELIGIBLE_SCARCITY_EVIDENCE_PRESENT');
  if (envelope?.promotionStatus !== policy.requiredPromotionStatus) reasons.push('INVALID_PROMOTION_STATUS');
  if (envelope?.materializedRightDataEvidence !== false) reasons.push('PROMOTION_ALREADY_MARKED_MATERIALIZED');
  if (envelope?.productionScoreActivated !== false) reasons.push('PROMOTION_ALREADY_ACTIVATED_SCORE');
  if (envelope?.signalType !== policy.requiredSignalType) reasons.push('INVALID_SIGNAL_TYPE');
  if (String(envelope?.unit || '').toUpperCase() !== policy.requiredUnit) reasons.push('INVALID_QUANTITY_UNIT');
  if (!Number.isSafeInteger(envelope?.quantity) || envelope.quantity <= 0) reasons.push('INVALID_EXPLICIT_QUANTITY');
  if (!isSha256(envelope?.primaryPayloadHash) || !isSha256(envelope?.verificationPayloadHash)) reasons.push('INVALID_SOURCE_HASH_CHAIN');
  if (!isHttps(primary.sourceUrl) || !isHttps(primary.rightsUrl) || !isHttps(primary.automatedAccessUrl)) reasons.push('INVALID_PRIMARY_PROVENANCE');
  if (!nonEmpty(primary.rightsClass)) reasons.push('MISSING_PRIMARY_RIGHTS_CLASS');
  if (!isHttps(independent.sourceUrl) || !isHttps(independent.rightsUrl) || !isHttps(independent.automatedAccessUrl)) reasons.push('INVALID_INDEPENDENT_PROVENANCE');
  if (!Number.isFinite(Date.parse(independent.verifiedAt || ''))) reasons.push('INVALID_VERIFIED_AT');
  if (!isSha256(envelope?.chainDigests?.attestationIntakeDigest) || !isSha256(envelope?.chainDigests?.independentVerificationDigest)) reasons.push('INVALID_CHAIN_DIGESTS');

  const normalized = {
    candidateKey: envelope?.candidateKey || null,
    canonicalTitle: envelope?.canonicalTitle || null,
    vertical: envelope?.vertical || null,
    primitive: policy.requiredPrimitive,
    source: policy.output.source,
    sourceUrl: primary.sourceUrl || null,
    rightsClass: primary.rightsClass || null,
    observedAt: independent.verifiedAt || primary.observedAt || null,
    evidenceClass: policy.output.evidenceClass,
    value: {
      signalType: policy.requiredSignalType,
      quantity: envelope?.quantity ?? null,
      unit: policy.requiredUnit,
      primaryPayloadHash: envelope?.primaryPayloadHash || null,
      verificationPayloadHash: envelope?.verificationPayloadHash || null,
      primaryRightsUrl: primary.rightsUrl || null,
      primaryAutomatedAccessUrl: primary.automatedAccessUrl || null,
      independentSourceUrl: independent.sourceUrl || null,
      independentRightsUrl: independent.rightsUrl || null,
      independentAutomatedAccessUrl: independent.automatedAccessUrl || null,
      chainDigests: envelope?.chainDigests || null,
    },
  };

  if (reasons.length === 0) {
    const payloadHash = digest({ ...normalized, promotionDigest: promotion.promotionDigest });
    evidence.push({
      ...normalized,
      payloadHash,
      safety: {
        synthetic: false,
        estimated: false,
        inferred: false,
        normalizedScoreGenerated: false,
        productionScoringActivated: false,
        marketEvidenceClaim: false,
      },
      materializationStatus: 'RAW_RIGHT_DATA_EVIDENCE_MATERIALIZED_NOT_SCORED',
    });
    seen.add(envelope.candidateKey);
  } else {
    rejected.push({ ...normalized, materializationStatus: 'FAIL_CLOSED_REJECTED', reasons: [...new Set(reasons)] });
  }
}

const materializationDigest = digest({ evidence, rejected, promotionDigest: promotion.promotionDigest });
const disposition = rejected.length > 0
  ? 'FAIL_CLOSED_MATERIALIZATION_REJECTIONS_PRESENT'
  : evidence.length > 0
    ? 'VERIFIED_SCARCITY_RAW_EVIDENCE_MATERIALIZED_NO_SCORE'
    : 'NO_PROMOTION_ENVELOPES_TO_MATERIALIZE';

const report = {
  schemaVersion: '1.0.0',
  mode: policy.output.mode,
  generatedAt: new Date().toISOString(),
  policy: policy.policy,
  metrics: {
    promotionReadyInput: envelopes.length,
    materializedRightDataEvidence: evidence.length,
    rejectedMaterializationRecords: rejected.length,
    existingEligibleScarcityCandidates: existingEligibleScarcity.size,
    normalizedScoresGenerated: 0,
    qualifiedProductionScores: 0,
    marketEvidenceCreated: 0,
  },
  claims: {
    independentlyVerifiedChainRequired: true,
    commercialReuseRightsPreserved: true,
    documentedAutomatedAccessPreserved: true,
    syntheticOrEstimatedQuantityCreated: false,
    normalizedScoreGenerated: false,
    productionScoringActivated: false,
    marketEvidenceClaimed: false,
    unauthorizedScrapingUsed: false,
    paidProviderProcured: false,
    contractExecuted: false,
  },
  disposition,
  promotionDigest: promotion.promotionDigest,
  materializationDigest,
  evidence,
  rejectedMaterializationRecords: rejected,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
console.log(`Scarcity Right Data materialization: promotionReady=${envelopes.length} materialized=${evidence.length} rejected=${rejected.length} existing=${existingEligibleScarcity.size}`);
console.log(`disposition=${disposition}`);
if (rejected.length > 0) process.exitCode = 1;
