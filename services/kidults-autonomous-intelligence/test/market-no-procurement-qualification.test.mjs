import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'scripts', 'kidult100-market-no-procurement-qualification.mjs');

function manifest(candidates) {
  return { policy: 'FAIL_CLOSED_SOURCE_QUALIFICATION_NO_AUTO_ONBOARDING', candidates };
}

function audit(assessed) {
  return {
    mode: 'KIDULT100_MARKET_SOURCE_QUALIFICATION_AUDIT',
    assessed,
    claims: {
      providerProcured: false,
      contractExecuted: false,
      providerAutomaticallyActivated: false,
      liveMarketEvidenceCertified: false,
    },
  };
}

function run(manifestInput, auditInput, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'market-no-procurement-'));
  const out = path.join(dir, 'out.json');
  let manifestValue = JSON.stringify(manifestInput);
  let auditValue = JSON.stringify(auditInput);
  if (options.useFiles) {
    const manifestPath = path.join(dir, 'manifest.json');
    const auditPath = path.join(dir, 'audit.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifestInput));
    fs.writeFileSync(auditPath, JSON.stringify(auditInput));
    manifestValue = manifestPath;
    auditValue = auditPath;
  }
  if (options.manifestRaw !== undefined) manifestValue = options.manifestRaw;
  if (options.auditRaw !== undefined) auditValue = options.auditRaw;
  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      KIDULTS_MARKET_NO_PROCUREMENT_MANIFEST_JSON: manifestValue,
      KIDULTS_MARKET_NO_PROCUREMENT_AUDIT_JSON: auditValue,
      KIDULTS_MARKET_NO_PROCUREMENT_OUTPUT: out,
    },
  });
  const report = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null;
  fs.rmSync(dir, { recursive: true, force: true });
  return { result, report };
}

test('separates open qualified, authorization required, and rejected sources without activating evidence', () => {
  const candidates = [
    {
      sourceId: 'open-feed', displayName: 'Open Feed', sourceClass: 'PUBLIC_API', rightsStatus: 'EXPLICIT_CC0', automationAccess: 'PUBLIC_DOCUMENTED_API', qualification: 'QUALIFIED_FOR_PROVIDER_ONBOARDING', blockingReasons: [], evidenceLinks: ['https://example.org/docs'],
    },
    {
      sourceId: 'licensed', displayName: 'Licensed Feed', sourceClass: 'MARKETPLACE_API', rightsStatus: 'API_LICENSE_AND_USE_TERMS_REQUIRED', automationAccess: 'PRODUCTION_APPROVAL_AND_AUTHORIZATION_REQUIRED', qualification: 'NOT_QUALIFIED_AUTHORIZATION_REQUIRED', blockingReasons: ['AUTH_REQUIRED'], evidenceLinks: ['https://example.org/license'],
    },
    {
      sourceId: 'archive', displayName: 'Archive', sourceClass: 'INSTITUTION_ARCHIVE', rightsStatus: 'EXPLICIT_CC0_OPEN_ACCESS', automationAccess: 'PUBLIC_DOCUMENTED_API', qualification: 'NOT_QUALIFIED_MARKET_SEMANTICS', blockingReasons: ['NO_TRANSACTIONS'], evidenceLinks: ['https://example.org/archive'],
    },
  ];
  const assessed = [
    { sourceId: 'open-feed', rightsReusable: true, completedTransactionsQualified: true, liquidityQualified: true },
    { sourceId: 'licensed', rightsReusable: false, completedTransactionsQualified: true, liquidityQualified: false },
    { sourceId: 'archive', rightsReusable: true, completedTransactionsQualified: false, liquidityQualified: false },
  ];
  const { result, report } = run(manifest(candidates), audit(assessed), { useFiles: true });
  assert.equal(result.status, 0);
  assert.equal(report.metrics.qualifiedOpenNoProcurementSources, 1);
  assert.equal(report.metrics.authorizationRequiredSources, 1);
  assert.equal(report.metrics.rejectedSources, 1);
  assert.equal(report.claims.evidenceProduced, false);
  assert.equal(report.claims.providerProcured, false);
  assert.equal(report.rows.find((row) => row.sourceId === 'licensed').status, 'REQUIRES_AUTHORIZATION_NO_ACTION_TAKEN');
});

test('current-style open archives without completed transaction and liquidity semantics remain rejected', () => {
  const candidates = [{
    sourceId: 'wikidata', displayName: 'Wikidata', sourceClass: 'REFERENCE_PUBLIC_DATA', rightsStatus: 'EXPLICIT_CC0', automationAccess: 'PUBLIC_DOCUMENTED_DATA_ACCESS', qualification: 'NOT_QUALIFIED_MARKET_SEMANTICS', blockingReasons: ['NO_MARKET_FEED'], evidenceLinks: ['https://www.wikidata.org/wiki/Wikidata:Licensing'],
  }];
  const assessed = [{ sourceId: 'wikidata', rightsReusable: true, completedTransactionsQualified: false, liquidityQualified: false }];
  const { result, report } = run(manifest(candidates), audit(assessed));
  assert.equal(result.status, 0);
  assert.equal(report.metrics.qualifiedOpenNoProcurementSources, 0);
  assert.equal(report.disposition, 'NO_OPEN_NO_PROCUREMENT_MARKET_SOURCE_CURRENTLY_QUALIFIED');
});

test('missing audit rows and unsafe upstream claims fail closed', () => {
  const candidate = { sourceId: 'x', displayName: 'X', sourceClass: 'PUBLIC_API', rightsStatus: 'EXPLICIT_CC0', automationAccess: 'PUBLIC_DOCUMENTED_API', qualification: 'NOT_QUALIFIED_MARKET_SEMANTICS', blockingReasons: [], evidenceLinks: ['https://example.org'] };
  const missing = run(manifest([candidate]), audit([]));
  assert.equal(missing.result.status, 1);
  assert.ok(missing.report.structuralErrors.includes('AUDIT_ROW_MISSING:x'));

  const unsafeAudit = audit([{ sourceId: 'x', rightsReusable: true, completedTransactionsQualified: false, liquidityQualified: false }]);
  unsafeAudit.claims.providerProcured = true;
  const unsafe = run(manifest([candidate]), unsafeAudit);
  assert.notEqual(unsafe.result.status, 0);
  assert.equal(unsafe.report, null);
});

test('malformed audit and manifest identities are reported fail-closed without producing evidence', () => {
  const malformedAudit = audit([{}, { sourceId: 'dup' }, { sourceId: 'dup' }]);
  const malformedManifest = manifest([{}, null]);
  const { result, report } = run(malformedManifest, malformedAudit);
  assert.equal(result.status, 1);
  assert.ok(report.structuralErrors.includes('AUDIT_SOURCE_ID_MISSING'));
  assert.ok(report.structuralErrors.includes('DUPLICATE_AUDIT_SOURCE_ID:dup'));
  assert.ok(report.structuralErrors.includes('MANIFEST_SOURCE_ID_MISSING'));
  assert.equal(report.claims.evidenceProduced, false);
});

test('missing or directory JSON inputs fail closed before qualification', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'market-no-procurement-input-'));
  const missingPath = path.join(dir, 'missing.json');
  const missing = run(manifest([]), audit([]), { manifestRaw: missingPath });
  assert.notEqual(missing.result.status, 0);
  assert.equal(missing.report, null);

  const directory = run(manifest([]), audit([]), { auditRaw: dir });
  assert.notEqual(directory.result.status, 0);
  assert.equal(directory.report, null);
  fs.rmSync(dir, { recursive: true, force: true });
});
