import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DEFAULT_CURRENT_UNIVERSE = path.join(ROOT, 'reports', 'live-open-data', 'kidult-100-universe-latest.json');
const DEFAULT_CURRENT_MARKET = path.join(ROOT, 'reports', 'kidult100-right-data', 'validated-provider-evidence-latest.json');
const DEFAULT_CURRENT_RIGHT_DATA = path.join(ROOT, 'reports', 'kidult100-right-data', 'right-data-latest.json');
const DEFAULT_OUT = path.join(ROOT, 'reports', 'live-open-data', 'collection-delta-kpi-latest.json');

function resolveInput(value, fallbackPath, { optional = false } = {}) {
  const supplied = value != null && String(value).trim() !== '';
  const raw = supplied ? String(value).trim() : String(fallbackPath || '').trim();
  if (!raw) {
    if (optional) return null;
    throw new Error('Missing required JSON input');
  }
  if (raw.startsWith('{') || raw.startsWith('[')) return JSON.parse(raw);
  const resolved = path.isAbsolute(raw) ? raw : path.join(ROOT, raw);
  if (!fs.existsSync(resolved)) {
    if (optional) return null;
    throw new Error(`Missing JSON input: ${resolved}`);
  }
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) {
    if (optional) return null;
    throw new Error(`JSON input is not a file: ${resolved}`);
  }
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

function identity(record) {
  if (!record || !record.source || record.sourceRecordId == null) return null;
  return `${record.source}:${record.sourceRecordId}`;
}

function constituentMap(universe) {
  const map = new Map();
  const invalid = [];
  for (const record of universe?.constituents || []) {
    const key = identity(record);
    if (!key || !record.payloadHash) {
      invalid.push(record);
      continue;
    }
    if (map.has(key)) throw new Error(`Duplicate constituent identity in snapshot: ${key}`);
    map.set(key, record);
  }
  return { map, invalid };
}

function uniqueTransactionIds(marketReport) {
  if (!marketReport) return null;
  const ids = new Set();
  for (const row of marketReport.evidence || []) {
    if (row?.primitive !== 'TRANSACTION_PRICE_COMPARABLE') continue;
    const id = row?.value?.transactionId;
    if (id != null && String(id).trim() !== '') ids.add(String(id));
  }
  return ids.size;
}

function decisionGradeCount(rightDataReport) {
  if (!rightDataReport) return null;
  const metric = Number(rightDataReport?.metrics?.decisionGradeCandidates);
  if (Number.isFinite(metric) && metric >= 0) return metric;
  const candidates = Array.isArray(rightDataReport.candidates) ? rightDataReport.candidates : [];
  return candidates.filter((candidate) => candidate?.semanticRelevant === true
    && Number(candidate?.rightData?.requiredCoverage) >= 0.9
    && candidate?.rightData?.marketEvidencePresent === true).length;
}

const currentUniverse = resolveInput(process.env.KIDULTS_CURRENT_UNIVERSE_JSON, DEFAULT_CURRENT_UNIVERSE);
const previousUniverse = resolveInput(process.env.KIDULTS_PREVIOUS_UNIVERSE_JSON, '', { optional: true });
const currentMarket = resolveInput(process.env.KIDULTS_CURRENT_VALIDATED_MARKET_JSON, DEFAULT_CURRENT_MARKET, { optional: true });
const previousMarket = resolveInput(process.env.KIDULTS_PREVIOUS_VALIDATED_MARKET_JSON, '', { optional: true });
const currentRightData = resolveInput(process.env.KIDULTS_CURRENT_RIGHT_DATA_JSON, DEFAULT_CURRENT_RIGHT_DATA, { optional: true });
const previousRightData = resolveInput(process.env.KIDULTS_PREVIOUS_RIGHT_DATA_JSON, '', { optional: true });
const outPathRaw = process.env.KIDULTS_COLLECTION_DELTA_KPI_OUTPUT || DEFAULT_OUT;
const outPath = path.isAbsolute(outPathRaw) ? outPathRaw : path.join(ROOT, outPathRaw);

const current = constituentMap(currentUniverse);
if (current.invalid.length > 0) throw new Error(`Current universe has ${current.invalid.length} records without identity/payloadHash`);

let deltaMode = 'BASELINE_NO_PRIOR_SNAPSHOT';
let newRecords = null;
let changedRecords = null;
let unchangedRecords = null;
let removedRecords = null;
let reobservedRecords = null;
let previousObservedRecords = null;

if (previousUniverse) {
  const previous = constituentMap(previousUniverse);
  if (previous.invalid.length > 0) throw new Error(`Previous universe has ${previous.invalid.length} records without identity/payloadHash`);
  deltaMode = 'CROSS_RUN_DELTA';
  previousObservedRecords = previous.map.size;
  newRecords = 0;
  changedRecords = 0;
  unchangedRecords = 0;
  removedRecords = 0;
  for (const [key, record] of current.map) {
    const prior = previous.map.get(key);
    if (!prior) newRecords += 1;
    else if (prior.payloadHash === record.payloadHash) unchangedRecords += 1;
    else changedRecords += 1;
  }
  for (const key of previous.map.keys()) if (!current.map.has(key)) removedRecords += 1;
  reobservedRecords = changedRecords + unchangedRecords;
}

const currentUniqueTransactions = uniqueTransactionIds(currentMarket);
const previousUniqueTransactions = uniqueTransactionIds(previousMarket);
const currentDecisionGrade = decisionGradeCount(currentRightData);
const previousDecisionGrade = decisionGradeCount(previousRightData);

const report = {
  schemaVersion: '1.0.0',
  mode: 'KIDULTS_COLLECTION_DELTA_KPI',
  generatedAt: new Date().toISOString(),
  deltaMode,
  identityContract: 'source + sourceRecordId',
  changeContract: 'payloadHash inequality for same identity',
  metrics: {
    observed: current.map.size,
    previousObserved: previousObservedRecords,
    new: newRecords,
    changed: changedRecords,
    unchanged: unchangedRecords,
    reobserved: reobservedRecords,
    removed: removedRecords,
    uniqueTransactions: currentUniqueTransactions,
    uniqueTransactionGain: currentUniqueTransactions != null && previousUniqueTransactions != null
      ? currentUniqueTransactions - previousUniqueTransactions
      : null,
    decisionGradeCandidates: currentDecisionGrade,
    decisionGradeGain: currentDecisionGrade != null && previousDecisionGrade != null
      ? currentDecisionGrade - previousDecisionGrade
      : null,
  },
  evaluation: {
    deltaEvaluated: previousUniverse != null,
    marketTransactionKpiEvaluated: currentMarket != null,
    marketTransactionGainEvaluated: currentMarket != null && previousMarket != null,
    decisionGradeKpiEvaluated: currentRightData != null,
    decisionGradeGainEvaluated: currentRightData != null && previousRightData != null,
  },
  claims: {
    repeatedUnchangedObservationCountedAsNew: false,
    repeatedTransactionIdCountedMoreThanOnce: false,
    baselineSnapshotClaimedAsNetNew: false,
    syntheticEvidenceUsed: false,
  },
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(`Collection delta KPI: mode=${deltaMode} observed=${report.metrics.observed} new=${report.metrics.new} changed=${report.metrics.changed} unchanged=${report.metrics.unchanged}`);
console.log(`uniqueTransactions=${report.metrics.uniqueTransactions} transactionGain=${report.metrics.uniqueTransactionGain} decisionGrade=${report.metrics.decisionGradeCandidates} decisionGradeGain=${report.metrics.decisionGradeGain}`);
