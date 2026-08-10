import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'kidult100-market-adapter-registry.json'), 'utf8'));
const RIGHTS = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'kidult100-market-source-rights.json'), 'utf8'));
const EVIDENCE = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'kidult100-provider-evidence-contract.json'), 'utf8'));
const OUT_PATH = path.join(ROOT, CONFIG.output);
fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });

function parseRows(value) {
  if (!value) return [];
  const trimmed = String(value).trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : Array.isArray(parsed.events) ? parsed.events : [];
  }
  const resolved = path.isAbsolute(trimmed) ? trimmed : path.join(ROOT, trimmed);
  if (!fs.existsSync(resolved)) return [];
  const parsed = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  return Array.isArray(parsed) ? parsed : Array.isArray(parsed.events) ? parsed.events : [];
}

function loadEvents() {
  const rows = [];
  for (const file of CONFIG.input.optionalSnapshotFiles || []) {
    const resolved = path.join(ROOT, file);
    if (fs.existsSync(resolved)) rows.push(...parseRows(resolved));
  }
  const envName = CONFIG.input.environmentVariable;
  if (envName && process.env[envName]) rows.push(...parseRows(process.env[envName]));
  return rows;
}

function loadProviders() {
  if (process.env.NODE_ENV === 'test' && process.env.KIDULTS_TEST_MARKET_ADAPTER_REGISTRY_JSON) {
    const parsed = JSON.parse(process.env.KIDULTS_TEST_MARKET_ADAPTER_REGISTRY_JSON);
    return Array.isArray(parsed) ? parsed : Array.isArray(parsed.providers) ? parsed.providers : [];
  }
  return CONFIG.providers || [];
}

function nonEmpty(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function urlHost(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' ? parsed.hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

function providerErrors(provider) {
  if (!provider || typeof provider !== 'object' || Array.isArray(provider)) return ['PROVIDER_NOT_OBJECT'];
  const reasons = [];
  for (const field of CONFIG.providerContract.requiredFields) if (!nonEmpty(provider[field])) reasons.push(`PROVIDER_MISSING_${field}`);
  if (provider.enabled !== true) reasons.push('PROVIDER_NOT_ENABLED');
  if (provider.authorizationStatus !== CONFIG.providerContract.requiredAuthorizationStatus) reasons.push('PROVIDER_NOT_APPROVED');
  if (!CONFIG.providerContract.allowedRightsClasses.includes(provider.rightsClass)) reasons.push('PROVIDER_RIGHTS_CLASS_NOT_ALLOWED');
  if (!RIGHTS.acceptedRightsClasses.includes(provider.rightsClass)) reasons.push('PROVIDER_RIGHTS_MATRIX_MISMATCH');
  if (!Array.isArray(provider.allowedHosts) || provider.allowedHosts.length === 0) reasons.push('PROVIDER_HOST_ALLOWLIST_REQUIRED');
  return [...new Set(reasons)];
}

function eventErrors(event, provider) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) return ['EVENT_NOT_OBJECT'];
  const reasons = [];
  for (const field of CONFIG.eventContract.requiredFields) if (!nonEmpty(event[field])) reasons.push(`EVENT_MISSING_${field}`);
  if (!CONFIG.eventContract.allowedEventTypes.includes(event.eventType)) reasons.push('EVENT_TYPE_NOT_ALLOWED');
  if (event.observedAt && !Number.isFinite(Date.parse(event.observedAt))) reasons.push('INVALID_observedAt');
  if (!provider) return [...new Set([...reasons, 'PROVIDER_NOT_REGISTERED'])];
  if (providerErrors(provider).length) reasons.push('PROVIDER_AUTHORIZATION_INVALID');
  if (event.rightsClass !== provider.rightsClass) reasons.push('EVENT_RIGHTS_CLASS_MISMATCH');
  const host = urlHost(event.sourceUrl);
  const allowedHosts = Array.isArray(provider.allowedHosts) ? provider.allowedHosts.map((value) => String(value).toLowerCase()) : [];
  if (!host || !allowedHosts.includes(host)) reasons.push('SOURCE_HOST_NOT_AUTHORIZED');
  const safety = event.safety || {};
  if (safety.synthetic === true) reasons.push('SYNTHETIC_MARKET_EVIDENCE_FORBIDDEN');
  if (safety.estimated === true) reasons.push('ESTIMATED_MARKET_EVIDENCE_FORBIDDEN');
  if (safety.listingOnly === true) reasons.push('LISTING_ONLY_NOT_MARKET_EVIDENCE');

  const value = event.value && typeof event.value === 'object' ? event.value : {};
  if (event.eventType === 'EXECUTED_TRANSACTION') {
    const policy = EVIDENCE.marketEvidence.transactionPriceComparable;
    for (const field of policy.requiredValueFields) if (!nonEmpty(value[field])) reasons.push(`EVENT_MISSING_value.${field}`);
    if (nonEmpty(value.transactionType) && !policy.allowedTransactionTypes.includes(value.transactionType)) reasons.push('TRANSACTION_TYPE_NOT_EXECUTED_SALE');
    if (nonEmpty(value.price) && !(Number(value.price) > 0)) reasons.push('PRICE_MUST_BE_POSITIVE');
    if (nonEmpty(value.transactionAt) && !Number.isFinite(Date.parse(value.transactionAt))) reasons.push('INVALID_TRANSACTION_TIME');
  }
  if (event.eventType === 'LIQUIDITY_OBSERVATION') {
    const policy = EVIDENCE.marketEvidence.liquidity;
    for (const field of policy.requiredValueFields) if (!nonEmpty(value[field])) reasons.push(`EVENT_MISSING_value.${field}`);
    if (nonEmpty(value.completedTransactions) && Number(value.completedTransactions) < policy.minimumCompletedTransactions) reasons.push('INSUFFICIENT_COMPLETED_TRANSACTIONS');
    if (nonEmpty(value.derivationMethod) && !policy.allowedDerivationMethods.includes(value.derivationMethod)) reasons.push('LIQUIDITY_DERIVATION_NOT_ALLOWED');
    if (!Array.isArray(value.supportingTransactionIds) || value.supportingTransactionIds.length < policy.minimumCompletedTransactions) reasons.push('INSUFFICIENT_SUPPORTING_TRANSACTION_IDS');
  }
  return [...new Set(reasons)];
}

function normalize(event, provider) {
  return {
    candidateKey: event.candidateKey,
    primitive: event.eventType === 'EXECUTED_TRANSACTION' ? 'TRANSACTION_PRICE_COMPARABLE' : 'LIQUIDITY',
    source: provider.providerId,
    sourceClass: CONFIG.providerContract.sourceClass,
    sourceUrl: event.sourceUrl,
    rightsClass: event.rightsClass,
    observedAt: event.observedAt,
    payloadHash: event.payloadHash,
    evidenceClass: EVIDENCE.marketEvidence.requiredEvidenceClass,
    providerAuthorization: {
      providerId: provider.providerId,
      authorizationId: provider.authorizationId,
      registryVersion: CONFIG.schemaVersion,
      verified: true
    },
    safety: { synthetic: false, estimated: false, listingOnly: false },
    value: event.value
  };
}

const providers = loadProviders();
const providerMap = new Map(providers.filter((provider) => provider && typeof provider === 'object').map((provider) => [provider.providerId, provider]));
const registryRejected = providers
  .map((provider) => ({ providerId: provider?.providerId || null, reasons: providerErrors(provider) }))
  .filter((row) => row.reasons.length > 0);
const events = loadEvents();
const accepted = [];
const rejected = [];
for (const event of events) {
  const provider = event && typeof event === 'object' ? providerMap.get(event.providerId) : null;
  const reasons = eventErrors(event, provider);
  if (reasons.length) rejected.push({ providerId: event?.providerId || null, candidateKey: event?.candidateKey || null, eventType: event?.eventType || null, reasons });
  else accepted.push(normalize(event, provider));
}

const output = {
  schemaVersion: '1.0.0',
  mode: 'KIDULT100_RIGHTS_FIRST_MARKET_ADAPTER_NORMALIZATION',
  generatedAt: new Date().toISOString(),
  policy: CONFIG.policy,
  metrics: {
    registeredProviders: providers.length,
    approvedEnabledProviders: providers.filter((provider) => providerErrors(provider).length === 0).length,
    inputEvents: events.length,
    normalizedEvidenceRecords: accepted.length,
    rejectedEvents: rejected.length,
    rejectedRegistryEntries: registryRejected.length
  },
  claims: {
    normalizationOnly: true,
    liveEvidenceCertified: false,
    marketEvidenceCertified: false,
    syntheticOrEstimatedEvidenceGenerated: false,
    unauthorizedProviderEvidenceAccepted: false
  },
  evidence: accepted,
  rejected,
  registryRejected
};

fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));
console.log(`Market adapter normalization: providers=${providers.length} approved=${output.metrics.approvedEnabledProviders} input=${events.length} normalized=${accepted.length} rejected=${rejected.length}`);

if (registryRejected.length > 0 || rejected.length > 0) {
  console.error('Market adapter normalization rejected unauthorized or invalid input; fail closed.');
  process.exitCode = 1;
}
