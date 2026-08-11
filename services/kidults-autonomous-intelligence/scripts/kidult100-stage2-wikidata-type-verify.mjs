import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fetchWikidataEntities } from './lib/wikidata-source-native-client.mjs';

const ROOT = process.cwd();
const DEFAULT_POLICY = path.join(ROOT, 'config', 'kidult100-wikidata-type-verification-policy.json');
const DEFAULT_INPUT = path.join(ROOT, 'reports', 'kidult100-poc', 'kidult100-poc-latest.json');
const DEFAULT_AUDIT = path.join(ROOT, 'reports', 'kidult100-poc', 'kidult100-wikidata-type-verification-latest.json');

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

function includesPhrase(text, phrase) {
  const haystack = ` ${normalize(text)} `;
  const needle = normalize(phrase);
  return needle.length > 0 && haystack.includes(` ${needle} `);
}

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function validatePolicy(policy) {
  if (policy?.policy !== 'FAIL_CLOSED_STAGE2_WIKIDATA_SOURCE_NATIVE_TYPE_VERIFICATION') throw new Error('Invalid Wikidata type verification policy');
  if (!policy?.requiredInputMode || !policy?.targetSource || !policy?.targetSourceClass || !policy?.requiredRightsClass || !policy?.semanticStage || !policy?.eligiblePriorReason || !policy?.eligibleDisallowedContextReason || !policy?.eligibleAnchorMismatchReason) throw new Error('Incomplete Wikidata type verification policy identity');
  if (policy?.directTypeProperty !== 'P31') throw new Error('Wikidata type verification must use direct P31');
  if (!policy?.allowedTypeTermsByVertical || !Array.isArray(policy?.disallowedDirectTypeTerms) || !Array.isArray(policy?.softDisallowedDirectTypeTerms)) throw new Error('Wikidata type verification requires type controls');
  for (const term of policy.softDisallowedDirectTypeTerms) {
    if (!policy.disallowedDirectTypeTerms.includes(term)) throw new Error(`Soft disallowed type is not in disallowed controls: ${term}`);
  }
  const requiredRules = [
    'onlyRequalifyStageDContextMissingOrStrictDisallowed', 'disallowedContextRequiresExactTitleOrModelSpecific', 'requireAllQueryAnchorsMatched',
    'anchorMismatchOverrideIsNarrowException', 'anchorMismatchRequiresNonGenericQuery', 'anchorMismatchRequiresExistingVerticalProductContext', 'anchorMismatchRequiresDirectP31VerticalProductType',
    'requireSourceNativeQid', 'directP31Only', 'typeLabelOrDescriptionMustMatchVerticalProductTerms', 'disallowedTypeMustMatchTypeLabel', 'disallowedTypeOverridesAllowedType',
    'softDisallowedMayCoexistWithExplicitAllowedProductType', 'softDisallowedAloneNeverQualifies', 'preserveRightsAndProvenance',
    'verificationProofSeparateFromCandidatePayloadHash', 'rewriteGeneratedPocReportOnly',
  ];
  for (const key of requiredRules) if (policy?.rules?.[key] !== true) throw new Error(`Unsafe Wikidata type verification rule: ${key}`);
  for (const [key, value] of Object.entries(policy?.safety || {})) if (value !== false) throw new Error(`Unsafe Wikidata type verification safety flag: ${key}`);
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

function directTypeIds(entity, propertyId) {
  const rows = Array.isArray(entity?.claims?.[propertyId]) ? entity.claims[propertyId] : [];
  return [...new Set(rows.map((row) => row?.mainsnak?.datavalue?.value?.id).filter((id) => /^Q\d+$/.test(String(id || ''))))];
}

function englishText(entity) {
  const label = entity?.labels?.en?.value || '';
  const description = entity?.descriptions?.en?.value || '';
  return { label, description, combined: `${label} ${description}`.trim() };
}

function hasExistingVerticalProductContext(diagnostics) {
  const titleHits = Array.isArray(diagnostics?.productTitleHits) ? diagnostics.productTitleHits : [];
  const descriptionHits = Array.isArray(diagnostics?.productDescriptionHits) ? diagnostics.productDescriptionHits : [];
  return titleHits.length + descriptionHits.length > 0;
}

function stageDEligible(candidate, policy) {
  const reasons = Array.isArray(candidate?.semanticStageD?.reasons) ? candidate.semanticStageD.reasons : [];
  const diagnostics = candidate?.semanticStageD?.diagnostics || {};
  const priorReason = reasons.length === 1 ? reasons[0] : null;
  const anchorMismatchOverride = priorReason === policy.eligibleAnchorMismatchReason
    && diagnostics.genericQuery === false
    && hasExistingVerticalProductContext(diagnostics);
  const supportedReason = priorReason === policy.eligiblePriorReason
    || (priorReason === policy.eligibleDisallowedContextReason && (diagnostics.exactTitleQuery === true || diagnostics.modelSpecific === true))
    || anchorMismatchOverride;
  const anchorRequirementSatisfied = anchorMismatchOverride || diagnostics.allAnchorsMatched === true;
  return candidate?.semanticRelevant === false
    && candidate?.source === policy.targetSource
    && candidate?.sourceClass === policy.targetSourceClass
    && candidate?.rightsClass === policy.requiredRightsClass
    && /^Q\d+$/.test(String(candidate?.sourceRecordId || ''))
    && supportedReason
    && anchorRequirementSatisfied;
}

const policy = readJsonInput(process.env.KIDULTS_WIKIDATA_TYPE_POLICY_JSON, DEFAULT_POLICY);
const report = readJsonInput(process.env.KIDULTS_WIKIDATA_TYPE_INPUT_JSON, DEFAULT_INPUT);
const outputPath = resolveOutput(process.env.KIDULTS_WIKIDATA_TYPE_OUTPUT, DEFAULT_INPUT);
const auditPath = resolveOutput(process.env.KIDULTS_WIKIDATA_TYPE_AUDIT_OUTPUT, DEFAULT_AUDIT);
const fixtureRaw = process.env.KIDULTS_WIKIDATA_TYPE_ENTITIES_JSON;

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
const eligible = report.candidates.filter((candidate) => stageDEligible(candidate, policy));
const eligibleContextMissing = eligible.filter((candidate) => candidate.semanticStageD?.reasons?.[0] === policy.eligiblePriorReason);
const eligibleStrictDisallowed = eligible.filter((candidate) => candidate.semanticStageD?.reasons?.[0] === policy.eligibleDisallowedContextReason);
const eligibleAnchorMismatch = eligible.filter((candidate) => candidate.semanticStageD?.reasons?.[0] === policy.eligibleAnchorMismatchReason);
const eligibleIds = [...new Set(eligible.map((candidate) => candidate.sourceRecordId))];
let entityMap = {};
const sourceErrors = [];
let requestCount = 0;

if (fixtureRaw != null && String(fixtureRaw).trim() !== '') {
  const fixture = readJsonInput(fixtureRaw, DEFAULT_INPUT);
  entityMap = fixture?.entities && typeof fixture.entities === 'object' ? fixture.entities : fixture;
} else if (eligibleIds.length > 0) {
  const primary = await fetchWikidataEntities(eligibleIds);
  Object.assign(entityMap, primary.entities);
  sourceErrors.push(...primary.errors.map((row) => ({ stage: 'CANDIDATE_ENTITY_FETCH', ...row })));
  requestCount += primary.requestCount;
  const typeIds = [...new Set(eligibleIds.flatMap((id) => directTypeIds(entityMap[id], policy.directTypeProperty)))];
  if (typeIds.length > 0) {
    const types = await fetchWikidataEntities(typeIds);
    Object.assign(entityMap, types.entities);
    sourceErrors.push(...types.errors.map((row) => ({ stage: 'DIRECT_TYPE_FETCH', ...row })));
    requestCount += types.requestCount;
  }
}

const evaluated = [];
const recovered = [];
const retainedRejected = [];
let structuralErrors = 0;
const softDisallowedTerms = new Set(policy.softDisallowedDirectTypeTerms.map(normalize));

const candidates = report.candidates.map((candidate) => {
  if (candidate.semanticRelevant) {
    return {
      ...candidate,
      semanticStageE: { name: policy.semanticStage, passed: true, disposition: 'NOT_APPLICABLE_ALREADY_RELEVANT', reasons: ['PREVIOUSLY_RELEVANT_PRESERVED'] },
    };
  }
  if (!stageDEligible(candidate, policy)) {
    return {
      ...candidate,
      semanticStageE: { name: policy.semanticStage, passed: false, disposition: 'NOT_ELIGIBLE_FOR_SOURCE_NATIVE_REQUALIFICATION', reasons: ['STAGE_D_REJECTION_PRESERVED'] },
    };
  }

  const allowedTerms = policy.allowedTypeTermsByVertical[candidate.vertical];
  if (!Array.isArray(allowedTerms)) {
    structuralErrors += 1;
    retainedRejected.push({ candidateKey: candidate.candidateKey, canonicalTitle: candidate.canonicalTitle || null, vertical: candidate.vertical || null, reasons: ['UNKNOWN_VERTICAL_TYPE_TERMS'] });
    return {
      ...candidate,
      semanticStageE: { name: policy.semanticStage, passed: false, disposition: 'STRUCTURAL_ERROR_UNKNOWN_VERTICAL', reasons: ['UNKNOWN_VERTICAL_TYPE_TERMS'] },
    };
  }

  const entity = entityMap[candidate.sourceRecordId];
  const typeIds = directTypeIds(entity, policy.directTypeProperty);
  const directTypes = typeIds.map((id) => ({ id, ...englishText(entityMap[id]) }));
  const allowedHits = [];
  const disallowedHits = [];
  for (const type of directTypes) {
    for (const term of allowedTerms) if (includesPhrase(type.combined, term)) allowedHits.push({ typeId: type.id, term, label: type.label || null });
    for (const term of policy.disallowedDirectTypeTerms) if (includesPhrase(type.label, term)) disallowedHits.push({ typeId: type.id, term, label: type.label || null });
  }
  const softDisallowedHits = disallowedHits.filter((hit) => softDisallowedTerms.has(normalize(hit.term)));
  const hardDisallowedHits = disallowedHits.filter((hit) => !softDisallowedTerms.has(normalize(hit.term)));

  const proof = {
    entityId: candidate.sourceRecordId,
    verificationSource: 'wikidata-action-api',
    verificationSourceUrl: `https://www.wikidata.org/wiki/${candidate.sourceRecordId}`,
    directTypeProperty: policy.directTypeProperty,
    directTypeIds: typeIds,
    directTypes,
    allowedHits,
    disallowedHits,
    softDisallowedHits,
    hardDisallowedHits,
  };
  proof.verificationPayloadHash = hash({ entityId: proof.entityId, directTypeProperty: proof.directTypeProperty, directTypes: proof.directTypes });

  let passed = false;
  let reasons;
  if (!entity || entity.missing !== undefined) {
    reasons = ['WIKIDATA_ENTITY_UNAVAILABLE'];
  } else if (typeIds.length === 0) {
    reasons = ['WIKIDATA_DIRECT_P31_MISSING'];
  } else if (hardDisallowedHits.length > 0) {
    reasons = ['WIKIDATA_DIRECT_P31_DISALLOWED_TYPE'];
  } else if (allowedHits.length > 0) {
    passed = true;
    reasons = softDisallowedHits.length > 0
      ? ['WIKIDATA_DIRECT_P31_PRODUCT_TYPE_CONFIRMED_WITH_SOFT_CLASSIFICATION']
      : ['WIKIDATA_DIRECT_P31_PRODUCT_TYPE_CONFIRMED'];
  } else if (softDisallowedHits.length > 0) {
    reasons = ['WIKIDATA_DIRECT_P31_DISALLOWED_TYPE'];
  } else {
    reasons = ['WIKIDATA_DIRECT_P31_PRODUCT_TYPE_NOT_CONFIRMED'];
  }

  const row = {
    candidateKey: candidate.candidateKey,
    canonicalTitle: candidate.canonicalTitle || null,
    vertical: candidate.vertical || null,
    sourceRecordId: candidate.sourceRecordId,
    priorStageDReason: candidate.semanticStageD?.reasons?.[0] || null,
    passed,
    reasons,
    proof,
  };
  evaluated.push(row);
  if (passed) recovered.push(row);
  else retainedRejected.push(row);
  return {
    ...candidate,
    semanticRelevant: passed,
    semanticStageE: {
      name: policy.semanticStage,
      passed,
      disposition: passed ? 'SOURCE_NATIVE_PRODUCT_TYPE_REQUALIFIED' : 'SOURCE_NATIVE_TYPE_VERIFICATION_NOT_SUFFICIENT',
      reasons,
      proof,
    },
  };
});

if (structuralErrors > 0) throw new Error(`Wikidata type verification structural errors: ${structuralErrors}`);
for (const candidate of candidates) {
  if (JSON.stringify(beforeIdentity.get(candidate.candidateKey)) !== JSON.stringify(stableIdentity(candidate))) throw new Error(`Rights/provenance identity mutated: ${candidate.candidateKey}`);
}

const relevantCandidates = candidates.filter((candidate) => candidate.semanticRelevant);
const verticalIds = Object.keys(policy.allowedTypeTermsByVertical);
const relevantByVertical = Object.fromEntries(verticalIds.map((vertical) => [vertical, relevantCandidates.filter((candidate) => candidate.vertical === vertical).length]));
const recoveredByVertical = Object.fromEntries(verticalIds.map((vertical) => [vertical, recovered.filter((row) => row.vertical === vertical).length]));
const recoveredStrictDisallowed = recovered.filter((row) => row.priorStageDReason === policy.eligibleDisallowedContextReason);
const recoveredAnchorMismatch = recovered.filter((row) => row.priorStageDReason === policy.eligibleAnchorMismatchReason);

const verified = {
  ...report,
  schemaVersion: '2.8.4',
  semanticPolicy: {
    ...(report.semanticPolicy || {}),
    version: 'SEMANTIC_V2_5_4_WIKIDATA_SOURCE_NATIVE_BOUNDED_ANCHOR_OVERRIDE',
    stageE: policy.semanticStage,
    sourceNativeTypeVerification: 'DIRECT_P31_ENGLISH_PRODUCT_PROOF_WITH_BOUNDED_STAGE_D_OVERRIDES',
    principle: 'Stage E may requalify Stage-D context-missing Wikidata CC0 records with full query-anchor match, plus narrowly bounded Stage-D disallowed-context records with exact/model identity, and anchor-mismatch records only when the original non-generic Stage-D result already carried vertical product context. Every lane still requires direct P31 source-native product/object proof for the target vertical. Hard disallowed P31 entity/media types always override product proof. Soft trademark classification may coexist only with a separate explicit allowed product P31. Rights/provenance identity is never rewritten.',
  },
  metrics: {
    ...(report.metrics || {}),
    semanticRelevantCandidates: relevantCandidates.length,
    semanticSourceNativeTypeRecoveredCandidates: recovered.length,
    semanticSourceNativeStrictDisallowedRecoveredCandidates: recoveredStrictDisallowed.length,
    semanticSourceNativeAnchorMismatchRecoveredCandidates: recoveredAnchorMismatch.length,
    semanticRelevanceCoverage: candidates.length ? relevantCandidates.length / candidates.length : 0,
    relevantByVertical,
  },
  candidateBuild: {
    ...(report.candidateBuild || {}),
    outcome: 'BUILT_SOURCE_NATIVE_TYPE_VERIFIED_NOT_CERTIFIED',
    note: 'Stage E requalifies only directly verified Wikidata P31 product/object types. Strict Stage-D disallowed-context recovery requires exact-title or model-specific identity plus full query-anchor match. The bounded anchor-mismatch lane is non-generic and requires pre-existing vertical product context before direct P31 can requalify it. Hard P31 entity/media classifications remain rejected; unavailable, ambiguous or non-product types remain rejected.',
  },
  claims: {
    ...(report.claims || {}),
    wikidataSourceNativeTypeVerificationApplied: true,
    decisionGradeRightDataCertified: false,
    finalKidult100Certified: false,
  },
  candidates,
};

const audit = {
  schemaVersion: '1.2.0',
  mode: 'KIDULT100_STAGE2_WIKIDATA_SOURCE_NATIVE_TYPE_VERIFICATION',
  generatedAt: new Date().toISOString(),
  policy: policy.policy,
  metrics: {
    inputCandidates: report.candidates.length,
    inputRelevantCandidates: inputRelevant,
    eligibleStageDContextMissingCandidates: eligibleContextMissing.length,
    eligibleStageDStrictDisallowedContextCandidates: eligibleStrictDisallowed.length,
    eligibleStageDAnchorMismatchCandidates: eligibleAnchorMismatch.length,
    evaluatedCandidates: evaluated.length,
    recoveredCandidates: recovered.length,
    recoveredStrictDisallowedContextCandidates: recoveredStrictDisallowed.length,
    recoveredAnchorMismatchCandidates: recoveredAnchorMismatch.length,
    retainedRejectedCandidates: retainedRejected.length,
    outputRelevantCandidates: relevantCandidates.length,
    sourceErrorCount: sourceErrors.length,
    requestCount,
    recoveredByVertical,
    structuralErrors,
  },
  safety: {
    syntheticEvidenceCreated: false,
    liveEvidenceClaimCreated: false,
    marketEvidenceCreated: false,
    normalizedScoreCreated: false,
    rightsClassificationRelaxed: false,
    provenanceRelaxed: false,
    candidatePayloadHashRewritten: false,
    stageDDisallowedContextCanQualifyWithoutExactOrModelIdentity: false,
    anchorMismatchCanQualifyWithoutExistingVerticalProductContext: false,
    anchorMismatchCanQualifyWithoutDirectP31VerticalProductType: false,
    hardDisallowedEntityOrMediaTypeCanBeOverridden: false,
    softClassificationAloneCanQualify: false,
    unauthorizedScrapingRequested: false,
    paidProviderProcurementRequested: false,
    contractExecutionRequested: false,
  },
  disposition: recovered.length > 0 ? 'SOURCE_NATIVE_PRODUCT_TYPES_REQUALIFIED' : 'NO_SOURCE_NATIVE_PRODUCT_TYPE_RECOVERY',
  sourceErrors,
  evaluated,
  recovered,
  retainedRejected,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.mkdirSync(path.dirname(auditPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(verified, null, 2));
fs.writeFileSync(auditPath, JSON.stringify(audit, null, 2));
console.log(`Stage2 Wikidata source-native type verification: eligible=${eligible.length} strictDisallowed=${eligibleStrictDisallowed.length} anchorMismatch=${eligibleAnchorMismatch.length} evaluated=${evaluated.length} recovered=${recovered.length} recoveredStrictDisallowed=${recoveredStrictDisallowed.length} recoveredAnchorMismatch=${recoveredAnchorMismatch.length} outputRelevant=${relevantCandidates.length}`);
console.log(`recoveredByVertical=${JSON.stringify(recoveredByVertical)} sourceErrors=${sourceErrors.length} requests=${requestCount}`);
console.log(`disposition=${audit.disposition}`);
