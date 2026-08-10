import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CANDIDATE_PATH = path.join(ROOT, 'reports', 'kidult100-poc', 'kidult100-poc-latest.json');
const OUT_DIR = path.join(ROOT, 'reports', 'kidult100-right-data');
const OUT_PATH = path.join(OUT_DIR, 'open-evidence-latest.json');
const UA = 'KIDULTS-Kidult100-Open-Right-Data/1.0 (CC0 evidence only)';

fs.mkdirSync(OUT_DIR, { recursive: true });
if (!fs.existsSync(CANDIDATE_PATH)) throw new Error(`Missing candidate report: ${CANDIDATE_PATH}`);

const report = JSON.parse(fs.readFileSync(CANDIDATE_PATH, 'utf8'));
const candidates = Array.isArray(report.candidates) ? report.candidates : [];
const wikidataCandidates = candidates.filter((candidate) => candidate.source === 'wikidata' && /^Q\d+$/.test(String(candidate.sourceRecordId || '')));

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function getJson(url) {
  const response = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': UA },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`HTTP_${response.status}:${url}`);
  return response.json();
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

function evidenceRecord(candidate, primitive, entity, evidenceClass, value) {
  const sourceUrl = `https://www.wikidata.org/wiki/${candidate.sourceRecordId}`;
  return {
    candidateKey: candidate.candidateKey,
    primitive,
    source: 'wikidata',
    sourceUrl,
    rightsClass: 'CC0_STRUCTURED_DATA',
    observedAt: new Date().toISOString(),
    payloadHash: hash({ entityId: candidate.sourceRecordId, primitive, value }),
    evidenceClass,
    value,
    safety: {
      openDataOnly: true,
      synthetic: false,
      estimated: false,
      marketTransactionClaim: false,
      sourceLicense: 'CC0_STRUCTURED_DATA',
    },
  };
}

const ids = [...new Set(wikidataCandidates.map((candidate) => candidate.sourceRecordId))];
const entityById = new Map();
const sourceErrors = [];

for (let i = 0; i < ids.length; i += 40) {
  const batch = ids.slice(i, i + 40);
  const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(batch.join('|'))}&props=claims|sitelinks&format=json&origin=*`;
  try {
    const body = await getJson(url);
    for (const [id, entity] of Object.entries(body.entities || {})) entityById.set(id, entity);
  } catch (error) {
    sourceErrors.push({ ids: batch, error: String(error?.message || error) });
  }
}

const evidence = [];
const candidateEvidenceSummary = [];

for (const candidate of wikidataCandidates) {
  const entity = entityById.get(candidate.sourceRecordId);
  if (!entity || entity.missing !== undefined) continue;

  const candidateEvidence = [];

  // SCARCITY: only assert when Wikidata exposes an explicit quantity produced (P1092).
  // No rarity score is inferred from price, age, brand, title, or query text.
  const totalProduced = bestQuantity(entity, 'P1092');
  if (totalProduced && totalProduced.amount > 0) {
    candidateEvidence.push(evidenceRecord(candidate, 'SCARCITY', entity, 'INDEPENDENT_VERIFICATION', {
      signalType: 'TOTAL_PRODUCED',
      property: 'P1092',
      totalProduced,
      interpretation: 'Explicit production quantity evidence; lower production may support scarcity analysis, but no scarcity score is inferred here.',
    }));
  }

  // DEMAND_ATTENTION: two CC0 structured proxies are allowed.
  // P2664 is units sold when present. Sitelinks are cultural attention breadth, not market demand.
  const unitsSold = bestQuantity(entity, 'P2664');
  const sitelinkCount = Object.keys(entity.sitelinks || {}).length;
  if (unitsSold && unitsSold.amount > 0) {
    candidateEvidence.push(evidenceRecord(candidate, 'DEMAND_ATTENTION', entity, 'DEMAND_CULTURAL_SIGNAL', {
      signalType: 'UNITS_SOLD_REFERENCE',
      property: 'P2664',
      unitsSold,
      interpretation: 'Structured units-sold reference; not a current transaction, liquidity, or price signal.',
    }));
  } else if (sitelinkCount >= 3) {
    candidateEvidence.push(evidenceRecord(candidate, 'DEMAND_ATTENTION', entity, 'DEMAND_CULTURAL_SIGNAL', {
      signalType: 'CULTURAL_ATTENTION_PROXY',
      sitelinkCount,
      interpretation: 'Cross-wiki cultural attention breadth only; explicitly not market demand, transaction volume, or willingness-to-pay.',
    }));
  }

  evidence.push(...candidateEvidence);
  candidateEvidenceSummary.push({
    candidateKey: candidate.candidateKey,
    wikidataId: candidate.sourceRecordId,
    scarcityEvidence: candidateEvidence.some((row) => row.primitive === 'SCARCITY'),
    demandAttentionEvidence: candidateEvidence.some((row) => row.primitive === 'DEMAND_ATTENTION'),
    sitelinkCount,
  });
}

const scarcityCount = evidence.filter((row) => row.primitive === 'SCARCITY').length;
const demandCount = evidence.filter((row) => row.primitive === 'DEMAND_ATTENTION').length;

const output = {
  schemaVersion: '1.0.0',
  mode: 'KIDULT100_OPEN_RIGHT_DATA_EVIDENCE',
  generatedAt: new Date().toISOString(),
  policy: {
    rightsMode: 'CC0_STRUCTURED_DATA_ONLY',
    syntheticEvidenceAllowed: false,
    estimatedMarketEvidenceAllowed: false,
    transactionComparableProduced: false,
    liquidityProduced: false,
    demandAttentionProxyMayRepresentMarketDemand: false,
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
    wikidataCandidates: wikidataCandidates.length,
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
console.log(`Open Right Data: wikidataCandidates=${wikidataCandidates.length} entities=${entityById.size} evidence=${evidence.length}`);
console.log(`scarcity=${scarcityCount} demandAttention=${demandCount} errors=${sourceErrors.length}`);
console.log('No transaction comparable or liquidity evidence was fabricated.');
