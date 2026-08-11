import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DEFAULT_POC = path.join(ROOT, 'reports', 'kidult100-poc', 'kidult100-poc-latest.json');
const DEFAULT_OUT = path.join(ROOT, 'reports', 'kidult100-right-data', 'canon-evidence-latest.json');
const SIGNAL_BY_SOURCE_CLASS = new Map([
  ['REFERENCE_PUBLIC_DATA', 'REFERENCE_CANON_SIGNAL'],
  ['INSTITUTION_ARCHIVE', 'INSTITUTIONAL_RECOGNITION'],
]);

function readJsonInput(value, fallbackPath) {
  const raw = value == null || String(value).trim() === '' ? fallbackPath : String(value).trim();
  if (raw.startsWith('{') || raw.startsWith('[')) return JSON.parse(raw);
  const resolved = path.isAbsolute(raw) ? raw : path.join(ROOT, raw);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) throw new Error(`Missing JSON input: ${resolved}`);
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

function nonEmpty(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function validHttps(value) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

const poc = readJsonInput(process.env.KIDULTS_CANON_POC_JSON, DEFAULT_POC);
const outRaw = process.env.KIDULTS_CANON_EVIDENCE_OUTPUT || DEFAULT_OUT;
const outPath = path.isAbsolute(outRaw) ? outRaw : path.join(ROOT, outRaw);
const candidates = (poc?.candidates || []).filter((candidate) => candidate?.semanticRelevant === true);
const seen = new Set();
const evidence = [];
const rejected = [];
const structuralErrors = [];

for (const candidate of candidates) {
  const key = candidate?.candidateKey;
  if (!nonEmpty(key)) {
    structuralErrors.push('MISSING_CANDIDATE_KEY');
    continue;
  }
  if (seen.has(key)) {
    structuralErrors.push(`DUPLICATE_CANDIDATE_KEY:${key}`);
    continue;
  }
  seen.add(key);

  const signalType = SIGNAL_BY_SOURCE_CLASS.get(candidate?.sourceClass);
  if (!signalType) {
    rejected.push({ candidateKey: key, reason: 'UNSUPPORTED_SOURCE_CLASS', sourceClass: candidate?.sourceClass || null });
    continue;
  }

  const missing = [];
  if (!nonEmpty(candidate?.source)) missing.push('source');
  if (!validHttps(candidate?.sourceUrl)) missing.push('sourceUrl');
  if (!nonEmpty(candidate?.rightsClass)) missing.push('rightsClass');
  if (!Number.isFinite(Date.parse(candidate?.observedAt || ''))) missing.push('observedAt');
  if (!nonEmpty(candidate?.payloadHash)) missing.push('payloadHash');
  if (!nonEmpty(candidate?.sourceRecordId)) missing.push('sourceRecordId');
  if (missing.length > 0) {
    structuralErrors.push(`INCOMPLETE_CANON_PROVENANCE:${key}:${missing.join(',')}`);
    continue;
  }

  evidence.push({
    candidateKey: key,
    primitive: 'CANON_CULTURAL_STRENGTH',
    source: candidate.source,
    sourceUrl: candidate.sourceUrl,
    rightsClass: candidate.rightsClass,
    observedAt: candidate.observedAt,
    payloadHash: candidate.payloadHash,
    evidenceClass: 'CANON_REFERENCE_EVIDENCE',
    value: {
      signalType,
      sourceClass: candidate.sourceClass,
      sourceRecordId: String(candidate.sourceRecordId),
    },
    safety: {
      synthetic: false,
      estimated: false,
      normalizedScoreGenerated: false,
    },
  });
}

const bySignalType = Object.fromEntries([...SIGNAL_BY_SOURCE_CLASS.values()].map((signalType) => [
  signalType,
  evidence.filter((row) => row.value.signalType === signalType).length,
]));

const report = {
  schemaVersion: '1.0.0',
  mode: 'KIDULT100_CANON_EVIDENCE_RECORDIZATION',
  generatedAt: new Date().toISOString(),
  metrics: {
    semanticRelevantCandidates: candidates.length,
    canonEvidenceRecords: evidence.length,
    rejectedCandidates: rejected.length,
    structuralErrorCount: structuralErrors.length,
    bySignalType,
  },
  claims: {
    normalizedScoresGenerated: false,
    rawPrimitivePresenceCreditedAsScore: false,
    sourceRightsReclassified: false,
    sourceProvenanceRewritten: false,
    syntheticOrEstimatedEvidenceGenerated: false,
    productionScoringActivated: false,
  },
  evidence,
  rejected,
  structuralErrors,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(`Canon evidence recordization: relevant=${candidates.length} evidence=${evidence.length} rejected=${rejected.length} errors=${structuralErrors.length}`);
console.log(`signals=${JSON.stringify(bySignalType)}`);

if (structuralErrors.length > 0) process.exitCode = 1;
