import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import {
  fingerprint,
  normalizeUrl,
  readJson,
  unique,
  writeJsonDirectory
} from "./asi-discovery-common-v1.mjs";

const root = process.cwd();
const contractPath = path.join(root, "coordination", "kidults", "source-intelligence", "source-relevance-precision-contract-v1.json");
const scopeRegistryPath = path.join(root, "coordination", "kidults", "data-scope", "collection-scope-registry-v1.json");
const defaultInput = path.join(root, "artifacts", "input", "asi-batch-001");
const defaultOutput = path.join(root, "artifacts", "agci-os", "source-relevance-precision-v1");

const STOPWORDS = new Set([
  "and", "the", "for", "with", "from", "into", "that", "this", "their", "where", "which", "without",
  "collectible", "collectibles", "collection", "object", "objects", "market", "data", "source", "official",
  "historical", "important", "documented", "generic", "identity", "limited", "edition", "editions"
]);

const ROLE_TERMS = Object.freeze({
  PRIMARY_AUTHORITY: ["official", "manufacturer", "creator", "museum", "archive", "library", "institute", "foundation", "association", "university", "government"],
  CATALOG_REFERENCE: ["catalog", "catalogue", "reference", "database", "registry", "archive", "index", "identifier", "model number", "reference number", "product code"],
  LISTING_SUPPLY: ["marketplace", "dealer", "inventory", "listing", "for sale", "availability", "stock", "seller", "supply", "classifieds"],
  SOLD_TRANSACTION: ["sold", "sale result", "auction result", "realized price", "transaction", "price guide", "hammer price", "buyer premium", "completed auction"],
  AUTHENTICATION_CONDITION: ["authentication", "authenticate", "grading", "grade", "certification", "condition", "population report", "serial verification", "restoration"],
  PROVENANCE_HISTORY: ["provenance", "ownership history", "exhibition history", "archive", "museum", "collection history", "sale history", "pedigree"],
  CULTURE_ATTENTION: ["community", "forum", "collector club", "media", "trend", "search interest", "attention", "popularity", "fan database", "wiki"],
  AUCTION_PRIVATE_SALE: ["auction", "private sale", "lot archive", "sale catalogue", "sale catalog", "auction house"],
  MACRO_CONTEXT: ["regulation", "insurance", "currency", "exchange rate", "inflation", "customs", "tax", "market report"],
  INDEPENDENT_VERIFICATION: ["independent", "research", "cross reference", "verification", "open dataset", "public dataset", "doi"]
});

const DATA_CHANNEL_TERMS = [
  "api", "dataset", "data set", "database", "catalog", "catalogue", "registry", "archive", "open data",
  "price guide", "auction result", "sold result", "transaction data", "population report", "certification lookup",
  "provenance index", "download", "csv", "json", "linked open data", "knowledge graph"
];

const AUTHORITY_TERMS = [
  "official", "museum", "archive", "library", "institute", "foundation", "manufacturer", "association",
  "university", "government", "heritage", "society"
];

const GENERIC_PATTERNS = [
  "awesome", "framework", "sdk", "boilerplate", "starter", "template", "tutorial", "demo", "sample app",
  "machine learning", "deep learning", "llm", "chatbot", "compiler", "devops", "kubernetes", "cloud platform",
  "web framework", "game engine", "music player", "camera driver", "firmware tool", "computer vision model",
  "neural network", "benchmark", "coursework", "homework", "portfolio project", "dashboard project",
  "sql project", "power bi", "mobile app", "android app", "ios app", "plugin", "package", "library"
];

function parseArgs(argv) {
  const config = { input: defaultInput, output: defaultOutput, write: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--input") config.input = path.resolve(argv[++index]);
    else if (argument === "--output") config.output = path.resolve(argv[++index]);
    else if (argument === "--write") config.write = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return config;
}

function text(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_/|]+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function words(value) {
  return unique(text(value).split(" ").filter(token => token.length >= 3 && !STOPWORDS.has(token)));
}

function phrases(values) {
  return unique(values.map(text).filter(value => value.length >= 4));
}

function hits(candidateText, values) {
  return values.filter(value => candidateText.includes(text(value)));
}

function buildScopeLexicon(scope) {
  const weighted = new Map();
  const add = (values, weight) => {
    for (const value of values) {
      for (const token of words(value)) weighted.set(token, Math.max(weight, weighted.get(token) ?? 0));
    }
  };
  add([scope.name], 4);
  add(scope.include ?? [], 3);
  add((scope.identity_fields ?? []).map(value => value.replaceAll("_", " ")), 2);
  add([scope.definition], 1);
  return {
    scope_id: scope.scope_id,
    scope_name: scope.name,
    parent_core_domain: scope.parent_core_domain,
    name_phrases: phrases([scope.name]),
    include_phrases: phrases(scope.include ?? []),
    identity_phrases: phrases((scope.identity_fields ?? []).map(value => value.replaceAll("_", " "))),
    weighted_tokens: [...weighted.entries()].map(([token, weight]) => ({ token, weight }))
      .sort((a, b) => b.weight - a.weight || a.token.localeCompare(b.token))
  };
}

function addFingerprint(value) {
  value.fingerprint = fingerprint(value);
  return value;
}

function buildLexicon(scopeRegistry, contract) {
  const scopes = scopeRegistry.records.map(buildScopeLexicon).sort((a, b) => a.scope_id.localeCompare(b.scope_id));
  return addFingerprint({
    id: "kidults-scope-and-role-lexicon-v1",
    record_type: "scope_and_source_role_lexicon",
    version: "1.0.0",
    status: "STRUCTURAL_LEXICON_READY_TRACK_B_CALIBRATION_PENDING",
    generated_at: contract.effective_at,
    scope_count: scopes.length,
    source_role_count: Object.keys(ROLE_TERMS).length,
    scopes,
    source_roles: Object.entries(ROLE_TERMS).map(([source_role, role_phrases]) => ({ source_role, phrases: role_phrases })),
    data_channel_terms: DATA_CHANNEL_TERMS,
    authority_terms: AUTHORITY_TERMS,
    generic_code_patterns: GENERIC_PATTERNS,
    query_text_counts_as_relevance_evidence: false,
    production: "HOLD"
  });
}

function buildRawMap(snapshot) {
  const map = new Map();
  for (const raw of snapshot.records) {
    const url = normalizeUrl(raw.endpoint_url);
    if (!url) continue;
    const item = map.get(url) ?? {
      providers: new Set(), names: new Set(), owners: new Set(), descriptions: new Set(), topics: new Set(),
      publishers: new Set(), titles: new Set(), subjects: new Set(), channel_types: new Set(), queries: new Set(), assertions: 0
    };
    item.providers.add(raw.discovery_provider);
    if (raw.source_name) item.names.add(raw.source_name);
    if (raw.owner) item.owners.add(raw.owner);
    if (raw.metadata?.description) item.descriptions.add(raw.metadata.description);
    for (const topic of raw.metadata?.topics ?? []) item.topics.add(topic);
    if (raw.metadata?.publisher) item.publishers.add(raw.metadata.publisher);
    if (raw.metadata?.title) item.titles.add(raw.metadata.title);
    for (const subject of raw.metadata?.subjects ?? []) item.subjects.add(typeof subject === "string" ? subject : subject?.subject);
    if (raw.channel_type_hint) item.channel_types.add(raw.channel_type_hint);
    if (raw.query) item.queries.add(raw.query);
    item.assertions += 1;
    map.set(url, item);
  }
  return map;
}

function compactRaw(item) {
  if (!item) return { providers: [], names: [], descriptions: [], topics: [], publishers: [], titles: [], subjects: [], channel_types: [], queries: [], assertions: 0 };
  return {
    providers: unique([...item.providers]), names: unique([...item.names]), descriptions: unique([...item.descriptions]),
    topics: unique([...item.topics]), publishers: unique([...item.publishers]), titles: unique([...item.titles]),
    subjects: unique([...item.subjects]), channel_types: unique([...item.channel_types]), queries: unique([...item.queries]),
    assertions: item.assertions
  };
}

function scopeEvidence(candidateText, lexicon) {
  const tokenSet = new Set(words(candidateText));
  const phraseHits = unique([
    ...hits(candidateText, lexicon.name_phrases),
    ...hits(candidateText, lexicon.include_phrases),
    ...hits(candidateText, lexicon.identity_phrases)
  ]);
  const tokenHits = lexicon.weighted_tokens.filter(item => tokenSet.has(item.token))
    .sort((a, b) => b.weight - a.weight || a.token.localeCompare(b.token));
  const score = Math.min(30, Math.min(16, phraseHits.length * 6) + Math.min(14, tokenHits.reduce((sum, item) => sum + item.weight, 0)));
  return { scope_id: lexicon.scope_id, scope_name: lexicon.scope_name, score, phrase_hits: phraseHits.slice(0, 10), token_hits: tokenHits.slice(0, 12) };
}

function roleEvidence(candidateText, role, channelType) {
  const phraseHits = hits(candidateText, ROLE_TERMS[role] ?? []);
  let bonus = 0;
  if (role === "PRIMARY_AUTHORITY" && /OFFICIAL_WEBSITE|WIKIDATA_ENTITY/.test(channelType)) bonus = 6;
  if (role === "INDEPENDENT_VERIFICATION" && /DATACITE/.test(channelType)) bonus = 6;
  if (["CATALOG_REFERENCE", "PROVENANCE_HISTORY"].includes(role) && /DATACITE/.test(channelType)) bonus = 3;
  const score = Math.min(20, phraseHits.length * 5 + bonus);
  return { source_role: role, score, phrase_hits: phraseHits.slice(0, 10), channel_bonus: bonus };
}

function score(record, raw, lexiconMap) {
  const candidateText = text([
    record.endpoint_url, record.owner, ...raw.names, ...raw.descriptions, ...raw.topics,
    ...raw.publishers, ...raw.titles, ...raw.subjects, ...raw.channel_types
  ].join(" "));
  const scopeScores = record.candidate_collection_scopes.map(id => lexiconMap.get(id)).filter(Boolean)
    .map(item => scopeEvidence(candidateText, item)).sort((a, b) => b.score - a.score || a.scope_id.localeCompare(b.scope_id));
  const roleScores = record.candidate_source_roles.map(role => roleEvidence(candidateText, role, record.channel_type))
    .sort((a, b) => b.score - a.score || a.source_role.localeCompare(b.source_role));
  const bestScope = scopeScores[0] ?? { scope_id: null, scope_name: null, score: 0, phrase_hits: [], token_hits: [] };
  const bestRole = roleScores[0] ?? { source_role: null, score: 0, phrase_hits: [], channel_bonus: 0 };
  const dataHits = hits(candidateText, DATA_CHANNEL_TERMS);
  const authorityHits = hits(candidateText, AUTHORITY_TERMS);
  const genericHits = hits(candidateText, GENERIC_PATTERNS);
  let channelScore = 0;
  if (/DATACITE/.test(record.channel_type)) channelScore = 12;
  else if (/OFFICIAL_WEBSITE_CLAIM_FROM_WIKIDATA/.test(record.channel_type)) channelScore = 10;
  else if (/WIKIDATA_ENTITY_RECORD/.test(record.channel_type)) channelScore = 6;
  else if (/PROJECT_HOMEPAGE_FROM_GITHUB/.test(record.channel_type)) channelScore = 3;
  if (/GITHUB_REPOSITORY/.test(record.channel_type) && dataHits.length) channelScore += 8;
  channelScore = Math.min(15, channelScore);
  const dataScore = Math.min(20, dataHits.length * 5);
  const authorityScore = Math.min(10, authorityHits.length * 3);
  const crossProviderScore = raw.providers.length > 1 ? 8 : 0;
  const rightsScore = record.rights_state.startsWith("EXPLICIT_") ? 3 : 0;
  const genericPenalty = /GITHUB_REPOSITORY|PROJECT_HOMEPAGE_FROM_GITHUB/.test(record.channel_type) && genericHits.length
    ? Math.min(40, 12 + genericHits.length * 7) : 0;
  const queryOnlyPenalty = bestScope.score === 0 ? 30 : bestScope.score < 5 ? 18 : 0;
  const roleMismatchPenalty = record.candidate_source_roles.length && bestRole.score === 0 ? 15 : 0;
  const total = Math.max(0, Math.min(100,
    bestScope.score + bestRole.score + dataScore + authorityScore + channelScore + crossProviderScore + rightsScore -
    genericPenalty - queryOnlyPenalty - roleMismatchPenalty
  ));
  let disposition = "REJECT_GENERIC_OR_UNRELATED";
  if (bestScope.score >= 10 && bestRole.score >= 5 && dataScore + channelScore >= 8 && genericPenalty < 25) disposition = "PROMOTE_PROVISIONAL_PRECISION_REVIEW";
  else if (bestScope.score >= 7 && dataScore + channelScore >= 6 && bestRole.score < 5) disposition = "HOLD_PLAUSIBLE_RELEVANCE_WRONG_ROLE_OR_ROLE_UNPROVEN";
  else if (bestScope.score > 0 || genericHits.length) disposition = "HOLD_HARD_NEGATIVE_OR_KEYWORD_COLLISION";
  return {
    endpoint_id: record.endpoint_id,
    source_id: record.source_id,
    endpoint_url: record.endpoint_url,
    owner: record.owner,
    channel_type: record.channel_type,
    provider_ids: raw.providers,
    candidate_collection_scopes: record.candidate_collection_scopes,
    candidate_source_roles: record.candidate_source_roles,
    decision_scope_count: record.decision_scope_ids.length,
    decision_scope_ids_sample: record.decision_scope_ids.slice(0, 25),
    value_scope_ids: record.value_scope_ids,
    intelligence_product_ids: record.intelligence_product_ids,
    best_scope_evidence: bestScope,
    best_source_role_evidence: bestRole,
    data_channel_evidence: dataHits.slice(0, 12),
    authority_evidence: authorityHits.slice(0, 12),
    generic_or_unrelated_evidence: genericHits.slice(0, 12),
    provisional_relevance_score: total,
    scoring_components: {
      scope: bestScope.score, source_role: bestRole.score, data_channel: dataScore, authority: authorityScore,
      channel_suitability: channelScore, cross_provider: crossProviderScore, rights_metadata: rightsScore,
      generic_penalty: genericPenalty, query_only_penalty: queryOnlyPenalty, role_mismatch_penalty: roleMismatchPenalty
    },
    provisional_disposition: disposition,
    evidence_excerpt: {
      source_names: raw.names.slice(0, 4), descriptions: raw.descriptions.slice(0, 3), topics: raw.topics.slice(0, 12),
      publishers: raw.publishers.slice(0, 4), titles: raw.titles.slice(0, 4), queries_provenance_only: raw.queries.slice(0, 4)
    },
    scope_relevance_validated: false,
    source_role_relevance_validated: false,
    acquisition_authorized: false,
    production: "HOLD"
  };
}

function sorted(records, ascending = false) {
  return [...records].sort((a, b) => {
    const delta = ascending
      ? a.provisional_relevance_score - b.provisional_relevance_score
      : b.provisional_relevance_score - a.provisional_relevance_score;
    return delta || a.endpoint_id.localeCompare(b.endpoint_id);
  });
}

function selectDiverse(primary, fallback, count, used, ascending = false) {
  const combined = [];
  const seen = new Set();
  for (const record of [...sorted(primary, ascending), ...sorted(fallback, ascending)]) {
    if (!seen.has(record.endpoint_id) && !used.has(record.endpoint_id)) {
      combined.push(record);
      seen.add(record.endpoint_id);
    }
  }
  const groups = new Map();
  for (const record of combined) {
    const key = record.best_scope_evidence.scope_id ?? "NO_SCOPE";
    const values = groups.get(key) ?? [];
    values.push(record);
    groups.set(key, values);
  }
  const keys = [...groups.keys()].sort();
  const selected = [];
  let cursor = 0;
  while (selected.length < count && keys.length) {
    const key = keys[cursor % keys.length];
    const values = groups.get(key);
    if (values.length) {
      const record = values.shift();
      selected.push(record);
      used.add(record.endpoint_id);
    }
    if (!values.length) {
      groups.delete(key);
      keys.splice(keys.indexOf(key), 1);
      if (!keys.length) break;
      cursor %= keys.length;
    } else cursor += 1;
  }
  if (selected.length < count) {
    for (const record of combined) {
      if (selected.length >= count) break;
      if (!used.has(record.endpoint_id)) {
        selected.push(record);
        used.add(record.endpoint_id);
      }
    }
  }
  if (selected.length !== count) throw new Error(`Unable to select ${count} records; selected ${selected.length}.`);
  return selected;
}

function calibrationRecord(record, bucket, index) {
  return {
    case_id: `relevance-${bucket.toLowerCase().replaceAll("_", "-")}-${String(index + 1).padStart(3, "0")}`,
    endpoint_id: record.endpoint_id,
    source_id: record.source_id,
    endpoint_url: record.endpoint_url,
    owner: record.owner,
    channel_type: record.channel_type,
    discovery_providers: record.provider_ids,
    provisional_bucket: bucket,
    provisional_relevance_score: record.provisional_relevance_score,
    candidate_collection_scopes: record.candidate_collection_scopes,
    candidate_source_roles: record.candidate_source_roles,
    best_scope_evidence: record.best_scope_evidence,
    best_source_role_evidence: record.best_source_role_evidence,
    data_channel_evidence: record.data_channel_evidence,
    authority_evidence: record.authority_evidence,
    generic_or_unrelated_evidence: record.generic_or_unrelated_evidence,
    scoring_components: record.scoring_components,
    evidence_excerpt: record.evidence_excerpt,
    decision_scope_count: record.decision_scope_count,
    decision_scope_ids_sample: record.decision_scope_ids_sample,
    value_scope_ids: record.value_scope_ids,
    intelligence_product_ids: record.intelligence_product_ids,
    label_state: "PROVISIONAL_PENDING_TRACK_B",
    track_b_relevance_label: null,
    track_b_source_role_label: null,
    track_b_rationale: null,
    track_b_reviewed_at: null,
    acquisition_authorized: false,
    production: "HOLD"
  };
}

function buildCalibration(ranked, contract) {
  const used = new Set();
  const relevant = ranked.filter(record => record.provisional_disposition === "PROMOTE_PROVISIONAL_PRECISION_REVIEW" && record.generic_or_unrelated_evidence.length === 0);
  const wrongRole = ranked.filter(record => record.best_scope_evidence.score >= 5 && record.best_source_role_evidence.score < 5 && (record.data_channel_evidence.length || record.channel_type.includes("DATACITE")));
  const hardNegative = ranked.filter(record => record.best_scope_evidence.score > 0 && (record.generic_or_unrelated_evidence.length || record.provisional_disposition.includes("HARD_NEGATIVE")));
  const clearNegative = ranked.filter(record => record.best_scope_evidence.score === 0 && (record.generic_or_unrelated_evidence.length || record.provisional_relevance_score <= 10));
  const buckets = [
    ["CLEAR_RELEVANT_CANDIDATE", selectDiverse(relevant, ranked, 100, used)],
    ["RELEVANT_WRONG_ROLE_CANDIDATE", selectDiverse(wrongRole, ranked.filter(record => record.best_source_role_evidence.score < 5), 100, used)],
    ["HARD_NEGATIVE_CANDIDATE", selectDiverse(hardNegative, ranked.filter(record => record.best_scope_evidence.score > 0), 100, used, true)],
    ["CLEAR_GENERIC_OR_UNRELATED_NEGATIVE_CANDIDATE", selectDiverse(clearNegative, ranked, 100, used, true)]
  ];
  const records = buckets.flatMap(([bucket, values]) => values.map((record, index) => calibrationRecord(record, bucket, index)));
  return addFingerprint({
    id: "kidults-source-relevance-calibration-candidates-v1",
    record_type: "source_relevance_calibration_candidate_set",
    version: "1.0.0",
    status: "400_CASE_PROVISIONAL_QUEUE_TRACK_B_REVIEW_REQUIRED",
    generated_at: contract.effective_at,
    source_contract_id: contract.id,
    total_cases: records.length,
    bucket_counts: Object.fromEntries(buckets.map(([bucket, values]) => [bucket, values.length])),
    approved_gold_labels: 0,
    unresolved_cases: records.length,
    records,
    acquisition_authorized: false,
    production: "HOLD"
  });
}

export function buildSourceRelevancePrecision({ inputDirectory = defaultInput } = {}) {
  const contract = readJson(contractPath);
  const scopeRegistry = readJson(scopeRegistryPath);
  const classification = readJson(path.join(inputDirectory, "source-classification-report.json"));
  const snapshot = readJson(path.join(inputDirectory, "raw-discovery-snapshot.json"));
  const lexicon = buildLexicon(scopeRegistry, contract);
  const lexiconMap = new Map(lexicon.scopes.map(record => [record.scope_id, record]));
  const rawMap = buildRawMap(snapshot);
  const ranked = classification.records.map(record => score(record, compactRaw(rawMap.get(normalizeUrl(record.endpoint_url))), lexiconMap));
  ranked.sort((a, b) => b.provisional_relevance_score - a.provisional_relevance_score || a.endpoint_id.localeCompare(b.endpoint_id));
  ranked.forEach((record, index) => { record.provisional_rank = index + 1; });

  const rankedUniverse = addFingerprint({
    id: "kidults-provisional-precision-ranked-universe-v1",
    record_type: "provisional_source_relevance_ranked_universe",
    version: "1.0.0",
    status: "AUTOMATED_HEURISTIC_RANKING_TRACK_B_CALIBRATION_PENDING",
    generated_at: contract.effective_at,
    source_contract_id: contract.id,
    input_endpoint_count: classification.record_count,
    record_count: ranked.length,
    empirical_precision_measured: false,
    query_text_used_as_relevance_evidence: false,
    records: ranked,
    acquisition_authorized: false,
    production: "HOLD"
  });

  const calibration = buildCalibration(ranked, contract);
  const top200Records = ranked.slice(0, 200).map(record => ({
    ...record,
    review_state: "PROVISIONAL_PENDING_TRACK_B_PRECISION_CALIBRATION",
    qualified_source: false,
    acquisition_authorized: false,
    production: "HOLD"
  }));
  const top200 = addFingerprint({
    id: "kidults-provisional-top-200-source-review-queue-v1",
    record_type: "provisional_precision_source_review_queue",
    version: "1.0.0",
    status: "PRELIMINARY_NOT_QUALIFIED_TRACK_B_CALIBRATION_REQUIRED",
    generated_at: contract.effective_at,
    record_count: top200Records.length,
    measured_precision: null,
    measured_precision_status: "NOT_AVAILABLE_BEFORE_TRACK_B_400_CASE_REVIEW",
    records: top200Records,
    acquisition_authorized: false,
    production: "HOLD"
  });

  const heldRecords = ranked.filter(record => record.provisional_disposition !== "PROMOTE_PROVISIONAL_PRECISION_REVIEW").map(record => ({
    endpoint_id: record.endpoint_id,
    endpoint_url: record.endpoint_url,
    owner: record.owner,
    channel_type: record.channel_type,
    provisional_relevance_score: record.provisional_relevance_score,
    provisional_disposition: record.provisional_disposition,
    best_scope_evidence: record.best_scope_evidence,
    best_source_role_evidence: record.best_source_role_evidence,
    generic_or_unrelated_evidence: record.generic_or_unrelated_evidence,
    final_rejection_authorized: false,
    acquisition_authorized: false
  }));
  const held = addFingerprint({
    id: "kidults-rejected-and-held-source-candidate-register-v1",
    record_type: "source_candidate_hold_and_reject_register",
    version: "1.0.0",
    status: "AUTOMATED_PRELIMINARY_HOLD_REJECT_NOT_FINAL",
    generated_at: contract.effective_at,
    record_count: heldRecords.length,
    records: heldRecords,
    production: "HOLD"
  });

  const dispositionCounts = Object.fromEntries(unique(ranked.map(record => record.provisional_disposition)).map(state => [state, ranked.filter(record => record.provisional_disposition === state).length]));
  const genericTop200 = top200Records.filter(record => record.generic_or_unrelated_evidence.length > 0).length;
  const report = addFingerprint({
    id: "kidults-source-relevance-precision-report-v1",
    record_type: "source_relevance_precision_report",
    version: "1.0.0",
    status: "PRECISION_FOUNDATION_PASS_TRACK_B_LABELS_PENDING",
    generated_at: contract.effective_at,
    source_contract_id: contract.id,
    input_endpoint_count: ranked.length,
    provisional_disposition_counts: dispositionCounts,
    calibration_cases: calibration.total_cases,
    approved_gold_labels: 0,
    track_b_reviewed_cases: 0,
    top_200_precision: null,
    top_200_precision_status: "NOT_MEASURED",
    top_50_precision: null,
    top_50_precision_status: "NOT_MEASURED",
    provisional_generic_pattern_count_top_200: genericTop200,
    provisional_generic_pattern_rate_top_200: genericTop200 / top200Records.length,
    provisional_generic_rate_is_empirical_contamination: false,
    scope_evidence_coverage_top_200: top200Records.filter(record => record.best_scope_evidence.score > 0).length / top200Records.length,
    source_role_evidence_coverage_top_200: top200Records.filter(record => record.best_source_role_evidence.score > 0).length / top200Records.length,
    deterministic_ranking_required: true,
    next_gate: "TRACK_B_REVIEW_400_CASES_THEN_CALIBRATE_THRESHOLDS_AND_MEASURE_PRECISION",
    acquisition_authorized: false,
    candidate_r2: "BLOCKED",
    kidult_500: "NOT_COMPUTED",
    kidult_100: "NOT_COMPUTED",
    production: "HOLD"
  });

  const outputs = {
    "scope-and-role-lexicon-v1.json": lexicon,
    "source-relevance-calibration-candidates-v1.json": calibration,
    "provisional-precision-ranked-universe-v1.json": rankedUniverse,
    "provisional-top-200-review-queue-v1.json": top200,
    "rejected-and-held-candidate-register-v1.json": held,
    "source-relevance-precision-report-v1.json": report
  };
  const manifest = {
    id: "kidults-source-relevance-precision-v1-run-manifest",
    record_type: "source_relevance_precision_run",
    version: "1.0.0",
    status: "PRECISION_FOUNDATION_PASS_TRACK_B_LABELS_PENDING",
    generated_at: contract.effective_at,
    inputs: {
      contract: { id: contract.id, fingerprint: fingerprint(contract) },
      scope_registry: { id: scopeRegistry.id, fingerprint: fingerprint(scopeRegistry) },
      raw_snapshot: { id: snapshot.id, fingerprint: snapshot.snapshot_fingerprint },
      classification: { id: classification.id, fingerprint: classification.fingerprint }
    },
    outputs: Object.fromEntries(Object.entries(outputs).map(([name, value]) => [name, value.fingerprint])),
    input_endpoint_count: ranked.length,
    calibration_case_count: calibration.total_cases,
    provisional_top_200_count: top200.record_count,
    approved_gold_labels: 0,
    track_b_review_complete: false,
    empirical_precision_measured: false,
    source_pool_promotions: 0,
    acquisition_authorized: false,
    market_claims_created: 0,
    candidate_r2_created: false,
    indexes_computed: 0,
    production: "HOLD"
  };
  manifest.run_fingerprint = fingerprint(manifest);
  outputs["run-manifest.json"] = manifest;
  return outputs;
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  const outputs = buildSourceRelevancePrecision({ inputDirectory: config.input });
  if (config.write) writeJsonDirectory(config.output, outputs);
  const report = outputs["source-relevance-precision-report-v1.json"];
  console.log("KIDULTS Source Relevance Precision Recovery v1: FOUNDATION PASS");
  console.log(`Input endpoints: ${report.input_endpoint_count}`);
  console.log(`Calibration candidates: ${outputs["source-relevance-calibration-candidates-v1.json"].total_cases}`);
  console.log(`Provisional Top 200: ${outputs["provisional-top-200-review-queue-v1.json"].record_count}`);
  console.log("Approved Gold labels: 0 — Track B review required");
  console.log("Empirical precision: NOT_MEASURED");
  console.log("Acquisition: BLOCKED");
  console.log("KIDULT 500 / KIDULT 100: NOT_COMPUTED");
  console.log("Production: HOLD");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
