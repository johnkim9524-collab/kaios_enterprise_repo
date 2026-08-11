import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DEFAULT_POLICY = path.join(ROOT, 'config', 'kidult100-reference-precision-policy.json');
const DEFAULT_INPUT = path.join(ROOT, 'reports', 'kidult100-poc', 'kidult100-poc-latest.json');
const DEFAULT_AUDIT = path.join(ROOT, 'reports', 'kidult100-poc', 'kidult100-reference-precision-hardening-latest.json');

function readJsonInput(value, fallbackPath) {
  const raw = value == null || String(value).trim() === '' ? fallbackPath : String(value).trim();
  if (raw.startsWith('{') || raw.startsWith('[')) return JSON.parse(raw);
  const resolved = path.isAbsolute(raw) ? raw : path.join(ROOT, raw);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) throw new Error(`Missing JSON input: ${resolved}`);
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

function resolveOutput(value, fallbackPath) {
  const raw = value == null || String(value).trim() === '' ? fallbackPath : String(value).trim();
  return path.isAbsolute(raw) ? raw : path.join(ROOT, raw);
}

function normalize(value) {
  return String(value || '').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function tokens(value) {
  return normalize(value).split(/\s+/).filter((token) => token.length >= 2);
}

function includesPhrase(text, phrase) {
  const haystack = ` ${normalize(text)} `;
  const needle = normalize(phrase);
  return needle.length > 0 && haystack.includes(` ${needle} `);
}

function phraseHits(text, phrases) {
  return (Array.isArray(phrases) ? phrases : []).filter((phrase) => includesPhrase(text, phrase));
}

function hasModelSpecificity(title) {
  const raw = String(title || '');
  return /\b[A-Za-z]{1,8}[- ]?\d{1,5}[A-Za-z]?\b/.test(raw)
    || /\b\d{2,4}[-–]\d{2,4}\b/.test(raw)
    || /\b(model|series|mark|mk)\b/i.test(raw);
}

function validatePolicy(policy) {
  if (policy?.policy !== 'FAIL_CLOSED_STAGE2_REFERENCE_PRODUCT_PRECISION_HARDENING') throw new Error('Invalid reference precision policy');
  if (!policy?.requiredInputMode || !policy?.targetSourceClass || !policy?.semanticStage) throw new Error('Incomplete reference precision policy identity');
  if (!Array.isArray(policy?.genericQueries) || !Array.isArray(policy?.queryStopTokens)) throw new Error('Reference precision policy requires query controls');
  if (!policy?.productObjectTermsByVertical || !policy?.disallowedDescriptionTermsByVertical) throw new Error('Reference precision policy requires vertical term maps');
  const requiredRules = [
    'neverUpgradePreviouslyIrrelevant', 'genericQueryResultsRejected', 'disallowedDescriptionOverridesProductTerm',
    'queryAnchorRequired', 'productObjectContextRequired', 'modelSpecificExactTitleMayPassWithoutDescription',
    'modelSpecificAllAnchorsMayPassWithoutDescription', 'preserveRightsAndProvenance', 'rewriteGeneratedPocReportOnly',
  ];
  for (const key of requiredRules) if (policy?.rules?.[key] !== true) throw new Error(`Unsafe reference precision rule: ${key}`);
  for (const [key, value] of Object.entries(policy?.safety || {})) if (value !== false) throw new Error(`Unsafe reference precision safety flag: ${key}`);
}

function queryContext(candidate, policy) {
  const query = normalize(candidate.query);
  const combined = normalize(`${candidate.canonicalTitle || ''} ${candidate.description || ''}`);
  const stop = new Set((policy.queryStopTokens || []).map(normalize));
  const anchors = tokens(query).filter((token) => !stop.has(token));
  const contextTokens = new Set(tokens(combined));
  const anchorHits = anchors.filter((token) => contextTokens.has(token));
  const allAnchorsMatched = anchors.length > 0 && anchorHits.length === anchors.length;
  const exactTitleQuery = query.length > 0 && normalize(candidate.canonicalTitle) === query;
  return { anchors, anchorHits, allAnchorsMatched, exactTitleQuery };
}

function evaluate(candidate, policy) {
  const productTerms = policy.productObjectTermsByVertical[candidate.vertical];
  const disallowedTerms = policy.disallowedDescriptionTermsByVertical[candidate.vertical];
  if (!Array.isArray(productTerms) || !Array.isArray(disallowedTerms)) {
    return { passed: false, structuralError: `UNKNOWN_VERTICAL:${candidate.vertical || 'missing'}`, reasons: ['UNKNOWN_VERTICAL_REFERENCE_TERMS'], diagnostics: {} };
  }
  const genericQuery = (policy.genericQueries || []).map(normalize).includes(normalize(candidate.query));
  const productTitleHits = phraseHits(candidate.canonicalTitle, productTerms);
  const productDescriptionHits = phraseHits(candidate.description, productTerms);
  const disallowedHits = phraseHits(candidate.description, disallowedTerms);
  const query = queryContext(candidate, policy);
  const modelSpecific = hasModelSpecificity(candidate.canonicalTitle);
  const reasons = [];
  let passed = true;

  if (genericQuery) {
    passed = false;
    reasons.push('REFERENCE_GENERIC_QUERY_NOT_ENTITY_CANDIDATE');
  } else if (disallowedHits.length > 0) {
    passed = false;
    reasons.push('REFERENCE_DISALLOWED_ENTITY_OR_MEDIA_CONTEXT');
  } else if (query.anchorHits.length === 0) {
    passed = false;
    reasons.push('REFERENCE_QUERY_ANCHOR_MISMATCH');
  } else if (productDescriptionHits.length > 0) {
    reasons.push('REFERENCE_PRODUCT_DESCRIPTION_CONFIRMED');
  } else if (productTitleHits.length > 0) {
    reasons.push('REFERENCE_PRODUCT_TITLE_CONFIRMED');
  } else if (query.exactTitleQuery && modelSpecific && !candidate.description) {
    reasons.push('REFERENCE_MODEL_SPECIFIC_EXACT_TITLE_CONFIRMED');
  } else if (query.allAnchorsMatched && modelSpecific && !candidate.description) {
    reasons.push('REFERENCE_MODEL_SPECIFIC_ALL_QUERY_ANCHORS_CONFIRMED');
  } else {
    passed = false;
    reasons.push('REFERENCE_PRODUCT_OBJECT_CONTEXT_MISSING');
  }

  return {
    passed,
    structuralError: null,
    reasons,
    diagnostics: { genericQuery, productTitleHits, productDescriptionHits, disallowedHits, ...query, modelSpecific },
  };
}

function stableIdentity(candidate) {
  return {
    candidateKey: candidate.candidateKey,
    source: candidate.source,
    sourceClass: candidate.sourceClass,
    sourceRecordId: candidate.sourceRecordId,
    sourceUrl: candidate.sourceUrl,
    rightsClass: candidate.rightsClass,
    observedAt: candidate.observedAt,
    payloadHash: candidate.payloadHash,
  };
}

const policy = readJsonInput(process.env.KIDULTS_REFERENCE_PRECISION_POLICY_JSON, DEFAULT_POLICY);
const report = readJsonInput(process.env.KIDULTS_REFERENCE_PRECISION_INPUT_JSON, DEFAULT_INPUT);
const outputPath = resolveOutput(process.env.KIDULTS_REFERENCE_PRECISION_OUTPUT, DEFAULT_INPUT);
const auditPath = resolveOutput(process.env.KIDULTS_REFERENCE_PRECISION_AUDIT_OUTPUT, DEFAULT_AUDIT);

validatePolicy(policy);
if (report?.mode !== policy.requiredInputMode) throw new Error(`Invalid POC mode: ${report?.mode || 'missing'}`);
if (!Array.isArray(report?.candidates)) throw new Error('POC report candidates must be an array');

const seen = new Set();
for (const candidate of report.candidates) {
  if (!candidate?.candidateKey) throw new Error('POC candidate missing candidateKey');
  if (seen.has(candidate.candidateKey)) throw new Error(`Duplicate POC candidateKey: ${candidate.candidateKey}`);
  seen.add(candidate.candidateKey);
}

const beforeIdentity = new Map(report.candidates.map((candidate) => [candidate.candidateKey, stableIdentity(candidate)]));
const inputRelevant = report.candidates.filter((candidate) => candidate.semanticRelevant).length;
const evaluated = [];
const downgraded = [];
let structuralErrors = 0;

const candidates = report.candidates.map((candidate) => {
  if (!candidate.semanticRelevant) {
    return {
      ...candidate,
      semanticStageD: { name: policy.semanticStage, passed: false, disposition: 'NOT_EVALUATED_PREVIOUSLY_IRRELEVANT', reasons: ['NEVER_UPGRADE_PREVIOUSLY_IRRELEVANT'] },
    };
  }
  if (candidate.sourceClass !== policy.targetSourceClass) {
    return {
      ...candidate,
      semanticStageD: { name: policy.semanticStage, passed: true, disposition: 'NOT_APPLICABLE_NON_REFERENCE_SOURCE', reasons: ['NON_REFERENCE_SOURCE_PRESERVED'] },
    };
  }
  const result = evaluate(candidate, policy);
  if (result.structuralError) structuralErrors += 1;
  const row = {
    candidateKey: candidate.candidateKey,
    canonicalTitle: candidate.canonicalTitle || null,
    vertical: candidate.vertical || null,
    source: candidate.source || null,
    query: candidate.query || null,
    passed: result.passed,
    reasons: result.reasons,
    diagnostics: result.diagnostics,
  };
  evaluated.push(row);
  if (!result.passed) downgraded.push(row);
  return {
    ...candidate,
    semanticRelevant: result.passed,
    semanticStageD: {
      name: policy.semanticStage,
      passed: result.passed,
      disposition: result.passed ? 'REFERENCE_PRODUCT_OBJECT_PRECISION_CONFIRMED' : 'REFERENCE_FALSE_POSITIVE_DOWNGRADED',
      reasons: result.reasons,
      diagnostics: result.diagnostics,
    },
  };
});

if (structuralErrors > 0) throw new Error(`Reference precision structural errors: ${structuralErrors}`);
for (const candidate of candidates) {
  if (JSON.stringify(beforeIdentity.get(candidate.candidateKey)) !== JSON.stringify(stableIdentity(candidate))) throw new Error(`Rights/provenance identity mutated: ${candidate.candidateKey}`);
}

const relevantCandidates = candidates.filter((candidate) => candidate.semanticRelevant);
const recallCandidates = candidates.filter((candidate) => candidate.semanticStageA?.passed);
const verticalIds = Object.keys(policy.productObjectTermsByVertical);
const sourceIds = [...new Set(candidates.map((candidate) => candidate.source).filter(Boolean))];
const relevantByVertical = Object.fromEntries(verticalIds.map((vertical) => [vertical, relevantCandidates.filter((candidate) => candidate.vertical === vertical).length]));
const relevantBySource = Object.fromEntries(sourceIds.map((source) => [source, relevantCandidates.filter((candidate) => candidate.source === source).length]));
const downgradedByVertical = Object.fromEntries(verticalIds.map((vertical) => [vertical, downgraded.filter((row) => row.vertical === vertical).length]));

const hardened = {
  ...report,
  schemaVersion: '2.7.1',
  semanticPolicy: {
    ...(report.semanticPolicy || {}),
    version: 'SEMANTIC_V2_4_REFERENCE_PRECISION_HARDENED',
    stageD: policy.semanticStage,
    sourceNativeReferenceAcceptedWithoutObjectProof: false,
    principle: 'Reference-public search results require at least one query anchor plus vertical product-object proof; model-specific no-description variants may pass only when every distinctive query anchor matches; related people, media, companies, places and generic classes do not count as candidate supply.',
  },
  metrics: {
    ...(report.metrics || {}),
    semanticRelevantCandidates: relevantCandidates.length,
    semanticPrecisionRejectedCandidates: Math.max(0, recallCandidates.length - relevantCandidates.length),
    semanticReferencePrecisionRejectedCandidates: downgraded.length,
    semanticRelevanceCoverage: candidates.length ? relevantCandidates.length / candidates.length : 0,
    relevantByVertical,
    relevantBySource,
  },
  candidateBuild: {
    ...(report.candidateBuild || {}),
    outcome: 'BUILT_REFERENCE_PRECISION_HARDENED_NOT_CERTIFIED',
    note: 'Stage D only downgrades reference-public false positives or retains high-specificity anchored model variants; it does not create evidence, scores, or weaken provenance/rights.',
  },
  claims: {
    ...(report.claims || {}),
    referenceProductObjectPrecisionHardeningApplied: true,
    decisionGradeRightDataCertified: false,
    finalKidult100Certified: false,
  },
  candidates,
};

const audit = {
  schemaVersion: '1.0.1',
  mode: 'KIDULT100_STAGE2_REFERENCE_PRODUCT_PRECISION_HARDENING',
  generatedAt: new Date().toISOString(),
  policy: policy.policy,
  metrics: {
    inputCandidates: report.candidates.length,
    inputRelevantCandidates: inputRelevant,
    referenceRelevantEvaluated: evaluated.length,
    referenceRelevantRetained: evaluated.length - downgraded.length,
    referenceFalsePositivesDowngraded: downgraded.length,
    outputRelevantCandidates: relevantCandidates.length,
    outputSemanticRelevanceCoverage: candidates.length ? relevantCandidates.length / candidates.length : 0,
    downgradedByVertical,
    structuralErrors,
  },
  safety: {
    syntheticEvidenceCreated: false,
    liveEvidenceClaimCreated: false,
    marketEvidenceCreated: false,
    normalizedScoreCreated: false,
    rightsClassificationRelaxed: false,
    provenanceRelaxed: false,
    unauthorizedScrapingRequested: false,
    paidProviderProcurementRequested: false,
    contractExecutionRequested: false,
  },
  disposition: downgraded.length > 0 ? 'REFERENCE_FALSE_POSITIVES_DOWNGRADED' : 'NO_REFERENCE_PRECISION_CHANGES_REQUIRED',
  evaluated,
  downgraded,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.mkdirSync(path.dirname(auditPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(hardened, null, 2));
fs.writeFileSync(auditPath, JSON.stringify(audit, null, 2));
console.log(`Stage2 reference precision hardening: inputRelevant=${inputRelevant} referenceEvaluated=${evaluated.length} downgraded=${downgraded.length} outputRelevant=${relevantCandidates.length}`);
console.log(`relevantByVertical=${JSON.stringify(relevantByVertical)}`);
console.log(`disposition=${audit.disposition}`);
