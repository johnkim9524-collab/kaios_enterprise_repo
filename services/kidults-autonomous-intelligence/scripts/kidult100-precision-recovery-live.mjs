import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildCompleteWikidataQueryTrace,
  getCompleteWikidataTraceRows,
  getReusableExistingWikidataRows,
  evaluatePrecisionRecoveryRow,
  canRequalifyExistingCandidate,
  requalifyExistingCandidate,
} from './lib/precision-recovery.mjs';

const ROOT = process.cwd();
const POC_PATH = path.join(ROOT, 'reports', 'kidult100-poc', 'kidult100-poc-latest.json');
const CONFIG_PATH = path.join(ROOT, 'config', 'kidult100-precision-recovery-queries.json');
const REFERENCE_POLICY_PATH = path.join(ROOT, 'config', 'kidult100-reference-precision-policy.json');
const AUDIT_PATH = path.join(ROOT, 'reports', 'kidult100-poc', 'kidult100-precision-recovery-latest.json');
const CONTACT_URL = 'https://github.com/johnkim9524-collab/kaios_enterprise_repo';
const UA = `KIDULTS-Kidult100-Bot/2.9 (${CONTACT_URL}; Wikidata-only precision recovery)`;
const MIN_INTERVAL_MS = 0;
const MAX_RETRIES = 4;
const MAXLAG_SECONDS = 5;
const WIKIDATA_SEARCH_LIMIT = 8;
let lastRequestAt = 0;

function readJson(file) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`Missing JSON input: ${file}`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function normalize(value) {
  return String(value || '').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function tokens(value) {
  return normalize(value).split(/\s+/).filter((token) => token.length >= 2);
}

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const config = readJson(CONFIG_PATH);
const referencePolicy = readJson(REFERENCE_POLICY_PATH);
if (config?.mode !== 'KIDULT100_WIKIDATA_PRECISION_RECOVERY' || config?.source !== 'wikidata' || config?.rightsClass !== 'CC0_STRUCTURED_DATA') {
  throw new Error('Invalid precision recovery configuration identity');
}
for (const [key, expected] of Object.entries({
  wikidataOnly: true,
  officialApiOnly: true,
  genericCategoryQueriesAllowed: false,
  unauthorizedScrapingAllowed: false,
  paidProviderProcurementAllowed: false,
  syntheticEvidenceAllowed: false,
  productionGateRelaxationAllowed: false,
})) {
  if (config?.safety?.[key] !== expected) throw new Error(`Unsafe precision recovery setting: ${key}`);
}
if (referencePolicy?.policy !== 'FAIL_CLOSED_STAGE2_REFERENCE_PRODUCT_PRECISION_HARDENING') throw new Error('Reference precision policy unavailable');

// Archive hardening regression tests inject their own input. Never perform network recovery in that test/injected-input path.
if (process.env.KIDULTS_ARCHIVE_PRECISION_INPUT_JSON) {
  process.stdout.write('Precision recovery skipped for injected archive input.\n');
} else {
  const report = readJson(POC_PATH);
  if (report?.mode !== 'KIDULT100_VALUE_BEFORE_DATA_POC' || !Array.isArray(report?.candidates)) throw new Error('Unsafe POC input for precision recovery');

  const verticalIds = Object.keys(config.verticals || {});
  if (verticalIds.length !== 6) throw new Error('Precision recovery must be scoped to the six measured under-supply verticals');
  const sourcePlanVerticals = new Set(['toys-models', 'watches-jewelry', 'automobiles-mobility', 'fashion-accessories', 'design-furniture', 'technology-cameras', 'gaming-music-screen', 'cards-comics-memorabilia']);
  for (const vertical of verticalIds) {
    if (!sourcePlanVerticals.has(vertical)) throw new Error(`Unknown recovery vertical: ${vertical}`);
    const queries = config.verticals[vertical];
    if (!Array.isArray(queries) || queries.length < 20) throw new Error(`Insufficient exact recovery query buffer: ${vertical}`);
  }

  const genericExact = new Set((referencePolicy.genericQueries || []).map(normalize));
  const stopTokens = [
    ...(referencePolicy.queryStopTokens || []).map(normalize),
    'toy', 'doll', 'watch', 'wristwatch', 'shoe', 'shoes', 'sneaker', 'boot', 'handbag', 'bag',
    'camera', 'computer', 'console', 'game', 'video', 'handheld', 'comic', 'book', 'card', 'trading', 'baseball',
  ];

  const completeSameRunTrace = buildCompleteWikidataQueryTrace(report.candidates, WIKIDATA_SEARCH_LIMIT);
  const reusableExistingRowsByVertical = new Map(verticalIds.map((vertical) => [
    vertical,
    getReusableExistingWikidataRows(report.candidates, vertical),
  ]));
  const runtime = {
    requests: 0,
    retries: 0,
    rateLimits: 0,
    maxlagResponses: 0,
    errors: 0,
    traceEligibleQueries: completeSameRunTrace.size,
    traceReusedQueries: 0,
    existingCandidateEligibleRows: [...reusableExistingRowsByVertical.values()].reduce((total, rows) => total + rows.length, 0),
    existingCandidateResolvedQueries: 0,
    existingCandidateReusedRows: 0,
    networkQueries: 0,
    pacingMode: 'SERIAL_SERVER_DRIVEN_BACKPRESSURE',
    fixedInterRequestDelayMs: MIN_INTERVAL_MS,
    maxlagSeconds: MAXLAG_SECONDS,
    gzipRequested: true,
  };

  async function search(query) {
    runtime.networkQueries += 1;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      const elapsed = Date.now() - lastRequestAt;
      if (MIN_INTERVAL_MS > 0 && elapsed < MIN_INTERVAL_MS) await sleep(MIN_INTERVAL_MS - elapsed);
      lastRequestAt = Date.now();
      runtime.requests += 1;
      const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(query)}&language=en&format=json&limit=${WIKIDATA_SEARCH_LIMIT}&origin=*&maxlag=${MAXLAG_SECONDS}`;
      const response = await fetch(url, {
        headers: { accept: 'application/json', 'accept-encoding': 'gzip,deflate', 'user-agent': UA },
        signal: AbortSignal.timeout(15000),
      });
      const body = await response.json().catch(() => null);
      const maxlag = body?.error?.code === 'maxlag';
      if (response.ok && !maxlag) return Array.isArray(body?.search) ? body.search : [];

      if (maxlag) runtime.maxlagResponses += 1;
      if (maxlag || response.status === 429 || response.status >= 500) {
        if (response.status === 429) runtime.rateLimits += 1;
        if (attempt < MAX_RETRIES) {
          runtime.retries += 1;
          const retryAfterSeconds = Number(response.headers.get('retry-after'));
          const reportedLagSeconds = Number(body?.error?.lag);
          const waitMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
            ? retryAfterSeconds * 1000
            : maxlag && Number.isFinite(reportedLagSeconds) && reportedLagSeconds > 0
              ? Math.ceil(reportedLagSeconds * 1000)
              : Math.min(10000, 900 * (2 ** attempt));
          await sleep(waitMs);
          continue;
        }
      }
      throw new Error(maxlag ? 'WIKIDATA_MAXLAG' : `HTTP_${response.status}`);
    }
    throw new Error('WIKIDATA_RETRY_EXHAUSTED');
  }

  const candidates = report.candidates.map((candidate) => ({ ...candidate }));
  const candidateIndex = new Map(candidates.map((candidate, index) => [candidate.candidateKey, index]));
  const existing = new Set(candidateIndex.keys());
  const additions = [];
  const requalified = [];
  const rejected = [];
  const errors = [];

  for (const vertical of verticalIds) {
    const productTerms = referencePolicy.productObjectTermsByVertical?.[vertical] || [];
    const disallowedTerms = referencePolicy.disallowedDescriptionTermsByVertical?.[vertical] || [];
    for (const query of config.verticals[vertical]) {
      if (genericExact.has(normalize(query))) throw new Error(`Generic query entered precision recovery lane: ${query}`);
      const anchors = tokens(query).filter((token) => !new Set(stopTokens).has(token));
      if (anchors.length === 0) throw new Error(`Recovery query lacks distinctive anchor: ${query}`);
      let rows = getCompleteWikidataTraceRows(completeSameRunTrace, vertical, query);
      if (rows) {
        runtime.traceReusedQueries += 1;
      } else {
        const existingRows = reusableExistingRowsByVertical.get(vertical) || [];
        const locallyResolvedRows = existingRows.filter((row) => evaluatePrecisionRecoveryRow({
          query,
          row,
          productTerms,
          disallowedTerms,
          stopTokens,
        }).accepted === true);
        if (locallyResolvedRows.length > 0) {
          rows = locallyResolvedRows;
          runtime.existingCandidateResolvedQueries += 1;
          runtime.existingCandidateReusedRows += locallyResolvedRows.length;
        } else {
          try {
            rows = await search(query);
          } catch (error) {
            runtime.errors += 1;
            errors.push({ vertical, query, error: String(error?.message || error) });
            continue;
          }
        }
      }
      for (const row of rows) {
        if (!row?.id || !row?.label) continue;
        const candidateKey = `wikidata:${row.id}`;
        const evaluation = evaluatePrecisionRecoveryRow({ query, row, productTerms, disallowedTerms, stopTokens });
        evaluation.recoverySearchPayloadHash = row.payloadHash || hash(row);
        evaluation.recoveryObservedAt = row.observedAt || new Date().toISOString();
        const existingIndex = candidateIndex.get(candidateKey);

        if (existingIndex !== undefined) {
          const current = candidates[existingIndex];
          if (current.semanticRelevant === true) continue;
          if (canRequalifyExistingCandidate(current, vertical, evaluation)) {
            const updated = requalifyExistingCandidate(current, query, evaluation);
            candidates[existingIndex] = updated;
            requalified.push({
              candidateKey,
              vertical,
              query,
              label: row.label,
              productHits: evaluation.productHits,
              modelSpecificNoDescription: evaluation.modelSpecificNoDescription,
              searchContextSource: row.traceSource || 'LIVE_WIKIDATA_SEARCH',
            });
          } else if (!evaluation.accepted) {
            rejected.push({ candidateKey, vertical, query, label: row.label, anchorHits: evaluation.anchorHits, productHits: evaluation.productHits, disallowedHits: evaluation.disallowedHits, reason: 'EXISTING_CANDIDATE_NOT_PRECISION_RECOVERABLE' });
          } else {
            rejected.push({ candidateKey, vertical, query, label: row.label, reason: 'EXISTING_CANDIDATE_IDENTITY_OR_VERTICAL_NOT_ELIGIBLE' });
          }
          continue;
        }

        if (!evaluation.accepted) {
          rejected.push({ candidateKey, vertical, query, label: row.label, anchorHits: evaluation.anchorHits, productHits: evaluation.productHits, disallowedHits: evaluation.disallowedHits, reason: 'NEW_ROW_NOT_PRECISION_RECOVERABLE' });
          continue;
        }

        const observedAt = row.observedAt || new Date().toISOString();
        const addition = {
          candidateKey,
          vertical,
          source: 'wikidata',
          sourceClass: 'REFERENCE_PUBLIC_DATA',
          sourceRecordId: row.id,
          canonicalTitle: row.label,
          description: row.description || null,
          creator: null,
          objectDate: null,
          sourceUrl: row.concepturi || `https://www.wikidata.org/wiki/${row.id}`,
          observedAt,
          rightsClass: 'CC0_STRUCTURED_DATA',
          intelligencePrimitives: ['IDENTITY', 'CANON_CULTURAL_STRENGTH'],
          query: evaluation.modelSpecificNoDescription ? row.label : query,
          latencyMs: null,
          payloadHash: row.payloadHash || hash(row),
          semanticRelevant: true,
          semanticRelevanceScore: 1,
          semanticRelevanceVersion: 'SEMANTIC_V2_8_WIKIDATA_PRECISION_RECOVERY',
          semanticStageA: { name: 'BROAD_RECALL_GATE', passed: true, reasons: ['RECOVERY_DISTINCTIVE_QUERY_ANCHORS_ALL_MATCHED'] },
          semanticStageB: { name: 'PRECISION_VERIFIER', passed: true, reasons: ['RECOVERY_EXACT_CURATED_PRODUCT_QUERY_MATCH'] },
          semanticRelevanceDiagnostics: {
            precisionRecovery: {
              requalifiedExistingCandidate: false,
              semanticSearchContextOnlyNotEvidence: true,
              recoveryQuery: query,
              recoverySearchPayloadHash: evaluation.recoverySearchPayloadHash,
              recoveryObservedAt: evaluation.recoveryObservedAt,
              searchContextSource: row.traceSource || 'LIVE_WIKIDATA_SEARCH',
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
        additions.push(addition);
        candidates.push(addition);
        candidateIndex.set(candidateKey, candidates.length - 1);
        existing.add(candidateKey);
      }
    }
  }

  const relevant = candidates.filter((candidate) => candidate.semanticRelevant === true);
  const recall = candidates.filter((candidate) => candidate.semanticStageA?.passed === true);
  const sourceIds = [...new Set(candidates.map((candidate) => candidate.source).filter(Boolean))];
  const allVerticals = ['toys-models', 'watches-jewelry', 'automobiles-mobility', 'fashion-accessories', 'design-furniture', 'technology-cameras', 'gaming-music-screen', 'cards-comics-memorabilia'];
  const relevantByVertical = Object.fromEntries(allVerticals.map((vertical) => [vertical, relevant.filter((candidate) => candidate.vertical === vertical).length]));
  const relevantBySource = Object.fromEntries(sourceIds.map((source) => [source, relevant.filter((candidate) => candidate.source === source).length]));
  const hardened = {
    ...report,
    schemaVersion: '2.9.0',
    semanticPolicy: {
      ...(report.semanticPolicy || {}),
      precisionRecovery: 'WIKIDATA_ONLY_EXACT_PRODUCT_QUERY_RECOVERY_WITH_SOURCE_NATIVE_LOCAL_FIRST_REUSE',
      precisionRecoveryDoesNotBypassDownstreamReferenceHardening: true,
      traceReuseRequiresCompleteEightUniqueRowPOCResultSet: true,
      existingCandidateReuseRequiresSameRecoveryEvaluator: true,
    },
    metrics: {
      ...(report.metrics || {}),
      uniqueNormalizedCandidates: candidates.length,
      semanticRecallCandidates: recall.length,
      semanticRelevantCandidates: relevant.length,
      semanticRelevanceCoverage: candidates.length ? relevant.length / candidates.length : 0,
      relevantByVertical,
      relevantBySource,
      precisionRecoveryAddedCandidates: additions.length,
      precisionRecoveryRequalifiedCandidates: requalified.length,
      precisionRecoveryRuntime: runtime,
    },
    candidateBuild: {
      ...(report.candidateBuild || {}),
      outcome: 'BUILT_WITH_WIKIDATA_PRECISION_RECOVERY_NOT_CERTIFIED',
      note: 'Wikidata-only recovery first reuses an already observed same-vertical CC0 source-native candidate only when that row passes the identical exact-query recovery evaluator. Complete same-run eight-row traces remain reusable for exact query identity. Otherwise the workflow falls back to the official Wikidata API using serial requests with server-driven maxlag/Retry-After backpressure. Reuse never creates new evidence or mutates source identity, and downstream fail-closed archive/reference precision hardening remains authoritative.',
    },
    claims: {
      ...(report.claims || {}),
      precisionRecoveryApplied: true,
      precisionRecoveryExistingCandidateRequalificationApplied: requalified.length > 0,
      precisionRecoveryCompleteTraceReuseApplied: runtime.traceReusedQueries > 0,
      precisionRecoveryExistingCandidateReuseApplied: runtime.existingCandidateResolvedQueries > 0,
      rightsOrProvenanceRelaxed: false,
      finalKidult100Certified: false,
      decisionGradeRightDataCertified: false,
    },
    candidates,
    sourceErrors: [...(report.sourceErrors || []), ...errors.map((row) => ({ ...row, source: 'wikidata', collector: 'precisionRecovery' }))],
  };

  const audit = {
    schemaVersion: '1.4.0',
    mode: 'KIDULT100_WIKIDATA_PRECISION_RECOVERY_AUDIT',
    generatedAt: new Date().toISOString(),
    metrics: {
      inputCandidates: report.candidates.length,
      addedCandidates: additions.length,
      requalifiedExistingCandidates: requalified.length,
      rejectedSearchRows: rejected.length,
      outputCandidates: candidates.length,
      outputRelevantCandidates: relevant.length,
      addedByVertical: Object.fromEntries(verticalIds.map((vertical) => [vertical, additions.filter((candidate) => candidate.vertical === vertical).length])),
      requalifiedByVertical: Object.fromEntries(verticalIds.map((vertical) => [vertical, requalified.filter((candidate) => candidate.vertical === vertical).length])),
      runtime,
    },
    safety: {
      source: 'wikidata',
      rightsClass: 'CC0_STRUCTURED_DATA',
      officialApiOnly: true,
      serialReadRequests: true,
      serverDrivenBackpressure: true,
      maxlagSeconds: MAXLAG_SECONDS,
      fixedInterRequestDelayMs: MIN_INTERVAL_MS,
      gzipRequested: true,
      sameRunTraceReuseOnlyWhenCompleteEightUniqueRows: true,
      existingCandidateReuseOnlyWhenSameRecoveryEvaluatorPasses: true,
      existingCandidateReuseCreatesEvidence: false,
      incompleteTraceOrUnresolvedCandidateFallsBackToOfficialApi: true,
      traceReuseCreatesEvidence: false,
      sourceIdentityMutationAllowed: false,
      syntheticEvidenceCreated: false,
      marketEvidenceCreated: false,
      normalizedScoreCreated: false,
      rightsClassificationRelaxed: false,
      provenanceRelaxed: false,
      unauthorizedScrapingRequested: false,
      paidProviderProcurementRequested: false,
      contractExecutionRequested: false,
      productionGateRelaxed: false,
    },
    disposition: additions.length + requalified.length > 0 ? 'PRECISION_SAFE_CANDIDATE_SUPPLY_RECOVERED' : 'NO_NEW_PRECISION_SAFE_CANDIDATES_FOUND',
  };
  fs.writeFileSync(POC_PATH, JSON.stringify(hardened, null, 2));
  fs.writeFileSync(AUDIT_PATH, JSON.stringify(audit, null, 2));
  console.log(`Wikidata precision recovery: input=${report.candidates.length} added=${additions.length} requalified=${requalified.length} rejected=${rejected.length} output=${candidates.length}`);
  console.log(`addedByVertical=${JSON.stringify(audit.metrics.addedByVertical)} requalifiedByVertical=${JSON.stringify(audit.metrics.requalifiedByVertical)} runtime=${JSON.stringify(runtime)}`);
}