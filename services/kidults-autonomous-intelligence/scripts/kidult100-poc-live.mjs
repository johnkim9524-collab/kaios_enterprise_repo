import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'kidult100-poc-source-plan.json'), 'utf8'));
const OUT_DIR = path.join(ROOT, 'reports', 'kidult100-poc');
fs.mkdirSync(OUT_DIR, { recursive: true });

const UA = 'KIDULTS-Kidult100-POC/2.2 (semantic-relevance-v2; candidate-universe build)';

async function getJson(url) {
  const started = Date.now();
  const response = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': UA, 'AIC-User-Agent': UA },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`HTTP_${response.status}:${url}`);
  return { body: await response.json(), latencyMs: Date.now() - started };
}

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function searchWikidata(query, vertical) {
  const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(query)}&language=en&format=json&limit=8&origin=*`;
  const { body, latencyMs } = await getJson(url);
  const rows = Array.isArray(body.search) ? body.search : [];
  return rows.map((row) => ({
    candidateKey: `wikidata:${row.id}`,
    vertical,
    source: 'wikidata',
    sourceClass: 'REFERENCE_PUBLIC_DATA',
    sourceRecordId: row.id,
    canonicalTitle: row.label || null,
    description: row.description || null,
    sourceUrl: row.concepturi || `https://www.wikidata.org/wiki/${row.id}`,
    observedAt: new Date().toISOString(),
    rightsClass: 'CC0_STRUCTURED_DATA',
    intelligencePrimitives: ['IDENTITY', 'CANON_CULTURAL_STRENGTH'],
    query,
    latencyMs,
    payloadHash: hash(row),
  }));
}

async function searchMet(query, vertical) {
  const searchUrl = `https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&q=${encodeURIComponent(query)}`;
  const { body } = await getJson(searchUrl);
  const ids = Array.isArray(body.objectIDs) ? body.objectIDs.slice(0, 3) : [];
  const results = [];
  for (const id of ids) {
    const url = `https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`;
    const item = await getJson(url);
    results.push({
      candidateKey: `met:${item.body.objectID}`,
      vertical,
      source: 'met',
      sourceClass: 'INSTITUTION_ARCHIVE',
      sourceRecordId: String(item.body.objectID),
      canonicalTitle: item.body.title || null,
      description: item.body.objectName || item.body.classification || null,
      creator: item.body.artistDisplayName || null,
      objectDate: item.body.objectDate || null,
      sourceUrl: item.body.objectURL || url,
      observedAt: new Date().toISOString(),
      rightsClass: 'OPEN_ACCESS_PUBLIC_METADATA',
      intelligencePrimitives: ['IDENTITY', 'CANON_CULTURAL_STRENGTH'],
      query,
      latencyMs: item.latencyMs,
      payloadHash: hash(item.body),
    });
  }
  return results;
}

async function searchAic(query, vertical) {
  const url = `https://api.artic.edu/api/v1/artworks/search?q=${encodeURIComponent(query)}&limit=3&fields=id,title,artist_display,date_display,classification_title,api_link,is_public_domain`;
  const { body, latencyMs } = await getJson(url);
  const rows = Array.isArray(body.data) ? body.data : [];
  return rows.map((row) => ({
    candidateKey: `aic:${row.id}`,
    vertical,
    source: 'aic',
    sourceClass: 'INSTITUTION_ARCHIVE',
    sourceRecordId: String(row.id),
    canonicalTitle: row.title || null,
    description: row.classification_title || null,
    creator: row.artist_display || null,
    objectDate: row.date_display || null,
    sourceUrl: row.api_link || `https://api.artic.edu/api/v1/artworks/${row.id}`,
    observedAt: new Date().toISOString(),
    rightsClass: 'CC0_EXCEPT_DESCRIPTION_EXCLUDED',
    intelligencePrimitives: ['IDENTITY', 'CANON_CULTURAL_STRENGTH'],
    query,
    latencyMs,
    payloadHash: hash(row),
  }));
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

const GENERIC_QUERY_TOKENS = new Set([
  'classic', 'vintage', 'archive', 'design', 'figure', 'record', 'card', 'comic', 'watch', 'camera',
  'chair', 'automobile', 'furniture', 'toy', 'toys', 'model', 'models', 'memorabilia', 'sports', 'movie',
  'prop', 'game', 'gaming', 'music', 'screen', 'fashion', 'accessories', 'sneaker', 'industrial', 'mid', 'century',
]);

const VERTICAL_CONTEXT = {
  'toys-models': ['toy', 'toys', 'model', 'miniature', 'doll', 'figure', 'action figure', 'construction set', 'building set', 'lego', 'barbie', 'gundam', 'hot wheels'],
  'watches-jewelry': ['watch', 'wristwatch', 'timepiece', 'chronograph', 'jewelry', 'jewellery', 'rolex', 'omega', 'cartier', 'patek', 'audemars'],
  'automobiles-mobility': ['automobile', 'car', 'vehicle', 'sports car', 'roadster', 'coupe', 'ferrari', 'porsche', 'lamborghini', 'toyota', 'mercedes'],
  'fashion-accessories': ['fashion', 'handbag', 'bag', 'trunk', 'shoe', 'sneaker', 'accessory', 'apparel', 'hermes', 'chanel', 'jordan', 'vuitton'],
  'design-furniture': ['chair', 'furniture', 'table', 'stool', 'desk', 'sofa', 'design', 'industrial design', 'eames', 'jacobsen', 'sottsass', 'corbusier'],
  'technology-cameras': ['camera', 'computer', 'macintosh', 'walkman', 'electronics', 'technology', 'leica', 'polaroid', 'sony', 'apple', 'braun'],
  'gaming-music-screen': ['video game', 'console', 'game', 'arcade', 'record', 'vinyl', 'film', 'movie', 'prop', 'nintendo', 'playstation', 'game boy'],
  'cards-comics-memorabilia': ['card', 'trading card', 'comic', 'memorabilia', 'baseball card', 'pokemon', 'marvel', 'dc comics', 'sports memorabilia'],
};

function containsPhrase(haystack, phrase) {
  const normalizedHaystack = ` ${normalize(haystack)} `;
  const normalizedPhrase = normalize(phrase);
  return normalizedPhrase.length > 0 && normalizedHaystack.includes(` ${normalizedPhrase} `);
}

function semanticRelevanceV2(item) {
  const query = normalize(item.query);
  const title = normalize(item.canonicalTitle);
  const description = normalize(item.description);
  const creator = normalize(item.creator);
  if (!query || !title) return { relevant: false, score: 0, reasons: ['MISSING_QUERY_OR_TITLE'], version: 'SEMANTIC_V2' };

  const queryTokens = tokens(query);
  const anchors = queryTokens.filter((token) => !GENERIC_QUERY_TOKENS.has(token));
  const effectiveAnchors = anchors.length ? anchors : queryTokens;
  const titleTokens = new Set(tokens(title));
  const descriptionTokens = new Set(tokens(description));
  const creatorTokens = new Set(tokens(creator));

  const titleAnchorHits = effectiveAnchors.filter((token) => titleTokens.has(token)).length;
  const descriptionAnchorHits = effectiveAnchors.filter((token) => descriptionTokens.has(token)).length;
  const creatorAnchorHits = effectiveAnchors.filter((token) => creatorTokens.has(token)).length;
  const exactTitleQuery = title === query;
  const queryContainedInTitle = containsPhrase(title, query);
  const allAnchorsInTitle = effectiveAnchors.length > 0 && effectiveAnchors.every((token) => titleTokens.has(token));

  const contextPhrases = VERTICAL_CONTEXT[item.vertical] || [];
  const contextText = `${item.canonicalTitle || ''} ${item.description || ''} ${item.creator || ''}`;
  const verticalContextHits = contextPhrases.filter((phrase) => containsPhrase(contextText, phrase));
  const hasVerticalContext = verticalContextHits.length > 0;

  let score = 0;
  const reasons = [];
  if (exactTitleQuery) { score += 0.45; reasons.push('EXACT_TITLE_QUERY'); }
  else if (queryContainedInTitle) { score += 0.38; reasons.push('QUERY_PHRASE_IN_TITLE'); }
  else if (allAnchorsInTitle) { score += 0.32; reasons.push('ALL_ANCHORS_IN_TITLE'); }
  else if (titleAnchorHits > 0) { score += Math.min(0.26, 0.13 * titleAnchorHits); reasons.push('PARTIAL_TITLE_ANCHOR'); }

  if (descriptionAnchorHits > 0) { score += Math.min(0.12, 0.06 * descriptionAnchorHits); reasons.push('DESCRIPTION_ANCHOR'); }
  if (creatorAnchorHits > 0) { score += Math.min(0.12, 0.06 * creatorAnchorHits); reasons.push('CREATOR_ANCHOR'); }
  if (hasVerticalContext) { score += 0.28; reasons.push('VERTICAL_CONTEXT'); }

  if (item.sourceClass === 'REFERENCE_PUBLIC_DATA') {
    score += 0.12;
    reasons.push('REFERENCE_SOURCE');
  }

  const institutionalArchive = item.sourceClass === 'INSTITUTION_ARCHIVE';
  if (institutionalArchive) {
    // Museum/archive search often returns artworks whose title happens to equal a product or brand.
    // Require independent vertical/object context or creator/query reinforcement; title equality alone is insufficient.
    const archiveContextConfirmed = hasVerticalContext || descriptionAnchorHits > 0 || creatorAnchorHits > 0;
    if (!archiveContextConfirmed) {
      score = Math.min(score, 0.49);
      reasons.push('ARCHIVE_TITLE_ONLY_CAPPED');
    } else {
      score += 0.05;
      reasons.push('ARCHIVE_CONTEXT_CONFIRMED');
    }
  }

  score = Math.max(0, Math.min(1, Number(score.toFixed(4))));
  const relevant = score >= 0.6;
  if (!relevant) reasons.push('BELOW_0_60_THRESHOLD');
  return {
    relevant,
    score,
    threshold: 0.6,
    version: 'SEMANTIC_V2',
    reasons,
    diagnostics: {
      titleAnchorHits,
      descriptionAnchorHits,
      creatorAnchorHits,
      verticalContextHits,
    },
  };
}

const collectors = [searchWikidata, searchMet, searchAic];
const sourceErrors = [];
const raw = [];
for (const vertical of CONFIG.coreVerticals) {
  for (const query of vertical.discoveryQueries) {
    for (const collector of collectors) {
      try {
        raw.push(...await collector(query, vertical.id));
      } catch (error) {
        sourceErrors.push({ vertical: vertical.id, query, collector: collector.name, error: String(error?.message || error) });
      }
    }
  }
}

const exactKeyCounts = new Map();
for (const item of raw) exactKeyCounts.set(item.candidateKey, (exactKeyCounts.get(item.candidateKey) || 0) + 1);
const duplicateRawObservations = [...exactKeyCounts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
const rawDuplicateObservationRate = raw.length ? duplicateRawObservations / raw.length : 0;

const deduped = new Map();
for (const item of raw) {
  if (!item.canonicalTitle || !item.sourceRecordId || !item.sourceUrl || !item.rightsClass) continue;
  if (!deduped.has(item.candidateKey)) deduped.set(item.candidateKey, item);
}

const candidates = [...deduped.values()].map((item) => {
  const semantic = semanticRelevanceV2(item);
  return {
    ...item,
    semanticRelevant: semantic.relevant,
    semanticRelevanceScore: semantic.score,
    semanticRelevanceVersion: semantic.version,
    semanticRelevanceReasons: semantic.reasons,
    semanticRelevanceDiagnostics: semantic.diagnostics,
  };
});
const acceptedKeyCount = new Set(candidates.map((c) => c.candidateKey)).size;
const acceptedDuplicateContamination = candidates.length ? (candidates.length - acceptedKeyCount) / candidates.length : 0;
const relevantCandidates = candidates.filter((candidate) => candidate.semanticRelevant);

const byVertical = Object.fromEntries(CONFIG.coreVerticals.map((v) => [v.id, candidates.filter((c) => c.vertical === v.id).length]));
const relevantByVertical = Object.fromEntries(CONFIG.coreVerticals.map((v) => [v.id, relevantCandidates.filter((c) => c.vertical === v.id).length]));
const bySource = Object.fromEntries(CONFIG.sources.map((s) => [s.id, candidates.filter((c) => c.source === s.id).length]));
const relevantBySource = Object.fromEntries(CONFIG.sources.map((s) => [s.id, relevantCandidates.filter((c) => c.source === s.id).length]));
const provenanceCoverage = candidates.length ? candidates.filter((c) => c.sourceUrl && c.observedAt && c.payloadHash).length / candidates.length : 0;
const rightsClassificationCoverage = candidates.length ? candidates.filter((c) => Boolean(c.rightsClass)).length / candidates.length : 0;
const semanticRelevanceCoverage = candidates.length ? relevantCandidates.length / candidates.length : 0;

const report = {
  schemaVersion: '2.2.0',
  mode: CONFIG.mode,
  generatedAt: new Date().toISOString(),
  target: {
    candidates: CONFIG.stage2Gate.minimumUniqueCandidates,
    coreVerticals: CONFIG.stage2Gate.requiredCoreVerticalCoverage,
    minimumCandidatesPerVertical: CONFIG.stage2Gate.minimumCandidatesPerVertical,
  },
  semanticPolicy: {
    version: 'SEMANTIC_V2',
    threshold: 0.6,
    institutionalArchiveTitleOnlyAccepted: false,
    principle: 'A matching title alone is not sufficient for archive records; vertical/object context is required.',
  },
  metrics: {
    rawObservations: raw.length,
    uniqueNormalizedCandidates: candidates.length,
    semanticRelevantCandidates: relevantCandidates.length,
    provenanceCoverage,
    rightsClassificationCoverage,
    semanticRelevanceCoverage,
    rawDuplicateObservationRate,
    acceptedDuplicateContamination,
    sourceErrorCount: sourceErrors.length,
    byVertical,
    relevantByVertical,
    bySource,
    relevantBySource,
  },
  candidateBuild: {
    outcome: 'BUILT_NOT_CERTIFIED',
    note: 'Stage 2 certification occurs only after Right Data enrichment. Semantic Relevance v2 rejects archive title-only false positives.',
  },
  claims: {
    liveExternalNetworkCollection: true,
    normalizedCandidateUniverseBuilt: true,
    semanticRelevanceV2Applied: true,
    decisionGradeRightDataCertified: false,
    finalKidult100Certified: false,
    marketPriceIntelligenceCertified: false,
    whyCausalityCertified: false,
  },
  candidates,
  sourceErrors,
};

fs.writeFileSync(path.join(OUT_DIR, 'kidult100-poc-latest.json'), JSON.stringify(report, null, 2));
console.log(`Kidult100 candidate build v2.2: raw=${raw.length} unique=${candidates.length} relevant=${relevantCandidates.length} errors=${sourceErrors.length}`);
console.log(`provenance=${provenanceCoverage} rights=${rightsClassificationCoverage} semantic=${semanticRelevanceCoverage}`);
console.log(`rawDuplicateObservationRate=${rawDuplicateObservationRate} acceptedDuplicateContamination=${acceptedDuplicateContamination}`);
console.log(`relevantVerticals=${JSON.stringify(relevantByVertical)}`);
console.log(`relevantSources=${JSON.stringify(relevantBySource)}`);
