import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'kidult100-provider-evidence-contract.json'), 'utf8'));
const OUT_PATH = path.join(ROOT, CONFIG.output);
fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });

function parseEvidencePayload(value) {
  if (!value) return [];
  const trimmed = String(value).trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : Array.isArray(parsed.evidence) ? parsed.evidence : [];
  }
  const resolved = path.isAbsolute(trimmed) ? trimmed : path.join(ROOT, trimmed);
  if (!fs.existsSync(resolved)) return [];
  const parsed = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  return Array.isArray(parsed) ? parsed : Array.isArray(parsed.evidence) ? parsed.evidence : [];
}

function loadInputEvidence() {
  const rows = [];
  for (const file of CONFIG.input.optionalSnapshotFiles || []) {
    const resolved = path.join(ROOT, file);
    if (fs.existsSync(resolved)) rows.push(...parseEvidencePayload(resolved));
  }
  const envName = CONFIG.input.environmentVariable;
  if (envName && process.env[envName]) rows.push(...parseEvidencePayload(process.env[envName]));
  return rows;
}

function nonEmpty(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function baseValidation(record) {
  const reasons = [];
  if (!record || typeof record !== 'object' || Array.isArray(record)) return ['NOT_OBJECT'];
  for (const field of CONFIG.baseRequiredFields) {
    if (!nonEmpty(record[field])) reasons.push(`MISSING_${field}`);
  }
  if (record.evidenceClass && !CONFIG.allowedEvidenceClasses.includes(record.evidenceClass)) reasons.push('EVIDENCE_CLASS_NOT_ALLOWED');
  if (record.observedAt && !Number.isFinite(Date.parse(record.observedAt))) reasons.push('INVALID_observedAt');
  return reasons;
}

function marketSafetyFlags(record) {
  return record?.safety || {};
}

function validateTransaction(record) {
  const reasons = [];
  const policy = CONFIG.marketEvidence.transactionPriceComparable;
  if (record.evidenceClass !== CONFIG.marketEvidence.requiredEvidenceClass) reasons.push('MARKET_EVIDENCE_CLASS_REQUIRED');
  if (!CONFIG.marketEvidence.allowedRightsClasses.includes(record.rightsClass)) reasons.push('MARKET_RIGHTS_CLASS_NOT_ALLOWED');
  const value = record.value && typeof record.value === 'object' ? record.value : {};
  for (const field of policy.requiredValueFields) if (!nonEmpty(value[field])) reasons.push(`MISSING_value.${field}`);
  if (nonEmpty(value.transactionType) && !policy.allowedTransactionTypes.includes(value.transactionType)) reasons.push('TRANSACTION_TYPE_NOT_EXECUTED_SALE');
  if (policy.disallowedTransactionTypes.includes(value.transactionType)) reasons.push('DISALLOWED_TRANSACTION_TYPE');
  if (nonEmpty(value.price) && !(Number(value.price) > 0)) reasons.push('PRICE_MUST_BE_POSITIVE');
  if (nonEmpty(value.transactionAt) && !Number.isFinite(Date.parse(value.transactionAt))) reasons.push('INVALID_TRANSACTION_TIME');
  const safety = marketSafetyFlags(record);
  if (safety.synthetic === true) reasons.push('SYNTHETIC_MARKET_EVIDENCE_FORBIDDEN');
  if (safety.estimated === true) reasons.push('ESTIMATED_MARKET_EVIDENCE_FORBIDDEN');
  if (safety.listingOnly === true) reasons.push('LISTING_ONLY_NOT_TRANSACTION');
  return reasons;
}

function validateLiquidity(record) {
  const reasons = [];
  const policy = CONFIG.marketEvidence.liquidity;
  if (record.evidenceClass !== CONFIG.marketEvidence.requiredEvidenceClass) reasons.push('MARKET_EVIDENCE_CLASS_REQUIRED');
  if (!CONFIG.marketEvidence.allowedRightsClasses.includes(record.rightsClass)) reasons.push('MARKET_RIGHTS_CLASS_NOT_ALLOWED');
  const value = record.value && typeof record.value === 'object' ? record.value : {};
  for (const field of policy.requiredValueFields) if (!nonEmpty(value[field])) reasons.push(`MISSING_value.${field}`);
  if (nonEmpty(value.completedTransactions) && Number(value.completedTransactions) < policy.minimumCompletedTransactions) reasons.push('INSUFFICIENT_COMPLETED_TRANSACTIONS');
  if (nonEmpty(value.derivationMethod) && !policy.allowedDerivationMethods.includes(value.derivationMethod)) reasons.push('LIQUIDITY_DERIVATION_NOT_ALLOWED');
  if (!Array.isArray(value.supportingTransactionIds) || value.supportingTransactionIds.length < policy.minimumCompletedTransactions) reasons.push('INSUFFICIENT_SUPPORTING_TRANSACTION_IDS');
  if (nonEmpty(value.windowStart) && !Number.isFinite(Date.parse(value.windowStart))) reasons.push('INVALID_WINDOW_START');
  if (nonEmpty(value.windowEnd) && !Number.isFinite(Date.parse(value.windowEnd))) reasons.push('INVALID_WINDOW_END');
  const safety = marketSafetyFlags(record);
  if (safety.synthetic === true) reasons.push('SYNTHETIC_MARKET_EVIDENCE_FORBIDDEN');
  if (safety.estimated === true) reasons.push('ESTIMATED_MARKET_EVIDENCE_FORBIDDEN');
  return reasons;
}

function validateRecord(record) {
  const reasons = baseValidation(record);
  if (reasons.length) return reasons;
  if (record.primitive === 'TRANSACTION_PRICE_COMPARABLE') reasons.push(...validateTransaction(record));
  if (record.primitive === 'LIQUIDITY') reasons.push(...validateLiquidity(record));
  return [...new Set(reasons)];
}

const input = loadInputEvidence();
const accepted = [];
const rejected = [];
for (const record of input) {
  const reasons = validateRecord(record);
  if (reasons.length) rejected.push({ candidateKey: record?.candidateKey || null, primitive: record?.primitive || null, reasons });
  else accepted.push(record);
}

const marketAccepted = accepted.filter((row) => CONFIG.marketEvidence.primitives.includes(row.primitive));
const output = {
  schemaVersion: '1.0.0',
  mode: 'KIDULT100_PROVIDER_EVIDENCE_VALIDATION',
  generatedAt: new Date().toISOString(),
  policy: CONFIG.policy,
  metrics: {
    inputRecords: input.length,
    acceptedRecords: accepted.length,
    rejectedRecords: rejected.length,
    acceptedTransactionComparables: marketAccepted.filter((row) => row.primitive === 'TRANSACTION_PRICE_COMPARABLE').length,
    acceptedLiquidityRecords: marketAccepted.filter((row) => row.primitive === 'LIQUIDITY').length,
  },
  claims: {
    syntheticMarketEvidenceAccepted: false,
    estimatedMarketEvidenceAccepted: false,
    listingPriceAcceptedAsTransaction: false,
    marketEvidencePresent: marketAccepted.length > 0,
  },
  evidence: accepted,
  rejected,
};

fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));
console.log(`Provider evidence validation: input=${input.length} accepted=${accepted.length} rejected=${rejected.length}`);
console.log(`market transaction=${output.metrics.acceptedTransactionComparables} liquidity=${output.metrics.acceptedLiquidityRecords}`);

if (rejected.length > 0) {
  console.error('Provider evidence validation rejected one or more records; fail closed.');
  process.exitCode = 1;
}
