import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DEFAULT_MANIFEST = path.join(ROOT, 'config', 'kidult100-market-source-qualification.json');
const DEFAULT_AUDIT = path.join(ROOT, 'reports', 'kidult100-right-data', 'market-source-qualification-latest.json');
const DEFAULT_OUT = path.join(ROOT, 'reports', 'kidult100-right-data', 'market-no-procurement-qualification-latest.json');

function readJsonInput(value, fallbackPath) {
  const raw = value == null || String(value).trim() === '' ? fallbackPath : String(value).trim();
  if (raw.startsWith('{') || raw.startsWith('[')) return JSON.parse(raw);
  const resolved = path.isAbsolute(raw) ? raw : path.join(ROOT, raw);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) throw new Error(`Missing JSON input: ${resolved}`);
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

const manifest = readJsonInput(process.env.KIDULTS_MARKET_NO_PROCUREMENT_MANIFEST_JSON, DEFAULT_MANIFEST);
const audit = readJsonInput(process.env.KIDULTS_MARKET_NO_PROCUREMENT_AUDIT_JSON, DEFAULT_AUDIT);
const outputRaw = process.env.KIDULTS_MARKET_NO_PROCUREMENT_OUTPUT || DEFAULT_OUT;
const outputPath = path.isAbsolute(outputRaw) ? outputRaw : path.join(ROOT, outputRaw);

if (manifest?.policy !== 'FAIL_CLOSED_SOURCE_QUALIFICATION_NO_AUTO_ONBOARDING') throw new Error('Invalid market source qualification policy');
if (audit?.mode !== 'KIDULT100_MARKET_SOURCE_QUALIFICATION_AUDIT') throw new Error('Invalid market source qualification audit input');
if (audit?.claims?.providerProcured !== false || audit?.claims?.contractExecuted !== false || audit?.claims?.providerAutomaticallyActivated !== false || audit?.claims?.liveMarketEvidenceCertified !== false) throw new Error('Unsafe upstream market qualification state');

const structuralErrors = [];
const candidates = Array.isArray(manifest.candidates) ? manifest.candidates : [];
const assessed = Array.isArray(audit.assessed) ? audit.assessed : [];
const assessedById = new Map();
for (const row of assessed) {
  if (!row?.sourceId) {
    structuralErrors.push('AUDIT_SOURCE_ID_MISSING');
    continue;
  }
  if (assessedById.has(row.sourceId)) structuralErrors.push(`DUPLICATE_AUDIT_SOURCE_ID:${row.sourceId}`);
  assessedById.set(row.sourceId, row);
}

const rows = [];
for (const candidate of candidates) {
  const sourceId = candidate?.sourceId || null;
  if (!sourceId) {
    structuralErrors.push('MANIFEST_SOURCE_ID_MISSING');
    continue;
  }
  const auditRow = assessedById.get(sourceId);
  if (!auditRow) {
    structuralErrors.push(`AUDIT_ROW_MISSING:${sourceId}`);
    continue;
  }

  const publicDocumentedAccess = ['PUBLIC_DOCUMENTED_DATA_ACCESS', 'PUBLIC_DOCUMENTED_API'].includes(candidate.automationAccess);
  const explicitReuseRights = auditRow.rightsReusable === true;
  const completedTransactionsQualified = auditRow.completedTransactionsQualified === true;
  const liquidityQualified = auditRow.liquidityQualified === true;
  const qualificationText = String(candidate.qualification || '');
  const authorizationRequired = qualificationText.includes('AUTHORIZATION_REQUIRED') || String(candidate.rightsStatus || '').includes('LICENSE_AND_USE_TERMS_REQUIRED') || String(candidate.automationAccess || '').includes('AUTHORIZATION_REQUIRED');
  const openQualified = publicDocumentedAccess && explicitReuseRights && completedTransactionsQualified && liquidityQualified && !authorizationRequired;

  const status = openQualified
    ? 'QUALIFIED_OPEN_NO_PROCUREMENT_SOURCE'
    : authorizationRequired
      ? 'REQUIRES_AUTHORIZATION_NO_ACTION_TAKEN'
      : 'REJECTED_NO_QUALIFIED_MARKET_SEMANTICS';

  rows.push({
    sourceId,
    displayName: candidate.displayName || null,
    sourceClass: candidate.sourceClass || null,
    status,
    publicDocumentedAccess,
    explicitReuseRights,
    completedTransactionsQualified,
    liquidityQualified,
    authorizationRequired,
    blockingReasons: Array.isArray(candidate.blockingReasons) ? candidate.blockingReasons : [],
    evidenceLinks: Array.isArray(candidate.evidenceLinks) ? candidate.evidenceLinks : [],
    automaticEvidenceQualificationAllowed: false,
    providerProcurementRequested: false,
    contractExecutionRequested: false,
    unauthorizedScrapingRequested: false,
  });
}

const qualifiedOpen = rows.filter((row) => row.status === 'QUALIFIED_OPEN_NO_PROCUREMENT_SOURCE');
const authorizationRequired = rows.filter((row) => row.status === 'REQUIRES_AUTHORIZATION_NO_ACTION_TAKEN');
const rejected = rows.filter((row) => row.status === 'REJECTED_NO_QUALIFIED_MARKET_SEMANTICS');
const disposition = structuralErrors.length > 0
  ? 'FAIL_CLOSED_MARKET_NO_PROCUREMENT_INPUT_INVALID'
  : qualifiedOpen.length > 0
    ? 'OPEN_NO_PROCUREMENT_SOURCES_REQUIRE_SEPARATE_EVIDENCE_VALIDATION'
    : 'NO_OPEN_NO_PROCUREMENT_MARKET_SOURCE_CURRENTLY_QUALIFIED';

const report = {
  schemaVersion: '1.0.0',
  mode: 'KIDULT100_MARKET_NO_PROCUREMENT_QUALIFICATION',
  generatedAt: new Date().toISOString(),
  metrics: {
    candidates: rows.length,
    qualifiedOpenNoProcurementSources: qualifiedOpen.length,
    authorizationRequiredSources: authorizationRequired.length,
    rejectedSources: rejected.length,
    structuralErrorCount: structuralErrors.length,
  },
  disposition,
  rows,
  structuralErrors,
  claims: {
    planningAndQualificationOnly: true,
    evidenceProduced: false,
    liveMarketEvidenceCertified: false,
    marketEvidenceCoverageIncreased: false,
    providerProcured: false,
    paidCommitmentMade: false,
    contractExecuted: false,
    authorizationRequested: false,
    unauthorizedScrapingRequested: false,
    syntheticOrEstimatedMarketEvidenceCreated: false,
    rightsOrProvenanceRequirementsWeakened: false,
    productionGateWeakened: false,
    automaticEvidenceQualificationAllowed: false,
  },
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
console.log(`Market no-procurement qualification: candidates=${rows.length} openQualified=${qualifiedOpen.length} authorizationRequired=${authorizationRequired.length} rejected=${rejected.length} errors=${structuralErrors.length}`);
console.log(`disposition=${disposition}`);
if (structuralErrors.length > 0) process.exitCode = 1;
