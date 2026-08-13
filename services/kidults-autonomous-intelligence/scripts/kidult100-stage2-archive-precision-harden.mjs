import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DEFAULT_POLICY = path.join(ROOT, 'config', 'kidult100-archive-precision-policy.json');
const DEFAULT_INPUT = path.join(ROOT, 'reports', 'kidult100-poc', 'kidult100-poc-latest.json');
const DEFAULT_AUDIT = path.join(ROOT, 'reports', 'kidult100-poc', 'kidult100-poc-precision-hardening-latest.json');

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
  return String(value || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
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
  if (policy?.policy !== 'FAIL_CLOSED_STAGE2_ARCHIVE_PRECISION_HARDENING') throw new Error('Invalid archive precision policy');
  if (!policy?.requiredInputMode || !policy?.targetSourceClass || !policy?.semanticStage) throw new Error('Incomplete archive precision policy identity');
  if (!Array.isArray(policy?.genericQueryTokens)) throw new Error('Archive precision policy requires genericQueryTokens');
  if (!Array.isArray(policy?.absoluteMediaDescriptionTerms) || policy.absoluteMediaDescriptionTerms.length === 0) throw new Error('Archive precision policy requires absolute media negatives');
  if (!Array.isArray(policy?.contextualObjectNegativeDescriptionTerms)) throw new Error('Archive precision policy requires contextual negatives');
  if (!policy?.productObjectTermsByVertical || typeof policy.productObjectTermsByVertical !== 'object') throw new Error('Archive precision policy requires product object terms by vertical');
  const requiredRules = [
    'neverUpgradePreviouslyIrrelevant',
    'creatorOnlyAnchorInsufficient',
    'absoluteMediaDescriptionAlwaysRejected',
    'contextualNegativeRequiresMatchingProductDescription',
    'partialMultiTokenQueryInsufficientWithoutProductContext',
    'distinctiveQueryAnchorsRequiredForDescriptionProductRetain',
    'modelSpecificExactTitleMayPassWithoutDescriptionProductTerm',
    'preserveRightsAndProvenance',
    'rewriteGeneratedPocReportOnly',
  ];
  for (const key of requiredRules) if (policy?.rules?.[key] !== true) throw new Error(`Unsafe archive precision rule: ${key}`);
  for (const [key, value] of Object.entries(policy?.safety || {})) if (value !== false) throw new Error(`Unsafe archive precision safety flag: ${key}`);
}

function queryDiagnostics(candidate, genericTokens, productTerms = []) {
  const query = normalize(candidate.query);
  const title = normalize(candidate.canonicalTitle);
  const description = normalize(candidate.description);
  const creator = normalize(candidate.creator);
  const queryTokens = tokens(query);
  const generic = new Set((genericTokens || []).map(normalize));
  const productTokens = new Set((productTerms || []).flatMap((term) => tokens(term)));
  const informative = queryTokens.filter((token) => !generic.has(token));
  const anchors = informative.length > 0 ? informative : queryTokens;
  const distinctiveAnchors = queryTokens.filter((token) => !generic.has(token) && !productTokens.has(token));
  const titleTokens = new Set(tokens(title));
  const descriptionTokens = new Set(tokens(description));
  const creatorTokens = new Set(tokens(creator));
  const identityTokens = new Set([...titleTokens, ...descriptionTokens]);
  const titleAnchorHits = anchors.filter((token) => titleTokens.has(token));
  const descriptionAnchorHits = anchors.filter((token) => descriptionTokens.has(token));
  const creatorAnchorHits = anchors.filter((token) => creatorTokens.has(token));
  const distinctiveAnchorHits = distinctiveAnchors.filter((token) => identityTokens.has(token));
  const exactTitleQuery = query.length > 0 && title === query;
  const queryPhraseInTitle = query.length > 0 && includesPhrase(title, query);
  const allAnchorsInTitle = anchors.length > 0 && anchors.every((token) => titleTokens.has(token));
  const allDistinctiveAnchorsMatched = distinctiveAnchors.length === 0 || distinctiveAnchors.every((token) => identityTokens.has(token));
  const strongTitleMatch = exactTitleQuery || queryPhraseInTitle || allAnchorsInTitle;
  const partialTitleMatch = titleAnchorHits.length > 0 && !strongTitleMatch;
  const creatorOnlyAnchor = creatorAnchorHits.length > 0 && titleAnchorHits.length === 0 && descriptionAnchorHits.length === 0;
  return {
    anchors,
    distinctiveAnchors,
    titleAnchorHits,
    descriptionAnchorHits,
    creatorAnchorHits,
    distinctiveAnchorHits,
    exactTitleQuery,
    queryPhraseInTitle,
    allAnchorsInTitle,
    allDistinctiveAnchorsMatched,
    strongTitleMatch,
    partialTitleMatch,
    creatorOnlyAnchor,
  };
}

function evaluateArchiveCandidate(candidate, policy) {
  const productTerms = policy.productObjectTermsByVertical[candidate.vertical];
  if (!Array.isArray(productTerms)) {
    return {
      passed: false,
      structuralError: `UNKNOWN_VERTICAL:${candidate.vertical || 'missing'}`,
      reasons: ['UNKNOWN_VERTICAL_PRODUCT_OBJECT_TERMS'],
      diagnostics: {},
    };
  }

  const query = queryDiagnostics(candidate, policy.genericQueryTokens, productTerms);
  const titleProductHits = phraseHits(candidate.canonicalTitle, productTerms);
  const descriptionProductHits = phraseHits(candidate.description, productTerms);
  const absoluteMediaHits = phraseHits(candidate.description, policy.absoluteMediaDescriptionTerms);
  const contextualNegativeHits = phraseHits(candidate.description, policy.contextualObjectNegativeDescriptionTerms);
  const modelSpecific = hasModelSpecificity(candidate.canonicalTitle);
  const reasons = [];
  let passed = true;

  if (absoluteMediaHits.length > 0) {
    passed = false;
    reasons.push('ARCHIVE_MEDIA_OBJECT_NOT_TARGET_PRODUCT');
  } else if (contextualNegativeHits.length > 0 && descriptionProductHits.length === 0) {
    passed = false;
    reasons.push('ARCHIVE_CONTEXTUAL_OBJECT_WITHOUT_PRODUCT_DESCRIPTION');
  } else if (query.creatorOnlyAnchor) {
    passed = false;
    reasons.push('ARCHIVE_CREATOR_ONLY_QUERY_ANCHOR');
  } else if (descriptionProductHits.length > 0) {
    if (query.distinctiveAnchors.length > 0 && !query.allDistinctiveAnchorsMatched) {
      passed = false;
      reasons.push('ARCHIVE_DISTINCTIVE_QUERY_ANCHOR_MISMATCH');
    } else {
      reasons.push('ARCHIVE_PRODUCT_OBJECT_DESCRIPTION_CONFIRMED');
    }
  } else if (query.strongTitleMatch && titleProductHits.length > 0) {
    reasons.push('ARCHIVE_PRODUCT_OBJECT_TITLE_CONFIRMED');
  } else if (query.exactTitleQuery && modelSpecific) {
    reasons.push('ARCHIVE_MODEL_SPECIFIC_EXACT_TITLE_CONFIRMED');
  } else {
    passed = false;
    if (query.partialTitleMatch && query.anchors.length > 1) reasons.push('ARCHIVE_PARTIAL_MULTI_TOKEN_QUERY_MATCH_ONLY');
    else reasons.push('ARCHIVE_INSUFFICIENT_PRODUCT_OBJECT_CONTEXT');
  }

  return {
    passed,
    structuralError: null,
    reasons,
    diagnostics: {
      ...query,
      titleProductHits,
      descriptionProductHits,
      absoluteMediaHits,
      contextualNegativeHits,
      modelSpecific,
    },
  };
}

function stableCandidateIdentity(candidate) {
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

const policy = readJsonInput(process.env.KIDULTS_ARCHIVE_PRECISION_POLICY_JSON, DEFAULT_POLICY);
const report = readJsonInput(process.env.KIDULTS_ARCHIVE_PRECISION_INPUT_JSON, DEFAULT_INPUT);
const outputPath = resolveOutput(process.env.KIDULTS_ARCHIVE_PRECISION_OUTPUT, DEFAULT_INPUT);
const auditPath = resolveOutput(process.env.KIDULTS_ARCHIVE_PRECISION_AUDIT_OUTPUT, DEFAULT_AUDIT);

validatePolicy(policy);
if (report?.mode !== policy.requiredInputMode) throw new Error(`Invalid POC mode: ${report?.mode || 'missing'}`);
if (!Array.isArray(report?.candidates)) throw new Error('POC report candidates must be an array');

const seen = new Set();
for (const candidate of report.candidates) {
  if (!candidate?.candidateKey) throw new Error('POC candidate missing candidateKey');
  if (seen.has(candidate.candidateKey)) throw new Error(`Duplicate POC candidateKey: ${candidate.candidateKey}`);
  seen.add(candidate.candidateKey);
}

const beforeIdentity = new Map(report.candidates.map((candidate) => [candidate.candidateKey, stableCandidateIdentity(candidate)]));
const inputRelevant = report.candidates.filter((candidate) => candidate.semanticRelevant).length;
const downgraded = [];
const evaluated = [];
let structuralErrors = 0;

const candidates = report.candidates.map((candidate) => {
  if (!candidate.semanticRelevant) {
    return {
      ...candidate,
      semanticStageC: {
        name: policy.semanticStage,
        passed: false,
        disposition: 'NOT_EVALUATED_PREVIOUSLY_IRRELEVANT',
        reasons: ['NEVER_UPGRADE_PREVIOUSLY_IRRELEVANT'],
      },
    };
  }

  if (candidate.sourceClass !== policy.targetSourceClass) {
    return {
      ...candidate,
      semanticStageC: {
        name: policy.semanticStage,
        passed: true,
        disposition: 'NOT_APPLICABLE_NON_ARCHIVE_SOURCE',
        reasons: ['NON_ARCHIVE_SOURCE_PRESERVED'],
      },
    };
  }

  const result = evaluateArchiveCandidate(candidate, policy);
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
    semanticStageC: {
      name: policy.semanticStage,
      passed: result.passed,
      disposition: result.passed ? 'ARCHIVE_PRODUCT_OBJECT_PRECISION_CONFIRMED' : 'ARCHIVE_FALSE_POSITIVE_DOWNGRADED',
      reasons: result.reasons,
      diagnostics: result.diagnostics,
    },
  };
});

if (structuralErrors > 0) throw new Error(`Archive precision structural errors: ${structuralErrors}`);

for (const candidate of candidates) {
  const before = beforeIdentity.get(candidate.candidateKey);
  const after = stableCandidateIdentity(candidate);
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error(`Rights/provenance identity mutated: ${candidate.candidateKey}`);
}

const relevantCandidates = candidates.filter((candidate) => candidate.semanticRelevant);
const recallCandidates = candidates.filter((candidate) => candidate.semanticStageA?.passed);
const verticalIds = Object.keys(policy.productObjectTermsByVertical);
const sourceIds = [...new Set(candidates.map((candidate) => candidate.source).filter(Boolean))];
const relevantByVertical = Object.fromEntries(verticalIds.map((vertical) => [vertical, relevantCandidates.filter((candidate) => candidate.vertical === vertical).length]));
const relevantBySource = Object.fromEntries(sourceIds.map((source) => [source, relevantCandidates.filter((candidate) => candidate.source === source).length]));
const downgradedByVertical = Object.fromEntries(verticalIds.map((vertical) => [vertical, downgraded.filter((row) => row.vertical === vertical).length]));
const downgradedBySource = Object.fromEntries(sourceIds.map((source) => [source, downgraded.filter((row) => row.source === source).length]));

const hardened = {
  ...report,
  schemaVersion: '2.6.0',
  semanticPolicy: {
    ...(report.semanticPolicy || {}),
    version: 'SEMANTIC_V2_3_ARCHIVE_PRECISION_HARDENED',
    stageC: policy.semanticStage,
    creatorOnlyAnchorAcceptedForArchive: false,
    archiveMediaObjectsAccepted: false,
    archivePartialQueryOnlyAccepted: false,
    archiveDistinctiveQueryAnchorsRequiredForDescriptionProductRetain: true,
    principle: 'Institutional archive metadata must represent the target product object and preserve distinctive query identity, not an artwork, creator-name homograph, generic product-word collision, or partial query coincidence.',
  },
  metrics: {
    ...(report.metrics || {}),
    semanticRelevantCandidates: relevantCandidates.length,
    semanticPrecisionRejectedCandidates: Math.max(0, recallCandidates.length - relevantCandidates.length),
    semanticArchivePrecisionRejectedCandidates: downgraded.length,
    semanticRelevanceCoverage: candidates.length ? relevantCandidates.length / candidates.length : 0,
    relevantByVertical,
    relevantBySource,
  },
  candidateBuild: {
    ...(report.candidateBuild || {}),
    outcome: 'BUILT_ARCHIVE_PRECISION_HARDENED_NOT_CERTIFIED',
    note: 'Stage C downgrades institutional archive false positives without creating evidence, scores, or changing rights/provenance. Stage 2 certification remains downstream.',
  },
  claims: {
    ...(report.claims || {}),
    archiveProductObjectPrecisionHardeningApplied: true,
    decisionGradeRightDataCertified: false,
    finalKidult100Certified: false,
  },
  candidates,
};

const audit = {
  schemaVersion: '1.0.0',
  mode: 'KIDULT100_STAGE2_ARCHIVE_PRECISION_HARDENING',
  generatedAt: new Date().toISOString(),
  policy: policy.policy,
  metrics: {
    inputCandidates: report.candidates.length,
    inputRelevantCandidates: inputRelevant,
    archiveRelevantEvaluated: evaluated.length,
    archiveRelevantRetained: evaluated.length - downgraded.length,
    archiveFalsePositivesDowngraded: downgraded.length,
    outputRelevantCandidates: relevantCandidates.length,
    outputSemanticRelevanceCoverage: candidates.length ? relevantCandidates.length / candidates.length : 0,
    downgradedByVertical,
    downgradedBySource,
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
  disposition: downgraded.length > 0 ? 'ARCHIVE_FALSE_POSITIVES_DOWNGRADED' : 'NO_ARCHIVE_PRECISION_CHANGES_REQUIRED',
  evaluated,
  downgraded,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.mkdirSync(path.dirname(auditPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(hardened, null, 2));
fs.writeFileSync(auditPath, JSON.stringify(audit, null, 2));
console.log(`Stage2 archive precision hardening: inputRelevant=${inputRelevant} archiveEvaluated=${evaluated.length} downgraded=${downgraded.length} outputRelevant=${relevantCandidates.length}`);
console.log(`relevantByVertical=${JSON.stringify(relevantByVertical)}`);
console.log(`downgradedBySource=${JSON.stringify(downgradedBySource)} disposition=${audit.disposition}`);
