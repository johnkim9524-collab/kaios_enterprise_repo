import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fetchWikidataEntities } from './lib/wikidata-source-native-client.mjs';

const ROOT = process.cwd();
const DEFAULT_POLICY = path.join(ROOT, 'config', 'kidult100-wikidata-subclass-verification-policy.json');
const DEFAULT_INPUT = path.join(ROOT, 'reports', 'kidult100-poc', 'kidult100-poc-latest.json');
const DEFAULT_AUDIT = path.join(ROOT, 'reports', 'kidult100-poc', 'kidult100-wikidata-subclass-verification-latest.json');

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
  if (policy?.policy !== 'FAIL_CLOSED_STAGE2_WIKIDATA_ONE_HOP_SUBCLASS_VERIFICATION') throw new Error('Invalid Wikidata subclass verification policy');
  if (!policy?.requiredInputMode || !policy?.targetSource || !policy?.targetSourceClass || !policy?.requiredRightsClass || !policy?.semanticStage) throw new Error('Incomplete Wikidata subclass verification policy identity');
  if (policy?.subclassProperty !== 'P279' || policy?.maxSubclassDepth !== 1) throw new Error('Wikidata subclass verification must be exactly one-hop P279');
  if (!policy?.allowedTypeTermsByVertical || !Array.isArray(policy?.disallowedTypeTerms)) throw new Error('Wikidata subclass verification requires type controls');
  const requiredRules = ['onlyRequalifyStageENotConfirmed','requireStageEProof','requireAllQueryAnchorsMatched','oneHopP279Only','recursiveTraversalForbidden','disallowedSuperclassOverridesAllowedSuperclass','preserveRightsAndProvenance','verificationProofSeparateFromCandidatePayloadHash','rewriteGeneratedPocReportOnly'];
  for (const key of requiredRules) if (policy?.rules?.[key] !== true) throw new Error(`Unsafe Wikidata subclass verification rule: ${key}`);
  for (const [key, value] of Object.entries(policy?.safety || {})) if (value !== false) throw new Error(`Unsafe Wikidata subclass verification safety flag: ${key}`);
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

function claimIds(entity, propertyId) {
  const rows = Array.isArray(entity?.claims?.[propertyId]) ? entity.claims[propertyId] : [];
  return [...new Set(rows.map((row) => row?.mainsnak?.datavalue?.value?.id).filter((id) => /^Q\d+$/.test(String(id || ''))))];
}

function englishText(entity) {
  const label = entity?.labels?.en?.value || '';
  const description = entity?.descriptions?.en?.value || '';
  return { label, description, combined: `${label} ${description}`.trim() };
}

function stageFEligible(candidate, policy) {
  const reasons = Array.isArray(candidate?.semanticStageE?.reasons) ? candidate.semanticStageE.reasons : [];
  const directTypeIds = Array.isArray(candidate?.semanticStageE?.proof?.directTypeIds) ? candidate.semanticStageE.proof.directTypeIds : [];
  return candidate?.semanticRelevant === false
    && candidate?.source === policy.targetSource
    && candidate?.sourceClass === policy.targetSourceClass
    && candidate?.rightsClass === policy.requiredRightsClass
    && candidate?.semanticStageD?.diagnostics?.allAnchorsMatched === true
    && reasons.length === 1
    && reasons[0] === policy.eligibleStageEReason
    && directTypeIds.length > 0
    && directTypeIds.every((id) => /^Q\d+$/.test(String(id || '')));
}

const policy = readJsonInput(process.env.KIDULTS_WIKIDATA_SUBCLASS_POLICY_JSON, DEFAULT_POLICY);
const report = readJsonInput(process.env.KIDULTS_WIKIDATA_SUBCLASS_INPUT_JSON, DEFAULT_INPUT);
const outputPath = resolveOutput(process.env.KIDULTS_WIKIDATA_SUBCLASS_OUTPUT, DEFAULT_INPUT);
const auditPath = resolveOutput(process.env.KIDULTS_WIKIDATA_SUBCLASS_AUDIT_OUTPUT, DEFAULT_AUDIT);
const fixtureRaw = process.env.KIDULTS_WIKIDATA_SUBCLASS_ENTITIES_JSON;

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
const eligible = report.candidates.filter((candidate) => stageFEligible(candidate, policy));
const directTypeIds = [...new Set(eligible.flatMap((candidate) => candidate.semanticStageE.proof.directTypeIds))];
let entityMap = {};
const sourceErrors = [];
let requestCount = 0;

if (fixtureRaw != null && String(fixtureRaw).trim() !== '') {
  const fixture = readJsonInput(fixtureRaw, DEFAULT_INPUT);
  entityMap = fixture?.entities && typeof fixture.entities === 'object' ? fixture.entities : fixture;
} else if (directTypeIds.length > 0) {
  const directTypes = await fetchWikidataEntities(directTypeIds);
  Object.assign(entityMap, directTypes.entities);
  sourceErrors.push(...directTypes.errors.map((row) => ({ stage: 'DIRECT_TYPE_ENTITY_FETCH', ...row })));
  requestCount += directTypes.requestCount;
  const superclassIds = [...new Set(directTypeIds.flatMap((id) => claimIds(entityMap[id], policy.subclassProperty)))];
  if (superclassIds.length > 0) {
    const superclasses = await fetchWikidataEntities(superclassIds);
    Object.assign(entityMap, superclasses.entities);
    sourceErrors.push(...superclasses.errors.map((row) => ({ stage: 'SUPERCLASS_ENTITY_FETCH', ...row })));
    requestCount += superclasses.requestCount;
  }
}

const evaluated = [];
const recovered = [];
const retainedRejected = [];
let structuralErrors = 0;

const candidates = report.candidates.map((candidate) => {
  if (candidate.semanticRelevant) {
    return { ...candidate, semanticStageF: { name: policy.semanticStage, passed: true, disposition: 'NOT_APPLICABLE_ALREADY_RELEVANT', reasons: ['PREVIOUSLY_RELEVANT_PRESERVED'] } };
  }
  if (!stageFEligible(candidate, policy)) {
    return { ...candidate, semanticStageF: { name: policy.semanticStage, passed: false, disposition: 'NOT_ELIGIBLE_FOR_ONE_HOP_SUBCLASS_REQUALIFICATION', reasons: ['STAGE_E_REJECTION_PRESERVED'] } };
  }

  const allowedTerms = policy.allowedTypeTermsByVertical[candidate.vertical];
  if (!Array.isArray(allowedTerms)) {
    structuralErrors += 1;
    retainedRejected.push({ candidateKey: candidate.candidateKey, canonicalTitle: candidate.canonicalTitle || null, vertical: candidate.vertical || null, reasons: ['UNKNOWN_VERTICAL_TYPE_TERMS'] });
    return { ...candidate, semanticStageF: { name: policy.semanticStage, passed: false, disposition: 'STRUCTURAL_ERROR_UNKNOWN_VERTICAL', reasons: ['UNKNOWN_VERTICAL_TYPE_TERMS'] } };
  }

  const candidateDirectTypeIds = candidate.semanticStageE.proof.directTypeIds;
  const subclassEdges = candidateDirectTypeIds.map((typeId) => ({ typeId, superclassIds: claimIds(entityMap[typeId], policy.subclassProperty) }));
  const superclassIds = [...new Set(subclassEdges.flatMap((row) => row.superclassIds))];
  const missingDirectTypes = candidateDirectTypeIds.filter((id) => !entityMap[id] || entityMap[id].missing !== undefined);
  const missingSuperclasses = superclassIds.filter((id) => !entityMap[id] || entityMap[id].missing !== undefined);
  const superclasses = superclassIds.map((id) => ({ id, ...englishText(entityMap[id]) }));
  const allowedHits = [];
  const disallowedHits = [];
  for (const superclass of superclasses) {
    for (const term of allowedTerms) if (includesPhrase(superclass.combined, term)) allowedHits.push({ typeId: superclass.id, term, label: superclass.label || null });
    for (const term of policy.disallowedTypeTerms) if (includesPhrase(superclass.combined, term)) disallowedHits.push({ typeId: superclass.id, term, label: superclass.label || null });
  }

  const proof = {
    entityId: candidate.sourceRecordId,
    verificationSource: 'wikidata-action-api',
    directTypeIds: candidateDirectTypeIds,
    subclassProperty: policy.subclassProperty,
    maxSubclassDepth: policy.maxSubclassDepth,
    subclassEdges,
    superclasses,
    allowedHits,
    disallowedHits,
  };
  proof.verificationPayloadHash = hash({ entityId: proof.entityId, directTypeIds: proof.directTypeIds, subclassProperty: proof.subclassProperty, subclassEdges: proof.subclassEdges, superclasses: proof.superclasses });

  let passed = false;
  let reasons;
  if (missingDirectTypes.length > 0) reasons = ['WIKIDATA_DIRECT_TYPE_ENTITY_UNAVAILABLE'];
  else if (superclassIds.length === 0) reasons = ['WIKIDATA_ONE_HOP_P279_MISSING'];
  else if (missingSuperclasses.length > 0) reasons = ['WIKIDATA_SUPERCLASS_ENTITY_UNAVAILABLE'];
  else if (disallowedHits.length > 0) reasons = ['WIKIDATA_ONE_HOP_P279_DISALLOWED_TYPE'];
  else if (allowedHits.length > 0) {
    passed = true;
    reasons = ['WIKIDATA_ONE_HOP_P279_PRODUCT_TYPE_CONFIRMED'];
  } else reasons = ['WIKIDATA_ONE_HOP_P279_PRODUCT_TYPE_NOT_CONFIRMED'];

  const row = { candidateKey: candidate.candidateKey, canonicalTitle: candidate.canonicalTitle || null, vertical: candidate.vertical || null, sourceRecordId: candidate.sourceRecordId, passed, reasons, proof };
  evaluated.push(row);
  if (passed) recovered.push(row); else retainedRejected.push(row);
  return { ...candidate, semanticRelevant: passed, semanticStageF: { name: policy.semanticStage, passed, disposition: passed ? 'SOURCE_NATIVE_ONE_HOP_SUBCLASS_REQUALIFIED' : 'SOURCE_NATIVE_ONE_HOP_SUBCLASS_NOT_SUFFICIENT', reasons, proof } };
});

if (structuralErrors > 0) throw new Error(`Wikidata subclass verification structural errors: ${structuralErrors}`);
for (const candidate of candidates) {
  if (JSON.stringify(beforeIdentity.get(candidate.candidateKey)) !== JSON.stringify(stableIdentity(candidate))) throw new Error(`Rights/provenance identity mutated: ${candidate.candidateKey}`);
}

const relevantCandidates = candidates.filter((candidate) => candidate.semanticRelevant);
const verticalIds = Object.keys(policy.allowedTypeTermsByVertical);
const relevantByVertical = Object.fromEntries(verticalIds.map((vertical) => [vertical, relevantCandidates.filter((candidate) => candidate.vertical === vertical).length]));
const recoveredByVertical = Object.fromEntries(verticalIds.map((vertical) => [vertical, recovered.filter((row) => row.vertical === vertical).length]));

const verified = {
  ...report,
  schemaVersion: '2.9.0',
  semanticPolicy: {
    ...(report.semanticPolicy || {}),
    version: 'SEMANTIC_V2_6_WIKIDATA_ONE_HOP_SUBCLASS_VERIFIED',
    stageF: policy.semanticStage,
    sourceNativeSubclassVerification: 'P31_TYPE_TO_DIRECT_P279_SUPERCLASS_ONLY',
    principle: 'Stage F may requalify only Stage-E not-confirmed Wikidata CC0 records using one explicit P279 hop from an already proven direct P31 type. It never traverses recursively, infers a type, or rewrites rights/provenance identity.',
  },
  metrics: {
    ...(report.metrics || {}),
    semanticRelevantCandidates: relevantCandidates.length,
    semanticSourceNativeSubclassRecoveredCandidates: recovered.length,
    semanticRelevanceCoverage: candidates.length ? relevantCandidates.length / candidates.length : 0,
    relevantByVertical,
  },
  candidateBuild: {
    ...(report.candidateBuild || {}),
    outcome: 'BUILT_SOURCE_NATIVE_ONE_HOP_SUBCLASS_VERIFIED_NOT_CERTIFIED',
    note: 'Stage F only accepts explicit one-hop Wikidata P279 superclass proof from Stage-E direct P31 types; unavailable, recursive, ambiguous, non-product or disallowed type chains remain rejected.',
  },
  claims: {
    ...(report.claims || {}),
    wikidataOneHopSubclassVerificationApplied: true,
    decisionGradeRightDataCertified: false,
    finalKidult100Certified: false,
  },
  candidates,
};

const audit = {
  schemaVersion: '1.0.0',
  mode: 'KIDULT100_STAGE2_WIKIDATA_ONE_HOP_SUBCLASS_VERIFICATION',
  generatedAt: new Date().toISOString(),
  policy: policy.policy,
  metrics: {
    inputCandidates: report.candidates.length,
    inputRelevantCandidates: inputRelevant,
    eligibleStageENotConfirmedCandidates: eligible.length,
    evaluatedCandidates: evaluated.length,
    recoveredCandidates: recovered.length,
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
    recursiveSubclassTraversalPerformed: false,
    unauthorizedScrapingRequested: false,
    paidProviderProcurementRequested: false,
    contractExecutionRequested: false,
  },
  disposition: recovered.length > 0 ? 'SOURCE_NATIVE_ONE_HOP_SUBCLASS_TYPES_REQUALIFIED' : 'NO_SOURCE_NATIVE_ONE_HOP_SUBCLASS_RECOVERY',
  sourceErrors,
  evaluated,
  recovered,
  retainedRejected,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.mkdirSync(path.dirname(auditPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(verified, null, 2));
fs.writeFileSync(auditPath, JSON.stringify(audit, null, 2));
console.log(`Stage2 Wikidata one-hop subclass verification: eligible=${eligible.length} evaluated=${evaluated.length} recovered=${recovered.length} outputRelevant=${relevantCandidates.length}`);
console.log(`recoveredByVertical=${JSON.stringify(recoveredByVertical)} sourceErrors=${sourceErrors.length} requests=${requestCount}`);
console.log(`disposition=${audit.disposition}`);
