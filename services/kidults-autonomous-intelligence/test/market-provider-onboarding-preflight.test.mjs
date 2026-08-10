import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'scripts', 'kidult100-market-provider-onboarding-preflight.mjs');
const OUT = path.join(ROOT, 'reports', 'kidult100-right-data', 'market-provider-onboarding-preflight-latest.json');

function writeJson(root, relativePath, value) {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(value, null, 2));
}

function runPreflight(cwd) {
  return spawnSync(process.execPath, [SCRIPT], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, NODE_ENV: 'test' },
  });
}

test('provider onboarding preflight is structurally valid and remains external dependency with zero approved providers', () => {
  const result = runPreflight(ROOT);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /config=PASS/);
  const report = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  assert.equal(report.metrics.coreVerticals, 8);
  assert.equal(report.metrics.requirementVerticals, 8);
  assert.equal(report.readiness.configurationValid, true);
  assert.equal(report.readiness.providerOnboardingReady, false);
  assert.equal(report.readiness.marketEvidenceAvailable, false);
  assert.equal(report.readiness.disposition, 'EXTERNAL_DEPENDENCY_NO_APPROVED_PROVIDER');
  assert.equal(report.claims.providerProcured, false);
  assert.equal(report.claims.contractExecuted, false);
  assert.equal(report.claims.liveMarketEvidenceCertified, false);
  for (const vertical of report.requirements.verticals) {
    assert.equal(vertical.minimumCoverage, 0.9);
    assert.ok(vertical.minimumCompletedTransactionsPerCandidate >= 2);
  }
});

test('provider onboarding preflight exercises fail-closed configuration, blocked-provider and ready-provider paths', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-provider-preflight-'));
  try {
    writeJson(tempRoot, 'config/kidult100-poc-source-plan.json', {
      coreVerticals: [{ id: 'vertical-a' }, { id: 'vertical-b' }],
    });
    writeJson(tempRoot, 'config/kidult100-market-evidence-requirements.json', {
      policy: 'FAIL_CLOSED_TEST_POLICY',
      verticals: [
        { id: 'vertical-a', minimumCoverage: 0, minimumCompletedTransactionsPerCandidate: 1 },
        { id: 'vertical-a', minimumCoverage: 1.2, minimumCompletedTransactionsPerCandidate: 0 },
      ],
    });
    writeJson(tempRoot, 'config/kidult100-market-adapter-registry.json', {
      providerContract: {
        requiredAuthorizationStatus: 'APPROVED',
        allowedRightsClasses: ['LICENSED_COMMERCIAL_DATA'],
      },
      providers: [
        null,
        {
          providerId: 'BLOCKED_PROVIDER',
          enabled: false,
          authorizationStatus: 'PENDING',
          authorizationId: '',
          rightsClass: 'UNKNOWN_RIGHTS',
          allowedHosts: [],
        },
        {
          providerId: 'READY_PROVIDER',
          enabled: true,
          authorizationStatus: 'APPROVED',
          authorizationId: 'test-authorization-only',
          rightsClass: 'LICENSED_COMMERCIAL_DATA',
          allowedHosts: ['market.example.invalid'],
        },
      ],
    });
    writeJson(tempRoot, 'config/kidult100-market-source-rights.json', {
      providers: [
        { providerId: 'BLOCKED_PROVIDER', rightsClass: 'LICENSED_COMMERCIAL_DATA' },
        { providerId: 'READY_PROVIDER', rightsClass: 'LICENSED_COMMERCIAL_DATA' },
      ],
    });

    const result = runPreflight(tempRoot);
    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.match(result.stdout, /config=FAIL providers=3 ready=1 blocked=2/);
    assert.match(result.stdout, /FAIL_CLOSED_INVALID_CONFIGURATION/);

    const reportPath = path.join(tempRoot, 'reports', 'kidult100-right-data', 'market-provider-onboarding-preflight-latest.json');
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    assert.equal(report.metrics.structuralErrors, 6);
    assert.equal(report.metrics.registeredProviders, 3);
    assert.equal(report.metrics.readyProviders, 1);
    assert.equal(report.metrics.blockedProviders, 2);
    assert.equal(report.readiness.configurationValid, false);
    assert.equal(report.readiness.providerOnboardingReady, false);
    assert.equal(report.readiness.disposition, 'FAIL_CLOSED_INVALID_CONFIGURATION');
    assert.deepEqual(report.readyProviders, ['READY_PROVIDER']);
    assert.deepEqual(report.blockedProviders[0], { providerId: null, reasons: ['INVALID_PROVIDER_RECORD'] });
    assert.deepEqual(report.blockedProviders[1], {
      providerId: 'BLOCKED_PROVIDER',
      reasons: [
        'PROVIDER_DISABLED',
        'AUTHORIZATION_NOT_APPROVED',
        'AUTHORIZATION_ID_MISSING',
        'RIGHTS_CLASS_NOT_ALLOWED',
        'SOURCE_HOST_ALLOWLIST_MISSING',
        'RIGHTS_MATRIX_MISMATCH',
      ],
    });
    assert.ok(report.errors.includes('DUPLICATE_VERTICAL_REQUIREMENT'));
    assert.ok(report.errors.includes('MISSING_VERTICAL_REQUIREMENT:vertical-b'));
    assert.ok(report.errors.includes('INVALID_MINIMUM_COVERAGE:vertical-a'));
    assert.ok(report.errors.includes('INVALID_LIQUIDITY_TRANSACTION_MINIMUM:vertical-a'));
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('provider onboarding preflight blocks an otherwise valid provider when the rights matrix entry is absent', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-provider-preflight-rights-'));
  try {
    writeJson(tempRoot, 'config/kidult100-poc-source-plan.json', {
      coreVerticals: [{ id: 'vertical-a' }],
    });
    writeJson(tempRoot, 'config/kidult100-market-evidence-requirements.json', {
      policy: 'FAIL_CLOSED_TEST_POLICY',
      verticals: [{ id: 'vertical-a', minimumCoverage: 0.9, minimumCompletedTransactionsPerCandidate: 2 }],
    });
    writeJson(tempRoot, 'config/kidult100-market-adapter-registry.json', {
      providerContract: {
        requiredAuthorizationStatus: 'APPROVED',
        allowedRightsClasses: ['LICENSED_COMMERCIAL_DATA'],
      },
      providers: [{
        providerId: 'NO_RIGHTS_ENTRY',
        enabled: true,
        authorizationStatus: 'APPROVED',
        authorizationId: 'test-authorization-only',
        rightsClass: 'LICENSED_COMMERCIAL_DATA',
        allowedHosts: ['market.example.invalid'],
      }],
    });
    writeJson(tempRoot, 'config/kidult100-market-source-rights.json', { providers: [] });

    const result = runPreflight(tempRoot);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /config=PASS providers=1 ready=0 blocked=1/);
    assert.match(result.stdout, /EXTERNAL_DEPENDENCY_NO_APPROVED_PROVIDER/);

    const reportPath = path.join(tempRoot, 'reports', 'kidult100-right-data', 'market-provider-onboarding-preflight-latest.json');
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    assert.deepEqual(report.blockedProviders, [{
      providerId: 'NO_RIGHTS_ENTRY',
      reasons: ['RIGHTS_MATRIX_ENTRY_MISSING'],
    }]);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
