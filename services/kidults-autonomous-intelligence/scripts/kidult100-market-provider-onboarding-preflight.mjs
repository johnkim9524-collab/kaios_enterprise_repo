import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'kidult100-market-adapter-registry.json'), 'utf8'));
const rights = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'kidult100-market-source-rights.json'), 'utf8'));
const requirements = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'kidult100-market-evidence-requirements.json'), 'utf8'));
const sourcePlan = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'kidult100-poc-source-plan.json'), 'utf8'));
const OUT_DIR = path.join(ROOT, 'reports', 'kidult100-right-data');
const OUT = path.join(OUT_DIR, 'market-provider-onboarding-preflight-latest.json');
fs.mkdirSync(OUT_DIR, { recursive: true });

const errors = [];
const verticalIds = sourcePlan.coreVerticals.map((v) => v.id);
const requirementIds = requirements.verticals.map((v) => v.id);
if (new Set(requirementIds).size !== requirementIds.length) errors.push('DUPLICATE_VERTICAL_REQUIREMENT');
for (const id of verticalIds) if (!requirementIds.includes(id)) errors.push(`MISSING_VERTICAL_REQUIREMENT:${id}`);
for (const item of requirements.verticals) {
  if (!(item.minimumCoverage > 0 && item.minimumCoverage <= 1)) errors.push(`INVALID_MINIMUM_COVERAGE:${item.id}`);
  if (!(item.minimumCompletedTransactionsPerCandidate >= 2)) errors.push(`INVALID_LIQUIDITY_TRANSACTION_MINIMUM:${item.id}`);
}

const providers = Array.isArray(registry.providers) ? registry.providers : [];
const rightsProviders = Array.isArray(rights.providers) ? rights.providers : [];
const readyProviders = [];
const blockedProviders = [];
for (const provider of providers) {
  const reasons = [];
  if (!provider || typeof provider !== 'object') { blockedProviders.push({ providerId: null, reasons: ['INVALID_PROVIDER_RECORD'] }); continue; }
  if (provider.enabled !== true) reasons.push('PROVIDER_DISABLED');
  if (provider.authorizationStatus !== registry.providerContract.requiredAuthorizationStatus) reasons.push('AUTHORIZATION_NOT_APPROVED');
  if (!provider.authorizationId) reasons.push('AUTHORIZATION_ID_MISSING');
  if (!registry.providerContract.allowedRightsClasses.includes(provider.rightsClass)) reasons.push('RIGHTS_CLASS_NOT_ALLOWED');
  if (!Array.isArray(provider.allowedHosts) || provider.allowedHosts.length === 0) reasons.push('SOURCE_HOST_ALLOWLIST_MISSING');
  const rightsEntry = rightsProviders.find((row) => row?.providerId === provider.providerId);
  if (!rightsEntry) reasons.push('RIGHTS_MATRIX_ENTRY_MISSING');
  if (rightsEntry && rightsEntry.rightsClass !== provider.rightsClass) reasons.push('RIGHTS_MATRIX_MISMATCH');
  if (reasons.length) blockedProviders.push({ providerId: provider.providerId || null, reasons });
  else readyProviders.push(provider.providerId);
}

const output = {
  schemaVersion: '1.0.0',
  mode: 'KIDULT100_MARKET_PROVIDER_ONBOARDING_PREFLIGHT',
  generatedAt: new Date().toISOString(),
  policy: requirements.policy,
  metrics: {
    coreVerticals: verticalIds.length,
    requirementVerticals: requirementIds.length,
    registeredProviders: providers.length,
    readyProviders: readyProviders.length,
    blockedProviders: blockedProviders.length,
    structuralErrors: errors.length,
  },
  readiness: {
    configurationValid: errors.length === 0,
    providerOnboardingReady: errors.length === 0 && readyProviders.length > 0,
    marketEvidenceAvailable: false,
    disposition: errors.length ? 'FAIL_CLOSED_INVALID_CONFIGURATION' : readyProviders.length ? 'READY_FOR_AUTHORIZED_PROVIDER_INPUT' : 'EXTERNAL_DEPENDENCY_NO_APPROVED_PROVIDER',
  },
  requirements,
  readyProviders,
  blockedProviders,
  errors,
  claims: {
    providerProcured: false,
    contractExecuted: false,
    liveMarketEvidenceCertified: false,
    syntheticMarketEvidenceUsed: false,
  },
};

fs.writeFileSync(OUT, JSON.stringify(output, null, 2));
console.log(`Market provider onboarding preflight: config=${output.readiness.configurationValid ? 'PASS' : 'FAIL'} providers=${providers.length} ready=${readyProviders.length} blocked=${blockedProviders.length}`);
console.log(`disposition=${output.readiness.disposition}`);
if (errors.length) process.exitCode = 1;
