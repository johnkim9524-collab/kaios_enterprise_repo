function normalize(value) {
  return String(value || '').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function normalizeExactTitle(value) {
  return String(value || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/\+/g, ' plus ')
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

function hasModelSpecificity(value) {
  const raw = String(value || '');
  return /\b[A-Za-z]{1,8}[- ]?\d{1,5}[A-Za-z]?\b/.test(raw)
    || /\b\d{2,4}[-–]\d{2,4}\b/.test(raw)
    || /\b(model|series|mark|mk)\b/i.test(raw);
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

function isEligibleWikidataCandidate(candidate, vertical, evaluation) {
  return Boolean(
    candidate
    && candidate.vertical === vertical
    && candidate.source === 'wikidata'
    && candidate.sourceClass === 'REFERENCE_PUBLIC_DATA'
    && candidate.rightsClass === 'CC0_STRUCTURED_DATA'
    && evaluation?.accepted === true
  );
}

function traceKey(vertical, query) {
  return `${String(vertical || '')}\u0000${String(query || '')}`;
}

function applyRecoveryContext(candidate, query, evaluation, action) {
  const identity = stableIdentity(candidate);
  const recoveryQuery = evaluation?.modelSpecificNoDescription ? candidate.canonicalTitle : query;
  const updated = {
    ...candidate,
    query: recoveryQuery,
    semanticRelevant: true,
    semanticRelevanceScore: 1,
    semanticRelevanceVersion: action === 'REFRESH'
      ? 'SEMANTIC_V2_8_WIKIDATA_EXACT_QUERY_PROOF_REFRESH'
      : 'SEMANTIC_V2_6_WIKIDATA_EXACT_QUERY_REQUALIFICATION',
    semanticStageA: { name: 'BROAD_RECALL_GATE', passed: true, reasons: ['RECOVERY_DISTINCTIVE_QUERY_ANCHORS_ALL_MATCHED'] },
    semanticStageB: { name: 'PRECISION_VERIFIER', passed: true, reasons: ['RECOVERY_EXACT_CURATED_PRODUCT_QUERY_MATCH'] },
    semanticRelevanceDiagnostics: {
      ...(candidate.semanticRelevanceDiagnostics || {}),
      precisionRecovery: {
        requalifiedExistingCandidate: action === 'REQUALIFY',
        refreshedExistingRelevantCandidate: action === 'REFRESH',
        semanticSearchContextOnlyNotEvidence: true,
        originalQuery: candidate.query || null,
        recoveryQuery: query,
        recoverySearchPayloadHash: evaluation.recoverySearchPayloadHash || null,
        recoveryObservedAt: evaluation.recoveryObservedAt || null,
        anchors: evaluation.anchors,
        anchorHits: evaluation.anchorHits,
        allDistinctiveAnchorsMatched: evaluation.allDistinctiveAnchorsMatched,
        productHits: evaluation.productHits,
        queryProductHits: evaluation.queryProductHits,
        disallowedHits: evaluation.disallowedHits,
        modelSpecificNoDescription: evaluation.modelSpecificNoDescription,
        exactCuratedProductQueryMatch: evaluation.exactCuratedProductQueryMatch,
      },
    },
  };
  if (JSON.stringify(identity) !== JSON.stringify(stableIdentity(updated))) {
    throw new Error(`Precision recovery mutated source identity: ${candidate.candidateKey}`);
  }
  return updated;
}

export function buildCompleteWikidataQueryTrace(candidates, expectedLimit = 8) {
  if (!Number.isInteger(expectedLimit) || expectedLimit <= 0) throw new Error('Precision recovery trace limit must be a positive integer');
  const grouped = new Map();
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    if (
      candidate?.source !== 'wikidata'
      || candidate?.sourceClass !== 'REFERENCE_PUBLIC_DATA'
      || candidate?.rightsClass !== 'CC0_STRUCTURED_DATA'
      || !candidate?.vertical
      || !candidate?.query
      || !candidate?.sourceRecordId
      || !candidate?.canonicalTitle
      || !candidate?.sourceUrl
      || !candidate?.payloadHash
      || !candidate?.observedAt
    ) continue;
    const key = traceKey(candidate.vertical, candidate.query);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(candidate);
  }

  const complete = new Map();
  for (const [key, rows] of grouped.entries()) {
    if (rows.length !== expectedLimit) continue;
    if (new Set(rows.map((row) => row.sourceRecordId)).size !== expectedLimit) continue;
    complete.set(key, rows.map((row) => ({
      id: row.sourceRecordId,
      label: row.canonicalTitle,
      description: row.description || null,
      concepturi: row.sourceUrl,
      payloadHash: row.payloadHash,
      observedAt: row.observedAt,
      traceSource: 'POC_COMPLETE_QUERY_RESULT_SET',
    })));
  }
  return complete;
}

export function getCompleteWikidataTraceRows(trace, vertical, query) {
  if (!(trace instanceof Map)) return null;
  const rows = trace.get(traceKey(vertical, query));
  return Array.isArray(rows) ? rows.map((row) => ({ ...row })) : null;
}

export function getReusableExistingWikidataRows(candidates, vertical) {
  if (!Array.isArray(candidates) || !vertical) return [];
  return candidates
    .filter((candidate) => (
      candidate?.vertical === vertical
      && candidate?.source === 'wikidata'
      && candidate?.sourceClass === 'REFERENCE_PUBLIC_DATA'
      && candidate?.rightsClass === 'CC0_STRUCTURED_DATA'
      && candidate?.sourceRecordId
      && candidate?.canonicalTitle
      && candidate?.sourceUrl
      && candidate?.payloadHash
      && candidate?.observedAt
    ))
    .map((candidate) => ({
      id: candidate.sourceRecordId,
      label: candidate.canonicalTitle,
      description: candidate.description || null,
      concepturi: candidate.sourceUrl,
      payloadHash: candidate.payloadHash,
      observedAt: candidate.observedAt,
      traceSource: 'POC_EXISTING_SOURCE_NATIVE_CANDIDATE',
    }));
}

export function evaluatePrecisionRecoveryRow({ query, row, productTerms, disallowedTerms, stopTokens }) {
  const context = `${row?.label || ''} ${row?.description || ''}`;
  const contextTokens = new Set(tokens(context));
  const stop = new Set((stopTokens || []).map(normalize));
  const anchors = tokens(query).filter((token) => !stop.has(token));
  const anchorHits = anchors.filter((token) => contextTokens.has(token));
  const allDistinctiveAnchorsMatched = anchors.length > 0 && anchorHits.length === anchors.length;
  const productHits = (productTerms || []).filter((term) => includesPhrase(context, term));
  const queryProductHits = (productTerms || []).filter((term) => includesPhrase(query, term));
  const disallowedHits = (disallowedTerms || []).filter((term) => includesPhrase(row?.description, term));
  const noDescription = normalize(row?.description).length === 0;
  const exactTitleRequired = queryProductHits.length === 0;
  const exactTitleMatched = normalizeExactTitle(row?.label) === normalizeExactTitle(query);
  const modelSpecificNoDescription = allDistinctiveAnchorsMatched
    && queryProductHits.length > 0
    && disallowedHits.length === 0
    && noDescription
    && hasModelSpecificity(row?.label);
  const exactCuratedProductQueryMatch = allDistinctiveAnchorsMatched
    && disallowedHits.length === 0
    && (productHits.length > 0 || modelSpecificNoDescription)
    && (!exactTitleRequired || exactTitleMatched);
  return {
    accepted: exactCuratedProductQueryMatch,
    anchors,
    anchorHits,
    allDistinctiveAnchorsMatched,
    productHits,
    queryProductHits,
    disallowedHits,
    noDescription,
    exactTitleRequired,
    exactTitleMatched,
    modelSpecificNoDescription,
    exactCuratedProductQueryMatch,
  };
}

export function canRequalifyExistingCandidate(candidate, vertical, evaluation) {
  return isEligibleWikidataCandidate(candidate, vertical, evaluation) && candidate.semanticRelevant !== true;
}

export function canRefreshExistingRelevantCandidate(candidate, vertical, evaluation) {
  return isEligibleWikidataCandidate(candidate, vertical, evaluation) && candidate.semanticRelevant === true;
}

export function requalifyExistingCandidate(candidate, query, evaluation) {
  return applyRecoveryContext(candidate, query, evaluation, 'REQUALIFY');
}

export function refreshExistingRelevantCandidate(candidate, query, evaluation) {
  return applyRecoveryContext(candidate, query, evaluation, 'REFRESH');
}
