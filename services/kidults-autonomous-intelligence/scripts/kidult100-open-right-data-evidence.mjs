import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CANDIDATE_PATH = path.join(ROOT, 'reports', 'kidult100-poc', 'kidult100-poc-latest.json');
const OUT_DIR = path.join(ROOT, 'reports', 'kidult100-right-data');
const OUT_PATH = path.join(OUT_DIR, 'open-evidence-latest.json');
const UA = 'KIDULTS-Kidult100-Open-Right-Data/1.1 (CC0 evidence only)';

fs.mkdirSync(OUT_DIR, { recursive: true });
if (!fs.existsSync(CANDIDATE_PATH)) throw new Error(`Missing candidate report: ${CANDIDATE_PATH}`);

const report = JSON.parse(fs.readFileSync(CANDIDATE_PATH, 'utf8'));
const candidates = Array.isArray(report.candidates) ? report.candidates : [];
const relevantCandidates = candidates.filter((candidate) => candidate.semanticRelevant);

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function normalize(value) {
  return String(value || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

async function getJson(url) {
  const response = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': UA },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`HTTP_${response.status}:${url}`);
  return response.json();
}

async function resolveWikidataId(candidate) {
  const existingId = String(candidate.sourceRecordId || '');
  if (candidate.source === 'wikidata' && /^Q\d+$/.test(existingId)) {
    return { id: existingId, method: 'SOURCE_NATIVE', confidence: 1 };
  }

  const title = String(candidate.canonicalTitle || '').trim();
  if (!title) return null;
  const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(title)}&language=en&format=json&limit=5&origin=*`;
  const body = await getJson(url);
  const target = normalize(title);
  const rows = Array.isArray(body.search) ? body.search : [];
  const exact = rows.find((row) => /^Q\d+$/.test(String(row.id || '')) && normalize(row.label) === target);
  if (!exact) return null;
  return {
    id: exact.id,
    method: 'EXACT_NORMALIZED_LABEL',
    confidence: 0.95,
    matchedLabel: exact.label || null,
    description: exact.description || null,
  };
}

function bestQuantity(entity, propertyId) {
  const statements = Array.isArray(entity?.claims?.[propertyId]) ? entity.claims[propertyId] : [];
  const ranked = statements
    .filter((statement) => statement?.mainsnak?.snaktype === 'value')
    .sort((a, b) => (a.rank === 'preferred' ? -1 : 0) - (b.rank === 'preferred' ? -1 : 0));
  for (const statement of ranked) {
    const value = statement?.mainsnak?.datavalue?.value;
    const amount = Number(value?.amount);
    if (Number.isFinite(amount) && amount >= 0) {
      return {
        amount,
        unit: value?.unit || null,
        lowerBound: value?.lowerBound ? Number(value.lowerBound) : null,
        upperBound: value?.upperBound ? Number(value.upperBound) : null,
        rank: statement.rank || 'normal',
        statementId: statement.id || null,
        referencesPresent: Array.isArray(statement.references) && statement.references.length > 0,
      };
    }
  }
  return null;
}

function evidenceRecord(candidate, primitive, entityId, evidenceClass, value, entityLink) {
  const sourceUrl = `https://www.wikidata.org/wiki/${entityId}`;
  return {
    candidateKey: candidate.candidateKey,
    primitive,
    source: 'wikidata',
    sourceUrl,
    rightsClass: 'CC0_STRUCTURED_DATA',
    observedAt: new Date().toISOString(),
    payloadHash: hash({ entityId, primitive, value }),
    evidenceClass,
    value,
    entityLink,
    safety: {
      openDataOnly: true,
      synthetic: false,
      estimated: false,
      marketTransactionClaim: false,
      sourceLicense: 'CC0_STRUCTURED_DATA',
    },
  };
}

const sourceErrors = [];
const entityLinks = new Map();
const titleResolutionCache = new Map();

for (const candidate of relevantCandidates) {
  try {
    const cacheKey = normalize(candidate.canonicalTitle);
    let resolved;
    if (candidate.source === 'wikidata' && /^Q\d+$/.test(String(candidate.sourceRecordId || ''))) {
      resolved = await resolveWikidataId(candidate);
    } else if (titleResolutionCache.has(cacheKey)) {
      resolved = titleResolutionCache.get(cacheKey);
    } else {
      resolved = await resolveWikidataId(candidate);
      titleResolutionCache.set(cacheKey, resolved);
    }
    if (resolved) entityLinks.set(candidate.candidateKey, resolved);
  } catch (error) {
    sourceErrors.push({ candidateKey: candidate.candidateKey, stage: 'ENTITY_RESOLUTION', error: String(error?.message || error) });
  }
}

const ids = [...new Set([...entityLinks.values()].map((link) => link.id))];
const entityById = new Map();
for (let i = 0; i < ids.length; i += 40) {
  const batch = ids.slice(i, i + 40);
  const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(batch.join('|'))}&props=claims|sitelinks&format=json&origin=*`;
  try {
    const body = await getJson(url);
    for (const [id, entity] of Object.entries(body.entities || {})) entityById.set(id, entity);
  } catch (error) {
    sourceErrors.push({ ids: batch, stage: 'ENTITY_FETCH', error: String(error?.message || error) });
  }
}

const evidence = [];
const candidateEvidenceSummary = [];

for (const candidate of relevantCandidates) {
  const entityLink = entityLinks.get(candidate.candidateKey);
  if (!entityLink) continue;
  const entity = entityById.get(entityLink.id);
  if (!entity || entity.missing !== undefined) continue;

  const candidateEvidence = [];

  // SCARCITY: only explicit total-produced quantity (P1092) is accepted.
  // Broad quantity, age, discontinued status, price, title, brand and model-year proxies are not promoted to scarcity.
  const totalProduced = bestQuantity(entity, 'P1092');
  if (totalProduced && totalProduced.amount > 0) {
    candidateEvidence.push(evidenceRecord(candidate, 'SCARCITY', entityLink.id, 'INDEPENDENT_VERIFICATION', {
      signalType: 'TOTAL_PRODUCED',
      property: 'P1092',
      totalProduced,
      interpretation: 'Explicit production quantity evidence only; no scarcity score is inferred.',
    }, entityLink));
  }

  // DEMAND_ATTENTION: P2664 is a structured sales-reference signal when present.
  // Otherwise sitelink breadth may be used only as cultural attention, never as market demand or liquidity.
  const unitsSold = bestQuantity(entity, 'P2664');
  const sitelinkCount = Object.keys(entity.sitelinks || {}).length;
  if (unitsSold && unitsSold.amount > 0) {
    candidateEvidence.push(evidenceRecord(candidate, 'DEMAND_ATTENTION', entityLink.id, 'DEMAND_CULTURAL_SIGNAL', {
      signalType: 'UNITS_SOLD_REFERENCE',
      property: 'P2664',
      unitsSold,
      interpretation: 'Structured units-sold reference; not a current transaction, liquidity, price or willingness-to-pay signal.',
    }, entityLink));
  } else if (sitelinkCount >= 3) {
    candidateEvidence.push(evidenceRecord(candidate, 'DEMAND_ATTENTION', entityLink.id, 'DEMAND_CULTURAL_SIGNAL', {
      signalType: 'CULTURAL_ATTENTION_PROXY',
      sitelinkCount,
      interpretation: 'Cross-wiki cultural attention breadth only; explicitly not market demand, transaction volume, liquidity or willingness-to-pay.',
    }, entityLink));
  }

  evidence.push(...candidateEvidence);
  candidateEvidenceSummary.push({
    candidateKey: candidate.candidateKey,
    canonicalTitle: candidate.canonicalTitle,
    wikidataId: entityLink.id,
    entityLinkMethod: entityLink.method,
    entityLinkConfidence: entityLink.confidence,
    scarcityEvidence: candidateEvidence.some((row) => row.primitive === 'SCARCITY'),
    demandAttentionEvidence: candidateEvidence.some((row) => row.primitive === 'DEMAND_ATTENTION'),
    sitelinkCount,
  });
}

const scarcityCount = evidence.filter((row) => row.primitive === 'SCARCITY').length;
const demandCount = evidence.filter((row) => row.primitive === 'DEMAND_ATTENTION').length;
const nativeLinks = [...entityLinks.values()].filter((link) => link.method === 'SOURCE_NATIVE').length;
const exactTitleLinks = [...entityLinks.values()].filter((link) => link.method === 'EXACT_NORMALIZED_LABEL').length;

const output = {
  schemaVersion: '1.1.0',
  mode: 'KIDULT100_OPEN_RIGHT_DATA_EVIDENCE',
  generatedAt: new Date().toISOString(),
  policy: {
    rightsMode: 'CC0_STRUCTURED_DATA_ONLY',
    syntheticEvidenceAllowed: false,
    estimatedMarketEvidenceAllowed: false,
    transactionComparableProduced: false,
    liquidityProduced: false,
    inferredScarcityAllowed: false,
    demandAttentionProxyMayRepresentMarketDemand: false,
    entityLinking: 'SOURCE_NATIVE_OR_EXACT_NORMALIZED_LABEL_ONLY',
  },
  source: {
    id: 'wikidata',
    license: 'CC0_STRUCTURED_DATA',
    properties: {
      scarcity: 'P1092 total produced',
      demandReference: 'P2664 units sold when present',
      attentionProxy: 'Wikidata sitelink count when >=3',
    },
  },
  metrics: {
    normalizedCandidates: candidates.length,
    semanticRelevantCandidates: relevantCandidates.length,
    linkedCandidates: entityLinks.size,
    nativeWikidataLinks: nativeLinks,
    exactTitleLinks,
    entitiesFetched: entityById.size,
    evidenceRecords: evidence.length,
    scarcityEvidenceRecords: scarcityCount,
    demandAttentionEvidenceRecords: demandCount,
    sourceErrorCount: sourceErrors.length,
  },
  evidence,
  candidateEvidenceSummary,
  sourceErrors,
};

fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));
console.log(`Open Right Data v1.1: relevant=${relevantCandidates.length} linked=${entityLinks.size} entities=${entityById.size} evidence=${evidence.length}`);
console.log(`nativeLinks=${nativeLinks} exactTitleLinks=${exactTitleLinks} scarcity=${scarcityCount} demandAttention=${demandCount} errors=${sourceErrors.length}`);
console.log('No inferred scarcity, transaction comparable or liquidity evidence was fabricated.');