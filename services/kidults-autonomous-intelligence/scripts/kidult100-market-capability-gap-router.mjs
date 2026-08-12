import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DEFAULT_MANIFEST = path.join(ROOT, 'config', 'kidult100-market-source-qualification.json');
const DEFAULT_QUALIFICATION = path.join(ROOT, 'reports', 'kidult100-right-data', 'market-no-procurement-qualification-latest.json');
const DEFAULT_REQUIREMENTS = path.join(ROOT, 'config', 'kidult100-market-evidence-requirements.json');
const DEFAULT_OUT = path.join(ROOT, 'reports', 'kidult100-right-data', 'market-capability-gap-router-latest.json');

function readJsonInput(value, fallbackPath) {
  const raw = value == null || String(value).trim() === '' ? fallbackPath : String(value).trim();
  if (raw.startsWith('{') || raw.startsWith('[')) return JSON.parse(raw);
  const resolved = path.isAbsolute(raw) ? raw : path.join(ROOT, raw);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) throw new Error(`Missing JSON input: ${resolved}`);
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

const manifest = readJsonInput(process.env.KIDULTS_MARKET_CAPABILITY_MANIFEST_JSON, DEFAULT_MANIFEST);
const qualification = readJsonInput(process.env.KIDULTS_MARKET_CAPABILITY_QUALIFICATION_JSON, DEFAULT_QUALIFICATION);
const requirements = readJsonInput(process.env.KIDULTS_MARKET_CAPABILITY_REQUIREMENTS_JSON, DEFAULT_REQUIREMENTS);
const outputRaw = process.env.KIDULTS_MARKET_CAPABILITY_OUTPUT || DEFAULT_OUT;
const outputPath = path.isAbsolute(outputRaw) ? outputRaw : path.join(ROOT, outputRaw);

if (manifest?.policy !== 'FAIL_CLOSED_SOURCE_QUALIFICATION_NO_AUTO_ONBOARDING') throw new Error('Invalid market source manifest policy');
if (qualification?.mode !== 'KIDULT100_MARKET_NO_PROCUREMENT_QUALIFICATION') throw new Error('Invalid no-procurement qualification input');
if (qualification?.claims?.evidenceProduced !== false || qualification?.claims?.providerProcured !== false || qualification?.claims?.contractExecuted !== false || qualification?.claims?.unauthorizedScrapingRequested !== false || qualification?.claims?.productionGateWeakened !== false) throw new Error('Unsafe no-procurement qualification claims');
if (requirements?.policy !== 'FAIL_CLOSED_MARKET_EVIDENCE_ONBOARDING_PREFLIGHT') throw new Error('Invalid market evidence requirements policy');
if (!Array.isArray(requirements?.global?.requiredPrimitives) || !requirements.global.requiredPrimitives.includes('TRANSACTION_PRICE_COMPARABLE') || !requirements.global.requiredPrimitives.includes('LIQUIDITY')) throw new Error('Required market primitives are incomplete');
if (requirements.global.requiresTransactionId !== true || requirements.global.requiresVenue !== true || requirements.global.requiresCurrency !== true || requirements.global.requiresTransactionTimestamp !== true || requirements.global.listingOrEstimateAcceptedAsTransaction !== false || requirements.global.syntheticOrEstimatedEvidenceAllowed !== false) throw new Error('Unsafe market evidence contract requirements');

const structuralErrors = [];
const candidates = Array.isArray(manifest.candidates) ? manifest.candidates : [];
const qualificationRows = Array.isArray(qualification.rows) ? qualification.rows : [];
const rowsById = new Map();
for (const row of qualificationRows) {
  if (!row?.sourceId) {
    structuralErrors.push('QUALIFICATION_SOURCE_ID_MISSING');
    continue;
  }
  if (rowsById.has(row.sourceId)) structuralErrors.push(`DUPLICATE_QUALIFICATION_SOURCE_ID:${row.sourceId}`);
  rowsById.set(row.sourceId, row);
}

const routed = [];
for (const candidate of candidates) {
  const sourceId = candidate?.sourceId || null;
  if (!sourceId) {
    structuralErrors.push('MANIFEST_SOURCE_ID_MISSING');
    continue;
  }
  const row = rowsById.get(sourceId);
  if (!row) {
    structuralErrors.push(`QUALIFICATION_ROW_MISSING:${sourceId}`);
    continue;
  }
  const access = row.publicDocumentedAccess === true ? 'PASS' : row.authorizationRequired === true ? 'AUTHORIZATION_REQUIRED' : 'MISSING';
  const rights = row.explicitReuseRights === true ? 'PASS' : row.authorizationRequired === true ? 'AUTHORIZATION_REQUIRED' : 'MISSING';
  const completedTransactions = row.completedTransactionsQualified === true ? 'PASS' : 'MISSING';
  const liquidity = row.liquidityQualified === true ? 'PASS' : 'MISSING';
  const capabilities = { DOCUMENTED_AUTOMATED_ACCESS: access, EXPLICIT_COMMERCIAL_REUSE_RIGHTS: rights, COMPLETED_TRANSACTION_SEMANTICS: completedTransactions, TRANSACTION_BACKED_LIQUIDITY: liquidity };
  const missingCapabilities = Object.entries(capabilities).filter(([, status]) => status !== 'PASS').map(([capability]) => capability);
  const automaticGapCount = missingCapabilities.length;
  const primarySourceFindings = candidate?.primarySourceFindings && typeof candidate.primarySourceFindings === 'object' ? candidate.primarySourceFindings : {};
  const documentedCompletedTransactionSemantics = primarySourceFindings.completedTransactionSemanticsDocumented === true;
  const documentedTransactionBackedLiquiditySemantics = primarySourceFindings.transactionBackedLiquiditySemanticsDocumented === true;
  const commercialReuseAuthorizationRequired = primarySourceFindings.commercialReuseAuthorizationRequired === true;
  routed.push({
    sourceId,
    displayName: candidate.displayName || row.displayName || null,
    sourceClass: candidate.sourceClass || row.sourceClass || null,
    qualificationStatus: row.status || null,
    capabilities,
    missingCapabilities,
    automaticGapCount,
    authorizationRequired: row.authorizationRequired === true,
    documentedCompletedTransactionSemantics,
    documentedTransactionBackedLiquiditySemantics,
    commercialReuseAuthorizationRequired,
    blockingReasons: Array.isArray(candidate.blockingReasons) ? candidate.blockingReasons : [],
    evidenceLinks: Array.isArray(candidate.evidenceLinks) ? candidate.evidenceLinks : [],
  });
}

const capabilityNames = ['DOCUMENTED_AUTOMATED_ACCESS', 'EXPLICIT_COMMERCIAL_REUSE_RIGHTS', 'COMPLETED_TRANSACTION_SEMANTICS', 'TRANSACTION_BACKED_LIQUIDITY'];
const capabilitySummary = Object.fromEntries(capabilityNames.map((capability) => [capability, {
  pass: routed.filter((row) => row.capabilities[capability] === 'PASS').length,
  authorizationRequired: routed.filter((row) => row.capabilities[capability] === 'AUTHORIZATION_REQUIRED').length,
  missing: routed.filter((row) => row.capabilities[capability] === 'MISSING').length,
}]));
const capabilityDeficitRanking = capabilityNames
  .map((capability) => ({
    capability,
    pass: capabilitySummary[capability].pass,
    authorizationRequired: capabilitySummary[capability].authorizationRequired,
    missing: capabilitySummary[capability].missing,
    unresolved: capabilitySummary[capability].authorizationRequired + capabilitySummary[capability].missing,
  }))
  .sort((a, b) => b.unresolved - a.unresolved || a.capability.localeCompare(b.capability));
const qualifiedOpen = routed.filter((row) => row.qualificationStatus === 'QUALIFIED_OPEN_NO_PROCUREMENT_SOURCE');
const authorizationRequired = routed.filter((row) => row.qualificationStatus === 'REQUIRES_AUTHORIZATION_NO_ACTION_TAKEN');
const rejected = routed.filter((row) => row.qualificationStatus === 'REJECTED_NO_QUALIFIED_MARKET_SEMANTICS');
const openRightsNearFits = routed.filter((row) => row.authorizationRequired === false && row.capabilities.DOCUMENTED_AUTOMATED_ACCESS === 'PASS' && row.capabilities.EXPLICIT_COMMERCIAL_REUSE_RIGHTS === 'PASS' && (row.capabilities.COMPLETED_TRANSACTION_SEMANTICS !== 'PASS' || row.capabilities.TRANSACTION_BACKED_LIQUIDITY !== 'PASS'));
const jointMarketSemanticGapSources = routed.filter((row) => row.capabilities.COMPLETED_TRANSACTION_SEMANTICS !== 'PASS' && row.capabilities.TRANSACTION_BACKED_LIQUIDITY !== 'PASS');
const documentedCompletedTransactionSources = routed.filter((row) => row.documentedCompletedTransactionSemantics === true);
const documentedCompletedTransactionButAuthorizationBlockedSources = documentedCompletedTransactionSources.filter((row) => row.commercialReuseAuthorizationRequired === true || row.authorizationRequired === true);
const documentedTransactionBackedLiquiditySources = routed.filter((row) => row.documentedTransactionBackedLiquiditySemantics === true);
const rankedSources = [...routed].sort((a, b) => a.automaticGapCount - b.automaticGapCount || Number(a.authorizationRequired) - Number(b.authorizationRequired) || a.sourceId.localeCompare(b.sourceId));
const nextSafeLane = qualifiedOpen.length > 0
  ? 'VALIDATE_OPEN_SOURCE_AGAINST_TRANSACTION_ID_VENUE_CURRENCY_TIMESTAMP_CONTRACT'
  : openRightsNearFits.length > 0
    ? 'DISCOVER_OPEN_RIGHTS_QUALIFIED_COMPLETED_TRANSACTION_AND_LIQUIDITY_SOURCE'
    : 'EXPAND_RIGHTS_QUALIFIED_MARKET_SOURCE_DISCOVERY_WITHOUT_PROCUREMENT';
const sourceDiscoveryWorkPacket = {
  schemaVersion: '1.1.0',
  status: qualifiedOpen.length > 0 ? 'NOT_REQUIRED_QUALIFIED_OPEN_SOURCE_PRESENT' : 'READY_FOR_OPEN_SOURCE_DISCOVERY',
  objective: 'FIND_OPEN_RIGHTS_QUALIFIED_COMPLETED_TRANSACTION_AND_LIQUIDITY_SOURCE',
  priorityCapabilities: capabilityDeficitRanking.map((row) => row.capability),
  jointMarketSemanticGapSourceCount: jointMarketSemanticGapSources.length,
  openRightsNearFitSourceIds: openRightsNearFits.map((row) => row.sourceId),
  documentedCompletedTransactionSourceIds: documentedCompletedTransactionSources.map((row) => row.sourceId),
  authorizationBlockedCompletedTransactionSourceIds: documentedCompletedTransactionButAuthorizationBlockedSources.map((row) => row.sourceId),
  documentedTransactionBackedLiquiditySourceIds: documentedTransactionBackedLiquiditySources.map((row) => row.sourceId),
  acceptanceContract: {
    documentedAutomatedAccessRequired: true,
    explicitCommercialReuseRightsRequired: true,
    completedTransactionSemanticsRequired: true,
    transactionBackedLiquidityRequired: true,
    transactionIdentityFieldsRequired: ['transactionId', 'venue', 'currency', 'transactionTimestamp'],
    minimumCompletedTransactionsForLiquidity: requirements.global.minimumCompletedTransactionsForLiquidity,
    listingOrEstimateAcceptedAsTransaction: false,
    syntheticOrEstimatedEvidenceAllowed: false,
  },
  prohibitedActions: ['PAID_PROVIDER_PROCUREMENT', 'CONTRACT_EXECUTION', 'AUTHORIZATION_REQUEST', 'UNAUTHORIZED_SCRAPING', 'LISTING_OR_ESTIMATE_SUBSTITUTION', 'SYNTHETIC_OR_ESTIMATED_EVIDENCE'],
  promotionRule: 'DISCOVERY_ONLY_REQUIRES_SEPARATE_SOURCE_QUALIFICATION_AND_EVIDENCE_VALIDATION',
  existingNearFitsAreNotMarketEvidenceSources: true,
  documentedButAuthorizationBlockedSemanticsAreNotMarketEvidence: true,
};
const disposition = structuralErrors.length > 0 ? 'FAIL_CLOSED_MARKET_CAPABILITY_INPUT_INVALID' : 'MARKET_CAPABILITY_GAPS_ROUTED_NO_EVIDENCE_CREATED';

const report = {
  schemaVersion: '1.2.0',
  mode: 'KIDULT100_MARKET_CAPABILITY_GAP_ROUTER',
  generatedAt: new Date().toISOString(),
  metrics: {
    candidates: routed.length,
    qualifiedOpenNoProcurementSources: qualifiedOpen.length,
    authorizationRequiredSources: authorizationRequired.length,
    rejectedSources: rejected.length,
    openRightsNearFitSources: openRightsNearFits.length,
    jointMarketSemanticGapSources: jointMarketSemanticGapSources.length,
    documentedCompletedTransactionSources: documentedCompletedTransactionSources.length,
    documentedCompletedTransactionButAuthorizationBlockedSources: documentedCompletedTransactionButAuthorizationBlockedSources.length,
    documentedTransactionBackedLiquiditySources: documentedTransactionBackedLiquiditySources.length,
    structuralErrorCount: structuralErrors.length,
  },
  capabilitySummary,
  capabilityDeficitRanking,
  rankedSources,
  sourceDiscoveryWorkPacket,
  nextSafeLane,
  disposition,
  downstreamEvidenceContract: {
    requiresTransactionId: requirements.global.requiresTransactionId,
    requiresVenue: requirements.global.requiresVenue,
    requiresCurrency: requirements.global.requiresCurrency,
    requiresTransactionTimestamp: requirements.global.requiresTransactionTimestamp,
    minimumCompletedTransactionsForLiquidity: requirements.global.minimumCompletedTransactionsForLiquidity,
  },
  structuralErrors,
  claims: {
    planningOnly: true,
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
  },
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
console.log(`Market capability router: candidates=${routed.length} openQualified=${qualifiedOpen.length} authRequired=${authorizationRequired.length} rejected=${rejected.length} nearFits=${openRightsNearFits.length} jointMarketGap=${jointMarketSemanticGapSources.length} documentedSales=${documentedCompletedTransactionSources.length} authBlockedSales=${documentedCompletedTransactionButAuthorizationBlockedSources.length} documentedLiquidity=${documentedTransactionBackedLiquiditySources.length} errors=${structuralErrors.length}`);
console.log(`capabilitySummary=${JSON.stringify(capabilitySummary)} nextSafeLane=${nextSafeLane}`);
if (structuralErrors.length > 0) process.exitCode = 1;
