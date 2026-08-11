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

function hasModelSpecificity(value) {
  const raw = String(value || '');
  return /\b[A-Za-z]{1,8}[- ]?\d{1,5}[A-Za-z]?\b/.test(raw)
    || /\b\d{2,4}[-–]\d{2,4}\b/.test(raw)
    || /\b(model|series|mark|mk)\b/i.test(raw);
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
  const modelSpecificNoDescription = allDistinctiveAnchorsMatched
    && queryProductHits.length > 0
    && disallowedHits.length === 0
    && noDescription
    && hasModelSpecificity(row?.label);
  const exactCuratedProductQueryMatch = allDistinctiveAnchorsMatched
    && disallowedHits.length === 0
    && (productHits.length > 0 || modelSpecificNoDescription);
  return {
    accepted: exactCuratedProductQueryMatch,
    anchors,
    anchorHits,
    allDistinctiveAnchorsMatched,
    productHits,
    queryProductHits,
    disallowedHits,
    noDescription,
    modelSpecificNoDescription,
    exactCuratedProductQueryMatch,
  };
}

export function canRequalifyExistingCandidate(candidate, vertical, evaluation) {
  return Boolean(
    candidate
    && candidate.semanticRelevant !== true
    && candidate.vertical === vertical
    && candidate.source === 'wikidata'
    && candidate.sourceClass === 'REFERENCE_PUBLIC_DATA'
    && candidate.rightsClass === 'CC0_STRUCTURED_DATA'
    && evaluation?.accepted === true
  );
}

export function requalifyExistingCandidate(candidate, query, evaluation) {
  const identity = {
    candidateKey: candidate.candidateKey,
    source: candidate.source,
    sourceClass: candidate.sourceClass,
    sourceRecordId: candidate.sourceRecordId,
    sourceUrl: candidate.sourceUrl,
    rightsClass: candidate.rightsClass,
    observedAt: candidate.observedAt,
    payloadHash: candidate.payloadHash,
  };
  const recoveryQuery = evaluation?.modelSpecificNoDescription ? candidate.canonicalTitle : query;
  const updated = {
    ...candidate,
    query: recoveryQuery,
    semanticRelevant: true,
    semanticRelevanceScore: 1,
    semanticRelevanceVersion: 'SEMANTIC_V2_6_WIKIDATA_EXACT_QUERY_REQUALIFICATION',
    semanticStageA: { name: 'BROAD_RECALL_GATE', passed: true, reasons: ['RECOVERY_DISTINCTIVE_QUERY_ANCHORS_ALL_MATCHED'] },
    semanticStageB: { name: 'PRECISION_VERIFIER', passed: true, reasons: ['RECOVERY_EXACT_CURATED_PRODUCT_QUERY_MATCH'] },
    semanticRelevanceDiagnostics: {
      ...(candidate.semanticRelevanceDiagnostics || {}),
      precisionRecovery: {
        requalifiedExistingCandidate: true,
        originalQuery: candidate.query || null,
        recoveryQuery: query,
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
  const updatedIdentity = {
    candidateKey: updated.candidateKey,
    source: updated.source,
    sourceClass: updated.sourceClass,
    sourceRecordId: updated.sourceRecordId,
    sourceUrl: updated.sourceUrl,
    rightsClass: updated.rightsClass,
    observedAt: updated.observedAt,
    payloadHash: updated.payloadHash,
  };
  if (JSON.stringify(identity) !== JSON.stringify(updatedIdentity)) throw new Error(`Precision recovery mutated source identity: ${candidate.candidateKey}`);
  return updated;
}
