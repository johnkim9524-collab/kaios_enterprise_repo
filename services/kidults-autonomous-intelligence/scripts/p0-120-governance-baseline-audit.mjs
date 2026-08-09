import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const REPO_ROOT = path.resolve(ROOT, '..', '..');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function existsFromRepo(relativePath) {
  return fs.existsSync(path.join(REPO_ROOT, relativePath));
}

const provider = readJson('policy/p0-provider-governance-baseline.json');
const operations = readJson('policy/p0-operational-kpi-baseline.json');
const sre = readJson('policy/p0-sre-reliability-baseline.json');

const checks = [
  ['PROVIDER_LIVE_FALSE', provider.liveProviderCertified === false],
  ['PROVIDER_SELECTION_CLASSES', ['MUST_HAVE', 'CONDITIONAL', 'EXCLUDE'].every((x) => provider.selectionClasses?.includes(x))],
  ['PROVIDER_THREE_SOURCE_TOPOLOGY', Boolean(provider.topology?.primary && provider.topology?.independentVerification && provider.topology?.fallback)],
  ['PROVIDER_RIGHTS_FAIL_CLOSED', provider.failClosedRules?.unknownRights === 'BLOCK_COMMERCIAL_USE'],
  ['PROVIDER_LIVE_CERT_FAIL_CLOSED', provider.failClosedRules?.liveCertificationWithoutEvidence === 'FORBIDDEN'],
  ['OPERATIONS_LIVE_FALSE', operations.liveOperationalCertified === false],
  ['INTERVENTION_TARGET', operations.unattendedOperations?.routineInterventionRateMax <= 0.01],
  ['SELF_RECOVERY_TARGET', operations.unattendedOperations?.selfRecoveryTargetMin >= 0.95],
  ['SILENT_FAILURE_ZERO', operations.unattendedOperations?.criticalSilentFailureMax === 0],
  ['HUMAN_AUTHORITY_BOUNDARY', ['legal', 'financial', 'strategic', 'security', 'provider-contract'].every((x) => operations.unattendedOperations?.humanAuthorityRequiredFor?.includes(x))],
  ['EFFICIENCY_KPIS_PRESENT', operations.efficiencyMetrics?.length >= 8],
  ['RELIABILITY_EVIDENCE_PRESENT', operations.reliabilityEvidenceRequired?.length >= 10],
  ['SRE_LIVE_FALSE', sre.liveOperationalCertified === false],
  ['SECURITY_SRE_RUNBOOK', existsFromRepo('docs/kidults/hardening/SECURITY_SRE_RUNBOOK_BASELINE.md')],
  ['PROVIDER_MATRIX_DOC', existsFromRepo('docs/kidults/hardening/PROVIDER_REQUIREMENTS_RIGHTS_MATRIX.md')],
  ['GA_RUNTIME_ARCHITECTURE_DOC', existsFromRepo('docs/kidults/hardening/GA_RUNTIME_ARCHITECTURE_1_0.md')],
  ['PRODUCT_VALUE_CONTRACT_DOC', existsFromRepo('docs/kidults/hardening/PRODUCT_VALUE_MONETIZATION_CONTRACT.md')],
  ['HISTORICAL_GRAPH_DOC', existsFromRepo('docs/kidults/hardening/HISTORICAL_INTELLIGENCE_GRAPH_BASELINE.md')]
].map(([id, passed]) => ({ id, passed: Boolean(passed) }));

const failed = checks.filter((x) => !x.passed);
const report = {
  schemaVersion: '1.0.0',
  generatedAt: new Date().toISOString(),
  status: failed.length === 0 ? 'PASS_BASELINE' : 'FAIL',
  evidenceClass: 'STATIC_CONTROL_AND_DESIGN_EVIDENCE',
  liveDataCertified: false,
  liveOperationalCertified: false,
  commercialValidationCertified: false,
  checks,
  counts: { total: checks.length, passed: checks.length - failed.length, failed: failed.length },
  explicitLimitations: [
    'This audit validates internal #210 governance/design controls only.',
    'It does not certify authoritative live data, executed provider rights, live operations, or customer willingness-to-pay.'
  ]
};

const outDir = path.join(ROOT, 'reports', 'engineering-hardening');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'governance-baseline-latest.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));

if (failed.length > 0) process.exit(1);
