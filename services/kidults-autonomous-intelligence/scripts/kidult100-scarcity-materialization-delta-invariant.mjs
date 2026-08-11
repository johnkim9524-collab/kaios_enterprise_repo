import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DEFAULT_POLICY = path.join(ROOT, 'config', 'kidult100-scarcity-materialization-delta-invariant.json');
const RIGHT_DATA_CONFIG = path.join(ROOT, 'config', 'kidult100-right-data-enrichment.json');
const DEFAULT_PRE = path.join(ROOT, 'reports', 'kidult100-right-data', 'right-data-pre-scarcity-materialization.json');
const DEFAULT_MATERIALIZATION = path.join(ROOT, 'reports', 'kidult100-right-data', 'scarcity-materialized-evidence-latest.json');
const DEFAULT_POST = path.join(ROOT, 'reports', 'kidult100-right-data', 'right-data-latest.json');
const DEFAULT_OUT = path.join(ROOT, 'reports', 'kidult100-right-data', 'scarcity-materialization-delta-invariant-latest.json');
const EPSILON = 1e-12;

function readJsonInput(value, fallbackPath) {
  const raw = value == null || String(value).trim() === '' ? fallbackPath : String(value).trim();
  if (raw.startsWith('{') || raw.startsWith('[')) return JSON.parse(raw);
  const resolved = path.isAbsolute(raw) ? raw : path.join(ROOT, raw);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) throw new Error(`Missing JSON input: ${resolved}`);
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

function closeEnough(a, b) {
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= EPSILON;
}

function setDiff(a, b) {
  return [...a].filter((value) => !b.has(value)).sort();
}

function sameSet(a, b) {
  return a.size === b.size && setDiff(a, b).length === 0;
}

function primitiveSet(candidate) {
  return new Set(Array.isArray(candidate?.rightData?.primitives) ? candidate.rightData.primitives : []);
}

function eligibleScarcity(candidate, policy) {
  return (candidate?.rightData?.evidence || []).filter((record) =>
    record?.primitive === policy.requiredPrimitive
    && record?.value?.signalType === policy.requiredSignalType
    && record?.safety?.synthetic !== true
    && record?.safety?.estimated !== true
    && record?.safety?.inferred !== true);
}

function indexCandidates(report, label, violations) {
  const map = new Map();
  if (!Array.isArray(report?.candidates)) {
    violations.push(`${label}_CANDIDATES_NOT_ARRAY`);
    return map;
  }
  for (const candidate of report.candidates) {
    const key = candidate?.candidateKey;
    if (!key) {
      violations.push(`${label}_MISSING_CANDIDATE_KEY`);
      continue;
    }
    if (map.has(key)) violations.push(`${label}_DUPLICATE_CANDIDATE_KEY:${key}`);
    else map.set(key, candidate);
  }
  return map;
}

function metricNumber(report, field, violations, label) {
  const value = Number(report?.metrics?.[field]);
  if (!Number.isFinite(value)) violations.push(`${label}_INVALID_METRIC:${field}`);
  return value;
}

const policy = readJsonInput(process.env.KIDULTS_SCARCITY_DELTA_POLICY_JSON, DEFAULT_POLICY);
const rightDataConfig = readJsonInput(null, RIGHT_DATA_CONFIG);
const pre = readJsonInput(process.env.KIDULTS_SCARCITY_DELTA_PRE_RIGHT_DATA_JSON, DEFAULT_PRE);
const materialization = readJsonInput(process.env.KIDULTS_SCARCITY_DELTA_MATERIALIZATION_JSON, DEFAULT_MATERIALIZATION);
const post = readJsonInput(process.env.KIDULTS_SCARCITY_DELTA_POST_RIGHT_DATA_JSON, DEFAULT_POST);
const outputRaw = process.env.KIDULTS_SCARCITY_DELTA_OUTPUT || DEFAULT_OUT;
const outputPath = path.isAbsolute(outputRaw) ? outputRaw : path.join(ROOT, outputRaw);

if (policy?.policy !== 'FAIL_CLOSED_SCARCITY_MATERIALIZATION_DELTA_INVARIANT') throw new Error('Invalid scarcity materialization delta invariant policy');
if (pre?.mode !== policy.requiredPreMode) throw new Error(`Invalid pre-materialization Right Data mode: ${pre?.mode || 'missing'}`);
if (post?.mode !== policy.requiredPostMode) throw new Error(`Invalid post-materialization Right Data mode: ${post?.mode || 'missing'}`);
if (materialization?.mode !== policy.requiredMaterializationMode) throw new Error(`Invalid scarcity materialization mode: ${materialization?.mode || 'missing'}`);
if (policy.requiredPrimitive !== 'SCARCITY' || policy.requiredSignalType !== 'TOTAL_PRODUCED') throw new Error('Invalid scarcity delta evidence contract');
for (const [key, value] of Object.entries(policy.rules || {})) if (value !== true) throw new Error(`Unsafe scarcity delta invariant rule: ${key}`);

const requiredPrimitives = rightDataConfig?.requiredPrimitives;
const marketRequires = rightDataConfig?.marketEvidenceDefinition?.requires;
if (!Array.isArray(requiredPrimitives) || requiredPrimitives.length === 0 || !requiredPrimitives.includes(policy.requiredPrimitive)) throw new Error('Invalid Right Data required primitive topology');
if (!Array.isArray(marketRequires) || marketRequires.length === 0) throw new Error('Invalid market evidence definition topology');

const violations = [];
const preMap = indexCandidates(pre, 'PRE', violations);
const postMap = indexCandidates(post, 'POST', violations);
const preKeys = new Set(preMap.keys());
const postKeys = new Set(postMap.keys());
if (!sameSet(preKeys, postKeys)) violations.push('CANDIDATE_UNIVERSE_CHANGED');

const materialized = Array.isArray(materialization?.evidence) ? materialization.evidence : [];
const rejectedMaterialization = Array.isArray(materialization?.rejectedMaterializationRecords) ? materialization.rejectedMaterializationRecords : [];
const materializedKeys = new Set();
if (Number(materialization?.metrics?.materializedRightDataEvidence) !== materialized.length) violations.push('MATERIALIZATION_METRIC_EVIDENCE_COUNT_MISMATCH');
if (Number(materialization?.metrics?.rejectedMaterializationRecords) !== rejectedMaterialization.length) violations.push('MATERIALIZATION_METRIC_REJECTED_COUNT_MISMATCH');
if (rejectedMaterialization.length > 0) violations.push('MATERIALIZATION_REJECTIONS_PRESENT');
if (Number(materialization?.metrics?.normalizedScoresGenerated || 0) !== 0) violations.push('MATERIALIZATION_NORMALIZED_SCORE_CLAIM_PRESENT');
if (Number(materialization?.metrics?.qualifiedProductionScores || 0) !== 0) violations.push('MATERIALIZATION_PRODUCTION_SCORE_CLAIM_PRESENT');
if (Number(materialization?.metrics?.marketEvidenceCreated || 0) !== 0) violations.push('MATERIALIZATION_MARKET_EVIDENCE_CLAIM_PRESENT');

for (const record of materialized) {
  const key = record?.candidateKey;
  if (!key || materializedKeys.has(key)) {
    violations.push(`INVALID_OR_DUPLICATE_MATERIALIZED_CANDIDATE:${key || 'missing'}`);
    continue;
  }
  materializedKeys.add(key);
  if (record?.primitive !== policy.requiredPrimitive || record?.value?.signalType !== policy.requiredSignalType) violations.push(`INVALID_MATERIALIZED_SIGNAL:${key}`);
  if (record?.evidenceClass !== policy.requiredEvidenceClass || record?.materializationStatus !== policy.requiredMaterializationStatus) violations.push(`INVALID_MATERIALIZATION_BOUNDARY:${key}`);
  if (record?.safety?.synthetic === true || record?.safety?.estimated === true || record?.safety?.inferred === true) violations.push(`UNSAFE_MATERIALIZED_QUANTITY:${key}`);
  if (record?.safety?.normalizedScoreGenerated !== false || record?.safety?.productionScoringActivated !== false || record?.safety?.marketEvidenceClaim !== false) violations.push(`UNSAFE_MATERIALIZED_CLAIMS:${key}`);
  if (Object.hasOwn(record?.value || {}, 'normalizedScore')) violations.push(`MATERIALIZED_NORMALIZED_SCORE_PRESENT:${key}`);
}

const preSemantic = new Set([...preMap].filter(([, candidate]) => candidate?.semanticRelevant === true).map(([key]) => key));
const postSemantic = new Set([...postMap].filter(([, candidate]) => candidate?.semanticRelevant === true).map(([key]) => key));
if (!sameSet(preSemantic, postSemantic)) violations.push('SEMANTIC_RELEVANT_UNIVERSE_CHANGED');

const expectedAddedScarcity = new Set();
for (const key of preKeys) {
  const before = preMap.get(key);
  const after = postMap.get(key);
  if (!after) continue;
  if (before?.semanticRelevant !== after?.semanticRelevant) violations.push(`SEMANTIC_RELEVANCE_CHANGED:${key}`);
  if (before?.canonicalTitle !== after?.canonicalTitle || before?.vertical !== after?.vertical) violations.push(`CANDIDATE_METADATA_CHANGED:${key}`);

  const beforePrimitives = primitiveSet(before);
  const afterPrimitives = primitiveSet(after);
  const added = setDiff(afterPrimitives, beforePrimitives);
  const removed = setDiff(beforePrimitives, afterPrimitives);
  const isMaterialized = materializedKeys.has(key);

  if (isMaterialized) {
    if (before?.semanticRelevant !== true) violations.push(`MATERIALIZED_CANDIDATE_NOT_SEMANTIC_RELEVANT:${key}`);
    if (beforePrimitives.has(policy.requiredPrimitive)) violations.push(`MATERIALIZED_CANDIDATE_ALREADY_HAD_SCARCITY_PRIMITIVE:${key}`);
    if (added.length !== 1 || added[0] !== policy.requiredPrimitive || removed.length !== 0) violations.push(`MATERIALIZED_CANDIDATE_PRIMITIVE_DELTA_INVALID:${key}`);
    else expectedAddedScarcity.add(key);
  } else if (added.length > 0 || removed.length > 0) {
    violations.push(`NON_MATERIALIZED_PRIMITIVE_DELTA:${key}`);
  }

  for (const reportCandidate of [before, after]) {
    const primitives = primitiveSet(reportCandidate);
    const expectedCoverage = requiredPrimitives.filter((primitive) => primitives.has(primitive)).length / requiredPrimitives.length;
    if (!closeEnough(Number(reportCandidate?.rightData?.requiredCoverage), expectedCoverage)) violations.push(`CANDIDATE_REQUIRED_COVERAGE_INCONSISTENT:${key}`);
    const expectedMarket = marketRequires.every((primitive) => primitives.has(primitive));
    if (reportCandidate?.rightData?.marketEvidencePresent !== expectedMarket) violations.push(`CANDIDATE_MARKET_EVIDENCE_FLAG_INCONSISTENT:${key}`);
  }
}

for (const record of materialized) {
  const key = record?.candidateKey;
  if (!key || !postMap.has(key)) continue;
  const matches = eligibleScarcity(postMap.get(key), policy).filter((candidateRecord) => candidateRecord?.payloadHash === record?.payloadHash);
  if (matches.length !== 1) violations.push(`MATERIALIZED_PAYLOAD_NOT_EXACTLY_PRESENT_POST_RIGHT_DATA:${key}`);
}

const preScarcityKeys = new Set([...preMap].filter(([, candidate]) => eligibleScarcity(candidate, policy).length > 0).map(([key]) => key));
const postScarcityKeys = new Set([...postMap].filter(([, candidate]) => eligibleScarcity(candidate, policy).length > 0).map(([key]) => key));
const scarcityAdded = new Set(setDiff(postScarcityKeys, preScarcityKeys));
const scarcityRemoved = setDiff(preScarcityKeys, postScarcityKeys);
if (!sameSet(scarcityAdded, expectedAddedScarcity) || !sameSet(scarcityAdded, materializedKeys)) violations.push('SCARCITY_EVIDENCE_DELTA_DOES_NOT_MATCH_MATERIALIZATION');
if (scarcityRemoved.length > 0) violations.push('EXISTING_SCARCITY_EVIDENCE_DISAPPEARED');

const preTotal = metricNumber(pre, 'totalNormalizedCandidates', violations, 'PRE');
const postTotal = metricNumber(post, 'totalNormalizedCandidates', violations, 'POST');
const preRelevant = metricNumber(pre, 'semanticRelevantCandidates', violations, 'PRE');
const postRelevant = metricNumber(post, 'semanticRelevantCandidates', violations, 'POST');
if (preTotal !== preMap.size || postTotal !== postMap.size || preTotal !== postTotal) violations.push('TOTAL_CANDIDATE_METRIC_INVARIANT_FAILED');
if (preRelevant !== preSemantic.size || postRelevant !== postSemantic.size || preRelevant !== postRelevant) violations.push('SEMANTIC_RELEVANT_METRIC_INVARIANT_FAILED');

const preAccepted = metricNumber(pre, 'providerEvidenceAccepted', violations, 'PRE');
const postAccepted = metricNumber(post, 'providerEvidenceAccepted', violations, 'POST');
const preRejected = metricNumber(pre, 'providerEvidenceRejected', violations, 'PRE');
const postRejected = metricNumber(post, 'providerEvidenceRejected', violations, 'POST');
if (postAccepted - preAccepted !== materialized.length) violations.push('PROVIDER_EVIDENCE_ACCEPTED_DELTA_MISMATCH');
if (postRejected !== preRejected) violations.push('PROVIDER_EVIDENCE_REJECTED_CHANGED');

const prePrimitiveCoverage = pre?.metrics?.primitiveCoverage || {};
const postPrimitiveCoverage = post?.metrics?.primitiveCoverage || {};
for (const primitive of requiredPrimitives) {
  const before = Number(prePrimitiveCoverage[primitive]);
  const after = Number(postPrimitiveCoverage[primitive]);
  if (!Number.isFinite(before) || !Number.isFinite(after)) {
    violations.push(`INVALID_PRIMITIVE_COVERAGE:${primitive}`);
    continue;
  }
  if (primitive === policy.requiredPrimitive) {
    const expected = preRelevant > 0 ? before + materialized.length / preRelevant : before;
    if (!closeEnough(after, expected)) violations.push('SCARCITY_PRIMITIVE_COVERAGE_DELTA_MISMATCH');
  } else if (!closeEnough(after, before)) {
    violations.push(`NON_SCARCITY_PRIMITIVE_COVERAGE_CHANGED:${primitive}`);
  }
}

const preRightDataCoverage = metricNumber(pre, 'requiredRightDataCoverage', violations, 'PRE');
const postRightDataCoverage = metricNumber(post, 'requiredRightDataCoverage', violations, 'POST');
const expectedRightDataCoverage = preRelevant > 0
  ? preRightDataCoverage + materialized.length / (preRelevant * requiredPrimitives.length)
  : preRightDataCoverage;
if (!closeEnough(postRightDataCoverage, expectedRightDataCoverage)) violations.push('REQUIRED_RIGHT_DATA_COVERAGE_DELTA_MISMATCH');

const preMarketCoverage = metricNumber(pre, 'marketEvidenceCoverage', violations, 'PRE');
const postMarketCoverage = metricNumber(post, 'marketEvidenceCoverage', violations, 'POST');
if (!closeEnough(preMarketCoverage, postMarketCoverage)) violations.push('MARKET_EVIDENCE_COVERAGE_CHANGED');

function recomputeDecisionGrade(map) {
  return [...map.values()].filter((candidate) =>
    candidate?.semanticRelevant === true
    && Number(candidate?.rightData?.requiredCoverage) >= 0.9
    && candidate?.rightData?.marketEvidencePresent === true).length;
}
const recomputedPreDecisionGrade = recomputeDecisionGrade(preMap);
const recomputedPostDecisionGrade = recomputeDecisionGrade(postMap);
const preDecisionGrade = metricNumber(pre, 'decisionGradeCandidates', violations, 'PRE');
const postDecisionGrade = metricNumber(post, 'decisionGradeCandidates', violations, 'POST');
if (preDecisionGrade !== recomputedPreDecisionGrade || postDecisionGrade !== recomputedPostDecisionGrade) violations.push('DECISION_GRADE_METRIC_INCONSISTENT');

const uniqueViolations = [...new Set(violations)];
const disposition = uniqueViolations.length > 0
  ? 'FAIL_CLOSED_SCARCITY_MATERIALIZATION_DELTA_INVARIANT_VIOLATION'
  : materialized.length > 0
    ? 'SCARCITY_MATERIALIZATION_DELTA_VERIFIED_EXACT'
    : 'ZERO_MATERIALIZATION_DELTA_VERIFIED_NO_DATA_CHANGE';

const report = {
  schemaVersion: '1.0.0',
  mode: 'KIDULT100_SCARCITY_MATERIALIZATION_DELTA_INVARIANT',
  generatedAt: new Date().toISOString(),
  policy: policy.policy,
  metrics: {
    totalCandidatesBefore: preMap.size,
    totalCandidatesAfter: postMap.size,
    semanticRelevantBefore: preSemantic.size,
    semanticRelevantAfter: postSemantic.size,
    materializedRightDataEvidence: materialized.length,
    eligibleScarcityCandidatesBefore: preScarcityKeys.size,
    eligibleScarcityCandidatesAfter: postScarcityKeys.size,
    scarcityCandidateDelta: postScarcityKeys.size - preScarcityKeys.size,
    providerEvidenceAcceptedBefore: preAccepted,
    providerEvidenceAcceptedAfter: postAccepted,
    providerEvidenceAcceptedDelta: postAccepted - preAccepted,
    requiredRightDataCoverageBefore: preRightDataCoverage,
    requiredRightDataCoverageAfter: postRightDataCoverage,
    requiredRightDataCoverageExpectedAfter: expectedRightDataCoverage,
    marketEvidenceCoverageBefore: preMarketCoverage,
    marketEvidenceCoverageAfter: postMarketCoverage,
    decisionGradeCandidatesBefore: preDecisionGrade,
    decisionGradeCandidatesAfter: postDecisionGrade,
    invariantViolations: uniqueViolations.length,
  },
  claims: {
    candidateUniverseStable: sameSet(preKeys, postKeys),
    semanticRelevantUniverseStable: sameSet(preSemantic, postSemantic),
    scarcityDeltaMatchesMaterializedEvidence: sameSet(scarcityAdded, materializedKeys) && scarcityRemoved.length === 0,
    nonScarcityPrimitiveCoverageStable: requiredPrimitives.filter((primitive) => primitive !== policy.requiredPrimitive).every((primitive) => closeEnough(Number(prePrimitiveCoverage[primitive]), Number(postPrimitiveCoverage[primitive]))),
    marketEvidenceCoverageStable: closeEnough(preMarketCoverage, postMarketCoverage),
    normalizedScoreGenerated: false,
    productionScoringActivated: false,
    marketEvidenceCreatedByScarcityMaterialization: false,
    unauthorizedScrapingUsed: false,
    paidProviderProcured: false,
    contractExecuted: false,
  },
  disposition,
  violations: uniqueViolations,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
console.log(`Scarcity materialization delta invariant: materialized=${materialized.length} scarcityDelta=${report.metrics.scarcityCandidateDelta} providerDelta=${report.metrics.providerEvidenceAcceptedDelta} violations=${uniqueViolations.length}`);
console.log(`rightData before=${preRightDataCoverage} after=${postRightDataCoverage} expected=${expectedRightDataCoverage}`);
console.log(`disposition=${disposition}`);
if (uniqueViolations.length > 0) process.exitCode = 1;
