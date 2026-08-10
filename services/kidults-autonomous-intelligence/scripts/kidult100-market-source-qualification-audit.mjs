import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'kidult100-market-source-qualification.json'), 'utf8'));
const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'kidult100-market-adapter-registry.json'), 'utf8'));
const OUT_DIR = path.join(ROOT, 'reports', 'kidult100-right-data');
const OUT = path.join(OUT_DIR, 'market-source-qualification-latest.json');
fs.mkdirSync(OUT_DIR, { recursive: true });

const errors = [];
const candidates = Array.isArray(manifest.candidates) ? manifest.candidates : [];
const providers = Array.isArray(registry.providers) ? registry.providers : [];
const ids = candidates.map((candidate) => candidate?.sourceId).filter(Boolean);
if (new Set(ids).size !== ids.length) errors.push('DUPLICATE_SOURCE_ID');

const explicitReuseStatuses = new Set(['EXPLICIT_CC0', 'EXPLICIT_CC0_OPEN_ACCESS', 'EXPLICIT_COMMERCIAL_REUSE']);
const completedTransactionStatuses = new Set(['COMPLETED_TRANSACTION_FEED_CONFIRMED']);
const liquidityStatuses = new Set(['TRANSACTION_BACKED_LIQUIDITY_CONFIRMED']);
const qualificationTarget = 'QUALIFIED_FOR_PROVIDER_ONBOARDING';

const assessed = candidates.map((candidate) => {
  const reasons = [];
  if (!candidate || typeof candidate !== 'object') return { sourceId: null, safe: false, reasons: ['INVALID_SOURCE_RECORD'] };
  if (!candidate.sourceId) reasons.push('SOURCE_ID_MISSING');
  if (!candidate.displayName) reasons.push('DISPLAY_NAME_MISSING');
  if (!candidate.rightsStatus) reasons.push('RIGHTS_STATUS_MISSING');
  if (!candidate.automationAccess) reasons.push('AUTOMATION_ACCESS_MISSING');
  if (!candidate.marketSemantics?.completedTransactions) reasons.push('TRANSACTION_SEMANTICS_MISSING');
  if (!candidate.marketSemantics?.transactionBackedLiquidity) reasons.push('LIQUIDITY_SEMANTICS_MISSING');
  if (!candidate.qualification) reasons.push('QUALIFICATION_MISSING');
  if (!Array.isArray(candidate.evidenceLinks) || candidate.evidenceLinks.length === 0) reasons.push('EVIDENCE_LINKS_MISSING');
  if ((candidate.evidenceLinks || []).some((link) => typeof link !== 'string' || !link.startsWith('https://'))) reasons.push('NON_HTTPS_EVIDENCE_LINK');
  if (String(candidate.qualification || '').startsWith('NOT_') && (!Array.isArray(candidate.blockingReasons) || candidate.blockingReasons.length === 0)) reasons.push('BLOCKING_REASONS_MISSING');

  const rightsReusable = explicitReuseStatuses.has(candidate.rightsStatus);
  const completedTransactionsQualified = completedTransactionStatuses.has(candidate.marketSemantics?.completedTransactions);
  const liquidityQualified = liquidityStatuses.has(candidate.marketSemantics?.transactionBackedLiquidity);
  const markedQualified = candidate.qualification === qualificationTarget;
  const matchingProvider = providers.find((provider) => provider?.qualificationSourceId === candidate.sourceId);
  const providerApproved = Boolean(
    matchingProvider &&
    matchingProvider.enabled === true &&
    matchingProvider.authorizationStatus === registry.providerContract.requiredAuthorizationStatus &&
    matchingProvider.authorizationId
  );

  if (markedQualified && !rightsReusable) reasons.push('QUALIFIED_WITHOUT_EXPLICIT_REUSE_RIGHTS');
  if (markedQualified && !completedTransactionsQualified) reasons.push('QUALIFIED_WITHOUT_COMPLETED_TRANSACTION_SEMANTICS');
  if (markedQualified && !liquidityQualified) reasons.push('QUALIFIED_WITHOUT_TRANSACTION_BACKED_LIQUIDITY');
  if (markedQualified && !providerApproved) reasons.push('QUALIFIED_WITHOUT_APPROVED_PROVIDER_REGISTRY_ENTRY');

  return {
    sourceId: candidate.sourceId || null,
    qualification: candidate.qualification || null,
    rightsReusable,
    completedTransactionsQualified,
    liquidityQualified,
    providerApproved,
    safe: reasons.length === 0,
    reasons,
  };
});

for (const row of assessed) for (const reason of row.reasons) errors.push(`${row.sourceId || 'UNKNOWN'}:${reason}`);
const qualified = assessed.filter((row) => row.qualification === qualificationTarget && row.safe);
const rightsReusable = assessed.filter((row) => row.rightsReusable);
const authorizationRequired = candidates.filter((candidate) => String(candidate?.qualification || '').includes('AUTHORIZATION_REQUIRED'));

const output = {
  schemaVersion: '1.0.0',
  mode: 'KIDULT100_MARKET_SOURCE_QUALIFICATION_AUDIT',
  generatedAt: new Date().toISOString(),
  manifestVerifiedAt: manifest.lastVerifiedAt || null,
  policy: manifest.policy,
  metrics: {
    candidates: candidates.length,
    rightsReusableCandidates: rightsReusable.length,
    authorizationRequiredCandidates: authorizationRequired.length,
    qualifiedForProviderOnboarding: qualified.length,
    registeredProviders: providers.length,
    structuralOrSafetyErrors: errors.length,
  },
  disposition: errors.length
    ? 'FAIL_CLOSED_SOURCE_QUALIFICATION_INVALID'
    : qualified.length
      ? 'QUALIFIED_SOURCE_REQUIRES_SEPARATE_PROVIDER_ACTIVATION'
      : 'NO_SOURCE_QUALIFIED_FOR_AUTOMATIC_ONBOARDING',
  assessed,
  errors,
  claims: {
    providerProcured: false,
    contractExecuted: false,
    providerAutomaticallyActivated: false,
    liveMarketEvidenceCertified: false,
    marketEvidenceCoverageIncreased: false,
    syntheticOrEstimatedMarketEvidenceUsed: false,
  },
};

fs.writeFileSync(OUT, JSON.stringify(output, null, 2));
console.log(`Market source qualification: candidates=${candidates.length} rightsReusable=${rightsReusable.length} qualified=${qualified.length} errors=${errors.length}`);
console.log(`disposition=${output.disposition}`);
if (errors.length) process.exitCode = 1;
