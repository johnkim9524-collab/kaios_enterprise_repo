import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DEFAULT_POLICY = path.join(ROOT, 'config', 'kidult100-scarcity-source-discovery-policy.json');
const DEFAULT_INPUT = path.join(ROOT, 'reports', 'kidult100-ranking', 'kidult100-scarcity-source-qualification-latest.json');
const DEFAULT_OUT = path.join(ROOT, 'reports', 'kidult100-ranking', 'kidult100-scarcity-source-discovery-plan-latest.json');

function readJsonInput(value, fallbackPath) {
  const raw = value == null || String(value).trim() === '' ? fallbackPath : String(value).trim();
  if (raw.startsWith('{') || raw.startsWith('[')) return JSON.parse(raw);
  const resolved = path.isAbsolute(raw) ? raw : path.join(ROOT, raw);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) throw new Error(`Missing JSON input: ${resolved}`);
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

function normalize(value) {
  return String(value || '').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function includesPhrase(text, phrase) {
  const haystack = ` ${normalize(text)} `;
  const needle = normalize(phrase);
  return needle.length > 0 && haystack.includes(` ${needle} `);
}

function hasModelSpecificity(title) {
  const raw = String(title || '');
  return /\b[A-Za-z]{1,6}[- ]?\d{1,5}[A-Za-z]?\b/.test(raw)
    || /\b\d{2,4}[-–]\d{2,4}\b/.test(raw)
    || /\bmodel\b/i.test(raw);
}

const policy = readJsonInput(process.env.KIDULTS_SCARCITY_DISCOVERY_POLICY_JSON, DEFAULT_POLICY);
const input = readJsonInput(process.env.KIDULTS_SCARCITY_SOURCE_QUALIFICATION_JSON, DEFAULT_INPUT);
const outputRaw = process.env.KIDULTS_SCARCITY_SOURCE_DISCOVERY_OUTPUT || DEFAULT_OUT;
const outputPath = path.isAbsolute(outputRaw) ? outputRaw : path.join(ROOT, outputRaw);

if (policy?.policy !== 'FAIL_CLOSED_SCARCITY_SOURCE_DISCOVERY_WORK_PACKETS') throw new Error('Invalid scarcity source discovery policy');
if (input?.mode !== policy.requiredInputMode) throw new Error(`Invalid scarcity source qualification input mode: ${input?.mode || 'missing'}`);
if (policy?.requiredSignalType !== 'TOTAL_PRODUCED') throw new Error('Scarcity source discovery must require TOTAL_PRODUCED');
if (!Array.isArray(policy?.sourceTiers) || policy.sourceTiers.length === 0) throw new Error('Scarcity source discovery requires source tiers');
for (const tier of policy.sourceTiers) {
  if (!tier?.id || !(Number(tier.priority) > 0) || tier.requiresExplicitQuantity !== true || tier.requiresCommercialReuseRights !== true || tier.requiresDocumentedAutomatedAccess !== true) {
    throw new Error('Unsafe or incomplete scarcity source tier');
  }
}
for (const field of Object.keys(policy?.safety || {})) {
  if (policy.safety[field] !== false) throw new Error(`Unsafe scarcity source discovery policy: ${field}`);
}

const genericTitles = new Set((policy?.specificity?.genericExactTitles || []).map(normalize));
const unsafeDescriptionPhrases = policy?.specificity?.unsafeDescriptionPhrases || [];
const workPackets = [];
const reviewPackets = [];
const excludedPackets = [];
const byVertical = {};
let structuralErrors = 0;

for (const row of input.matrix || []) {
  if (!row?.candidateKey || !row?.vertical) {
    structuralErrors += 1;
    continue;
  }
  if (!byVertical[row.vertical]) byVertical[row.vertical] = { sourceDiscoveryReady: 0, reviewRequired: 0, excluded: 0 };

  if (row.qualificationStatus !== policy.eligibleQualificationStatus) {
    reviewPackets.push({
      candidateKey: row.candidateKey,
      canonicalTitle: row.canonicalTitle || null,
      vertical: row.vertical,
      status: 'UPSTREAM_SCOPE_OR_QUALIFICATION_REVIEW_REQUIRED',
      reason: row.qualificationStatus || 'MISSING_QUALIFICATION_STATUS',
    });
    byVertical[row.vertical].reviewRequired += 1;
    continue;
  }

  const title = row.canonicalTitle || '';
  const description = row.description || '';
  const genericTitle = genericTitles.has(normalize(title));
  const unsafeDescriptionHits = unsafeDescriptionPhrases.filter((phrase) => includesPhrase(description, phrase));
  const institutionalArchive = row.currentReferenceSourceClass === 'INSTITUTION_ARCHIVE';
  const modelSpecific = hasModelSpecificity(title);

  if (unsafeDescriptionHits.length > 0) {
    excludedPackets.push({
      candidateKey: row.candidateKey,
      canonicalTitle: title || null,
      vertical: row.vertical,
      status: 'EXCLUDED_NON_PRODUCT_OR_MEDIA_CONTAMINATION',
      reasonHits: unsafeDescriptionHits,
    });
    byVertical[row.vertical].excluded += 1;
    continue;
  }

  if (genericTitle || (institutionalArchive && policy?.specificity?.institutionalArchiveRequiresModelSpecificity === true && !modelSpecific)) {
    reviewPackets.push({
      candidateKey: row.candidateKey,
      canonicalTitle: title || null,
      vertical: row.vertical,
      status: genericTitle ? 'ENTITY_SPECIFICITY_REVIEW_REQUIRED_GENERIC_TITLE' : 'ENTITY_SPECIFICITY_REVIEW_REQUIRED_INSTITUTIONAL_OBJECT',
      currentReferenceSourceClass: row.currentReferenceSourceClass || null,
    });
    byVertical[row.vertical].reviewRequired += 1;
    continue;
  }

  workPackets.push({
    candidateKey: row.candidateKey,
    canonicalTitle: title || null,
    vertical: row.vertical,
    discoveryStatus: 'OFFICIAL_OR_OPEN_RIGHTS_SOURCE_DISCOVERY_PENDING',
    requiredSignalType: 'TOTAL_PRODUCED',
    currentReference: {
      source: row.currentReferenceSource || null,
      sourceClass: row.currentReferenceSourceClass || null,
      rightsClass: row.currentReferenceRightsClass || null,
      sourceUrl: row.currentReferenceSourceUrl || null,
    },
    querySeeds: [
      `"${title}" "total produced"`,
      `"${title}" production quantity`,
      `"${title}" edition size`,
    ],
    sourceTiers: policy.sourceTiers,
    evidenceChecklist: policy.evidenceChecklist,
    qualifiedScarcitySource: false,
    automaticQualificationAllowed: false,
  });
  byVertical[row.vertical].sourceDiscoveryReady += 1;
}

const disposition = structuralErrors > 0
  ? 'FAIL_CLOSED_STRUCTURAL_ERRORS'
  : workPackets.length > 0
    ? 'SOURCE_DISCOVERY_WORK_PACKETS_READY'
    : 'NO_ENTITY_SPECIFIC_SOURCE_DISCOVERY_TARGETS';

const report = {
  schemaVersion: '1.0.0',
  mode: 'KIDULT100_SCARCITY_SOURCE_DISCOVERY_PLAN',
  generatedAt: new Date().toISOString(),
  policy: policy.policy,
  metrics: {
    inputTargets: Array.isArray(input.matrix) ? input.matrix.length : 0,
    sourceDiscoveryReadyTargets: workPackets.length,
    specificityReviewTargets: reviewPackets.length,
    excludedContaminationTargets: excludedPackets.length,
    automaticallyQualifiedSources: 0,
    structuralErrors,
    byVertical,
  },
  sourceContract: {
    requiredSignalType: 'TOTAL_PRODUCED',
    sourceTiers: policy.sourceTiers.map((tier) => tier.id),
    evidenceChecklist: policy.evidenceChecklist,
    searchOrDiscoveryDoesNotConstituteQualification: true,
  },
  safety: {
    syntheticOrEstimatedQuantityCreated: false,
    searchSnippetAcceptedAsEvidence: false,
    unauthorizedScrapingRequested: false,
    paidProviderProcurementRequested: false,
    contractExecutionRequested: false,
    productionScoringActivated: false,
  },
  disposition,
  workPackets,
  reviewPackets,
  excludedPackets,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
console.log(`Scarcity source discovery plan: input=${report.metrics.inputTargets} ready=${workPackets.length} review=${reviewPackets.length} excluded=${excludedPackets.length} errors=${structuralErrors}`);
console.log(`disposition=${disposition}`);
if (structuralErrors > 0) process.exitCode = 1;
