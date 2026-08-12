import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'scripts', 'kidult100-market-capability-gap-router.mjs');

function manifest(candidates) {
  return { policy: 'FAIL_CLOSED_SOURCE_QUALIFICATION_NO_AUTO_ONBOARDING', candidates };
}

function qualification(rows, claims = {}) {
  return {
    mode: 'KIDULT100_MARKET_NO_PROCUREMENT_QUALIFICATION',
    rows,
    claims: {
      evidenceProduced: false,
      providerProcured: false,
      contractExecuted: false,
      unauthorizedScrapingRequested: false,
      productionGateWeakened: false,
      ...claims,
    },
  };
}

function requirements(globalOverrides = {}) {
  return {
    policy: 'FAIL_CLOSED_MARKET_EVIDENCE_ONBOARDING_PREFLIGHT',
    global: {
      requiredPrimitives: ['TRANSACTION_PRICE_COMPARABLE', 'LIQUIDITY'],
      requiresTransactionId: true,
      requiresVenue: true,
      requiresCurrency: true,
      requiresTransactionTimestamp: true,
      listingOrEstimateAcceptedAsTransaction: false,
      syntheticOrEstimatedEvidenceAllowed: false,
      minimumCompletedTransactionsForLiquidity: 2,
      ...globalOverrides,
    },
  };
}

function run(manifestInput, qualificationInput, requirementsInput, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'market-capability-router-'));
  const out = path.join(dir, 'out.json');
  let manifestValue = JSON.stringify(manifestInput);
  let qualificationValue = JSON.stringify(qualificationInput);
  let requirementsValue = JSON.stringify(requirementsInput);
  if (options.useFiles) {
    const manifestPath = path.join(dir, 'manifest.json');
    const qualificationPath = path.join(dir, 'qualification.json');
    const requirementsPath = path.join(dir, 'requirements.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifestInput));
    fs.writeFileSync(qualificationPath, JSON.stringify(qualificationInput));
    fs.writeFileSync(requirementsPath, JSON.stringify(requirementsInput));
    manifestValue = manifestPath;
    qualificationValue = qualificationPath;
    requirementsValue = requirementsPath;
  }
  if (options.manifestRaw !== undefined) manifestValue = options.manifestRaw;
  if (options.qualificationRaw !== undefined) qualificationValue = options.qualificationRaw;
  if (options.requirementsRaw !== undefined) requirementsValue = options.requirementsRaw;
  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      KIDULTS_MARKET_CAPABILITY_MANIFEST_JSON: manifestValue,
      KIDULTS_MARKET_CAPABILITY_QUALIFICATION_JSON: qualificationValue,
      KIDULTS_MARKET_CAPABILITY_REQUIREMENTS_JSON: requirementsValue,
      KIDULTS_MARKET_CAPABILITY_OUTPUT: out,
    },
  });
  const report = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null;
  fs.rmSync(dir, { recursive: true, force: true });
  return { result, report };
}

test('routes current no-procurement bottleneck to open completed-transaction and liquidity discovery', () => {
  const candidates = [
    { sourceId: 'wikidata', displayName: 'Wikidata', sourceClass: 'REFERENCE_PUBLIC_DATA', blockingReasons: ['NO_SALES'], evidenceLinks: ['https://www.wikidata.org/'] },
    { sourceId: 'met', displayName: 'Met', sourceClass: 'INSTITUTION_ARCHIVE', blockingReasons: ['NO_SALES'], evidenceLinks: ['https://www.metmuseum.org/'] },
    { sourceId: 'aic', displayName: 'AIC', sourceClass: 'INSTITUTION_ARCHIVE', blockingReasons: ['NO_SALES'], evidenceLinks: ['https://www.artic.edu/'] },
    { sourceId: 'ebay-api', displayName: 'eBay', sourceClass: 'MARKETPLACE_API', blockingReasons: ['AUTH'], evidenceLinks: ['https://developer.ebay.com/'] },
    { sourceId: 'gsa-auctions', displayName: 'GSA', sourceClass: 'GOVERNMENT_AUCTION', blockingReasons: ['NO_API'], evidenceLinks: ['https://www.gsa.gov/'] },
  ];
  const rows = [
    { sourceId: 'wikidata', status: 'REJECTED_NO_QUALIFIED_MARKET_SEMANTICS', publicDocumentedAccess: true, explicitReuseRights: true, completedTransactionsQualified: false, liquidityQualified: false, authorizationRequired: false },
    { sourceId: 'met', status: 'REJECTED_NO_QUALIFIED_MARKET_SEMANTICS', publicDocumentedAccess: true, explicitReuseRights: true, completedTransactionsQualified: false, liquidityQualified: false, authorizationRequired: false },
    { sourceId: 'aic', status: 'REJECTED_NO_QUALIFIED_MARKET_SEMANTICS', publicDocumentedAccess: true, explicitReuseRights: true, completedTransactionsQualified: false, liquidityQualified: false, authorizationRequired: false },
    { sourceId: 'ebay-api', status: 'REQUIRES_AUTHORIZATION_NO_ACTION_TAKEN', publicDocumentedAccess: false, explicitReuseRights: false, completedTransactionsQualified: false, liquidityQualified: false, authorizationRequired: true },
    { sourceId: 'gsa-auctions', status: 'REJECTED_NO_QUALIFIED_MARKET_SEMANTICS', publicDocumentedAccess: false, explicitReuseRights: false, completedTransactionsQualified: false, liquidityQualified: false, authorizationRequired: false },
  ];
  const { result, report } = run(manifest(candidates), qualification(rows), requirements(), { useFiles: true });
  assert.equal(result.status, 0);
  assert.equal(report.schemaVersion, '1.1.0');
  assert.equal(report.metrics.candidates, 5);
  assert.equal(report.metrics.openRightsNearFitSources, 3);
  assert.equal(report.metrics.authorizationRequiredSources, 1);
  assert.equal(report.metrics.jointMarketSemanticGapSources, 5);
  assert.equal(report.capabilitySummary.DOCUMENTED_AUTOMATED_ACCESS.pass, 3);
  assert.equal(report.capabilitySummary.DOCUMENTED_AUTOMATED_ACCESS.authorizationRequired, 1);
  assert.equal(report.capabilitySummary.DOCUMENTED_AUTOMATED_ACCESS.missing, 1);
  assert.equal(report.capabilitySummary.EXPLICIT_COMMERCIAL_REUSE_RIGHTS.pass, 3);
  assert.equal(report.capabilitySummary.COMPLETED_TRANSACTION_SEMANTICS.missing, 5);
  assert.equal(report.capabilitySummary.TRANSACTION_BACKED_LIQUIDITY.missing, 5);
  assert.deepEqual(report.capabilityDeficitRanking.slice(0, 2).map((row) => row.capability), ['COMPLETED_TRANSACTION_SEMANTICS', 'TRANSACTION_BACKED_LIQUIDITY']);
  assert.equal(report.nextSafeLane, 'DISCOVER_OPEN_RIGHTS_QUALIFIED_COMPLETED_TRANSACTION_AND_LIQUIDITY_SOURCE');
  assert.equal(report.sourceDiscoveryWorkPacket.status, 'READY_FOR_OPEN_SOURCE_DISCOVERY');
  assert.equal(report.sourceDiscoveryWorkPacket.jointMarketSemanticGapSourceCount, 5);
  assert.deepEqual(report.sourceDiscoveryWorkPacket.openRightsNearFitSourceIds.sort(), ['aic', 'met', 'wikidata']);
  assert.equal(report.sourceDiscoveryWorkPacket.acceptanceContract.completedTransactionSemanticsRequired, true);
  assert.equal(report.sourceDiscoveryWorkPacket.acceptanceContract.transactionBackedLiquidityRequired, true);
  assert.equal(report.sourceDiscoveryWorkPacket.acceptanceContract.listingOrEstimateAcceptedAsTransaction, false);
  assert.ok(report.sourceDiscoveryWorkPacket.prohibitedActions.includes('UNAUTHORIZED_SCRAPING'));
  assert.ok(report.sourceDiscoveryWorkPacket.prohibitedActions.includes('PAID_PROVIDER_PROCUREMENT'));
  assert.equal(report.sourceDiscoveryWorkPacket.existingNearFitsAreNotMarketEvidenceSources, true);
  assert.equal(report.claims.evidenceProduced, false);
  assert.equal(report.claims.providerProcured, false);
  assert.equal(report.downstreamEvidenceContract.requiresTransactionId, true);
});

test('qualified open source routes only to downstream evidence-contract validation without certification', () => {
  const candidates = [{ sourceId: 'open-market', displayName: 'Open Market', sourceClass: 'PUBLIC_API', blockingReasons: [], evidenceLinks: ['https://example.org/api'] }];
  const rows = [{ sourceId: 'open-market', status: 'QUALIFIED_OPEN_NO_PROCUREMENT_SOURCE', publicDocumentedAccess: true, explicitReuseRights: true, completedTransactionsQualified: true, liquidityQualified: true, authorizationRequired: false }];
  const { result, report } = run(manifest(candidates), qualification(rows), requirements());
  assert.equal(result.status, 0);
  assert.equal(report.metrics.qualifiedOpenNoProcurementSources, 1);
  assert.equal(report.metrics.jointMarketSemanticGapSources, 0);
  assert.equal(report.rankedSources[0].automaticGapCount, 0);
  assert.equal(report.nextSafeLane, 'VALIDATE_OPEN_SOURCE_AGAINST_TRANSACTION_ID_VENUE_CURRENCY_TIMESTAMP_CONTRACT');
  assert.equal(report.sourceDiscoveryWorkPacket.status, 'NOT_REQUIRED_QUALIFIED_OPEN_SOURCE_PRESENT');
  assert.equal(report.claims.liveMarketEvidenceCertified, false);
});

test('structural identity mismatches fail closed and never produce evidence', () => {
  const candidates = [{}, { sourceId: 'missing-row' }, { sourceId: 'dup' }];
  const rows = [{}, { sourceId: 'dup', status: 'REJECTED_NO_QUALIFIED_MARKET_SEMANTICS' }, { sourceId: 'dup', status: 'REJECTED_NO_QUALIFIED_MARKET_SEMANTICS' }];
  const { result, report } = run(manifest(candidates), qualification(rows), requirements());
  assert.equal(result.status, 1);
  assert.ok(report.structuralErrors.includes('QUALIFICATION_SOURCE_ID_MISSING'));
  assert.ok(report.structuralErrors.includes('DUPLICATE_QUALIFICATION_SOURCE_ID:dup'));
  assert.ok(report.structuralErrors.includes('MANIFEST_SOURCE_ID_MISSING'));
  assert.ok(report.structuralErrors.includes('QUALIFICATION_ROW_MISSING:missing-row'));
  assert.equal(report.disposition, 'FAIL_CLOSED_MARKET_CAPABILITY_INPUT_INVALID');
  assert.equal(report.claims.evidenceProduced, false);
});

test('unsafe policy claims and evidence-contract relaxations fail before routing', () => {
  const safeManifest = manifest([]);
  const safeQualification = qualification([]);
  const safeRequirements = requirements();
  const invalidManifest = run({ ...safeManifest, policy: 'RELAXED' }, safeQualification, safeRequirements);
  assert.notEqual(invalidManifest.result.status, 0);
  assert.equal(invalidManifest.report, null);

  const invalidMode = run(safeManifest, { ...safeQualification, mode: 'BAD' }, safeRequirements);
  assert.notEqual(invalidMode.result.status, 0);
  assert.equal(invalidMode.report, null);

  const unsafeClaims = run(safeManifest, qualification([], { providerProcured: true }), safeRequirements);
  assert.notEqual(unsafeClaims.result.status, 0);
  assert.equal(unsafeClaims.report, null);

  const invalidRequirementsPolicy = run(safeManifest, safeQualification, { ...safeRequirements, policy: 'BAD' });
  assert.notEqual(invalidRequirementsPolicy.result.status, 0);
  assert.equal(invalidRequirementsPolicy.report, null);

  const missingPrimitive = run(safeManifest, safeQualification, requirements({ requiredPrimitives: ['LIQUIDITY'] }));
  assert.notEqual(missingPrimitive.result.status, 0);
  assert.equal(missingPrimitive.report, null);

  const unsafeContract = run(safeManifest, safeQualification, requirements({ requiresTransactionId: false }));
  assert.notEqual(unsafeContract.result.status, 0);
  assert.equal(unsafeContract.report, null);
});

test('missing or directory JSON inputs fail closed before routing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'market-capability-input-'));
  const missingPath = path.join(dir, 'missing.json');
  const missing = run(manifest([]), qualification([]), requirements(), { manifestRaw: missingPath });
  assert.notEqual(missing.result.status, 0);
  assert.equal(missing.report, null);

  const directory = run(manifest([]), qualification([]), requirements(), { qualificationRaw: dir });
  assert.notEqual(directory.result.status, 0);
  assert.equal(directory.report, null);
  fs.rmSync(dir, { recursive: true, force: true });
});
