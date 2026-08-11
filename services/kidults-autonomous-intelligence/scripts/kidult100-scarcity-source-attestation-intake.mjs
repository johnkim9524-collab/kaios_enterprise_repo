import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const DEFAULT_POLICY = path.join(ROOT, 'config', 'kidult100-scarcity-source-attestation-intake.json');
const DEFAULT_INPUT = path.join(ROOT, 'reports', 'kidult100-ranking', 'kidult100-scarcity-source-discovery-plan-latest.json');
const DEFAULT_OUT = path.join(ROOT, 'reports', 'kidult100-ranking', 'kidult100-scarcity-source-attestation-intake-latest.json');

function readJsonInput(value, fallbackPath) {
  const raw = value == null || String(value).trim() === '' ? fallbackPath : String(value).trim();
  if (raw.startsWith('{') || raw.startsWith('[')) return JSON.parse(raw);
  const resolved = path.isAbsolute(raw) ? raw : path.join(ROOT, raw);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) throw new Error(`Missing JSON input: ${resolved}`);
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

function isHttps(value) {
  try {
    return new URL(String(value || '')).protocol === 'https:';
  } catch {
    return false;
  }
}

function isSha256(value) {
  return /^sha256:[a-f0-9]{64}$/i.test(String(value || ''));
}

function finitePositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

const policy = readJsonInput(process.env.KIDULTS_SCARCITY_SOURCE_ATTESTATION_JSON, DEFAULT_POLICY);
const input = readJsonInput(process.env.KIDULTS_SCARCITY_SOURCE_DISCOVERY_JSON, DEFAULT_INPUT);
const outputRaw = process.env.KIDULTS_SCARCITY_SOURCE_ATTESTATION_OUTPUT || DEFAULT_OUT;
const outputPath = path.isAbsolute(outputRaw) ? outputRaw : path.join(ROOT, outputRaw);

if (policy?.policy !== 'FAIL_CLOSED_SCARCITY_SOURCE_ATTESTATION_INTAKE') throw new Error('Invalid scarcity source attestation policy');
if (input?.mode !== policy.requiredInputMode) throw new Error(`Invalid scarcity source discovery input mode: ${input?.mode || 'missing'}`);
if (policy?.requiredSignalType !== 'TOTAL_PRODUCED') throw new Error('Scarcity attestation must require TOTAL_PRODUCED');
if (!Array.isArray(policy.allowedSourceTiers) || policy.allowedSourceTiers.length === 0) throw new Error('Scarcity attestation requires allowed source tiers');
if (!Array.isArray(policy.requiredEvidenceFields) || policy.requiredEvidenceFields.length === 0) throw new Error('Scarcity attestation requires evidence fields');
for (const [key, value] of Object.entries(policy.rules || {})) {
  if (value !== true) throw new Error(`Unsafe scarcity attestation rule: ${key}`);
}

const packets = new Map((input.workPackets || []).map((row) => [row.candidateKey, row]));
const attestations = Array.isArray(policy.attestations) ? policy.attestations : [];
const accepted = [];
const rejected = [];
const seen = new Set();

for (const record of attestations) {
  const reasons = [];
  for (const field of policy.requiredEvidenceFields) {
    if (record?.[field] == null || record[field] === '') reasons.push(`MISSING_${field.toUpperCase()}`);
  }
  const packet = packets.get(record?.candidateKey);
  if (!packet) reasons.push('CANDIDATE_NOT_IN_DISCOVERY_WORK_PACKETS');
  if (seen.has(record?.candidateKey)) reasons.push('DUPLICATE_CANDIDATE_ATTESTATION');
  if (record?.signalType !== 'TOTAL_PRODUCED') reasons.push('INVALID_SIGNAL_TYPE');
  if (!policy.allowedSourceTiers.includes(record?.sourceTier)) reasons.push('UNAPPROVED_SOURCE_TIER');
  if (!isHttps(record?.sourceUrl)) reasons.push('SOURCE_URL_NOT_HTTPS');
  if (!isHttps(record?.rightsUrl)) reasons.push('RIGHTS_URL_NOT_HTTPS');
  if (!isHttps(record?.automatedAccessUrl)) reasons.push('AUTOMATED_ACCESS_URL_NOT_HTTPS');
  if (!finitePositiveInteger(record?.quantity)) reasons.push('QUANTITY_NOT_EXPLICIT_POSITIVE_INTEGER');
  if (String(record?.unit || '').toUpperCase() !== 'UNITS') reasons.push('INVALID_QUANTITY_UNIT');
  if (!isSha256(record?.payloadHash)) reasons.push('INVALID_PAYLOAD_HASH');
  if (record?.exactEntityMatch !== true) reasons.push('EXACT_ENTITY_MATCH_NOT_ATTESTED');
  if (record?.commercialReuseAllowed !== true) reasons.push('COMMERCIAL_REUSE_NOT_ATTESTED');
  if (record?.automatedAccessDocumented !== true) reasons.push('AUTOMATED_ACCESS_NOT_ATTESTED');
  if (record?.synthetic === true || record?.estimated === true || record?.inferred === true) reasons.push('SYNTHETIC_ESTIMATED_OR_INFERRED_FORBIDDEN');
  if (packet && record?.canonicalTitle !== packet.canonicalTitle) reasons.push('CANONICAL_TITLE_MISMATCH');
  if (packet && record?.vertical !== packet.vertical) reasons.push('VERTICAL_MISMATCH');
  if (record?.observedAt && Number.isNaN(Date.parse(record.observedAt))) reasons.push('INVALID_OBSERVED_AT');

  const normalized = {
    candidateKey: record?.candidateKey || null,
    canonicalTitle: record?.canonicalTitle || null,
    vertical: record?.vertical || null,
    sourceTier: record?.sourceTier || null,
    sourceUrl: record?.sourceUrl || null,
    rightsClass: record?.rightsClass || null,
    rightsUrl: record?.rightsUrl || null,
    automatedAccessUrl: record?.automatedAccessUrl || null,
    signalType: record?.signalType || null,
    quantity: record?.quantity ?? null,
    unit: record?.unit || null,
    observedAt: record?.observedAt || null,
    payloadHash: record?.payloadHash || null,
  };

  if (reasons.length === 0) {
    accepted.push({ ...normalized, qualificationStatus: 'ATTESTATION_STRUCTURALLY_ACCEPTED_PENDING_INDEPENDENT_VERIFICATION' });
    seen.add(record.candidateKey);
  } else {
    rejected.push({ ...normalized, qualificationStatus: 'FAIL_CLOSED_REJECTED', reasons: [...new Set(reasons)] });
  }
}

const pendingPackets = [...packets.values()].filter((packet) => !seen.has(packet.candidateKey));
const intakeDigest = crypto.createHash('sha256').update(JSON.stringify({ accepted, rejected })).digest('hex');
const disposition = rejected.length > 0
  ? 'FAIL_CLOSED_ATTESTATION_REJECTIONS_PRESENT'
  : accepted.length > 0
    ? 'ATTESTATIONS_ACCEPTED_PENDING_INDEPENDENT_VERIFICATION'
    : 'NO_ATTESTATIONS_SUBMITTED_DISCOVERY_REMAINS_PENDING';

const report = {
  schemaVersion: '1.0.0',
  mode: 'KIDULT100_SCARCITY_SOURCE_ATTESTATION_INTAKE',
  generatedAt: new Date().toISOString(),
  policy: policy.policy,
  metrics: {
    discoveryReadyTargets: packets.size,
    submittedAttestations: attestations.length,
    structurallyAcceptedAttestations: accepted.length,
    rejectedAttestations: rejected.length,
    pendingDiscoveryTargets: pendingPackets.length,
    qualifiedScarcitySources: 0,
  },
  qualificationBoundary: {
    structuralAcceptanceIsNotQualification: true,
    independentVerificationRequiredBeforeEvidencePromotion: true,
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
  intakeDigest: `sha256:${intakeDigest}`,
  acceptedAttestations: accepted,
  rejectedAttestations: rejected,
  pendingDiscoveryTargets: pendingPackets.map(({ candidateKey, canonicalTitle, vertical }) => ({ candidateKey, canonicalTitle, vertical })),
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
console.log(`Scarcity attestation intake: discovery=${packets.size} submitted=${attestations.length} accepted=${accepted.length} rejected=${rejected.length} pending=${pendingPackets.length}`);
console.log(`disposition=${disposition}`);
if (rejected.length > 0) process.exitCode = 1;
