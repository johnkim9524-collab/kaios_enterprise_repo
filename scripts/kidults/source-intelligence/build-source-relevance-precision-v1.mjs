import fs from "node:fs";
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

const ROLE_LEXICON = Object.freeze({
  PRIMARY_AUTHORITY: [
    "official", "manufacturer", "creator", "museum", "archive", "library", "institute", "foundation",
    "association", "university", "government", "collection database", "collection api"
  ],
  CATALOG_REFERENCE: [
    "catalog", "catalogue", "reference", "database", "registry", "archive", "index", "identifier",
    "model number", "reference number", "product code", "release history"
  ],
  LISTING_SUPPLY: [
    "marketplace", "dealer", "inventory", "listing", "listings", "for sale", "availability", "stock",
    "seller", "supply", "classifieds"
  ],
  SOLD_TRANSACTION: [
    "sold", "sale result", "auction result", "realized price", "transaction", "price guide", "hammer price",
    "buyer premium", "completed auction", "sales database"
  ],
  AUTHENTICATION_CONDITION: [
    "authentication", "authenticate", "grading", "grade", "certification", "certification lookup", "condition",
    "population report", "serial verification", "restoration"
  ],
  PROVENANCE_HISTORY: [
    "provenance", "ownership history", "exhibition history", "archive", "museum", "collection history",
    "sale history", "chassis history", "pedigree"
  ],
  CULTURE_ATTENTION: [
    "community", "forum", "collector club", "media", "trend", "search interest", "attention", "popularity",
    "fan database", "wiki", "discussion"
  ],
  AUCTION_PRIVATE_SALE: [
    "auction", "private sale", "lot archive", "sale catalogue", "sale catalog", "auction house"
  ],
  MACRO_CONTEXT: [
    "regulation", "insurance", "currency", "exchange rate", "inflation", "customs", "tax", "market report"
  ],
  INDEPENDENT_VERIFICATION: [
    "independent", "research", "cross reference", "verification", "open dataset", "public dataset", "doi"
  ]
});

const DATA_CHANNEL_TERMS = Object.freeze([
  "api", "dataset", "data set", "database", "catalog", "catalogue", "registry", "archive", "open data",
  "collection data", "price guide", "auction result", "sold result", "transaction data", "population report",
  "certification lookup", "provenance index", "download", "csv", "json", "linked open data", "knowledge graph"
]);

const AUTHORITY_TERMS = Object.freeze([
  "official", "museum", "archive", "library", "institute", "foundation", "manufacturer", "association",
  "university", "government", "heritage", "society"
]);

const GENERIC_CODE_PATTERNS = Object.freeze([
  "awesome", "framework", "sdk", "boilerplate", "starter", "template", "tutorial", "demo", "sample app",
  "machine learning", "deep learning", "llm", "chatbot", "compiler", "devops", "kubernetes", "cloud platform",
  "web framework", "game engine", "music player", "camera driver", "firmware tool", "computer vision model",
  "neural network", "benchmark", "coursework", "homework", "portfolio project", "dashboard project",
  "sql project", "power bi", "mobile app", "android app", "ios app", "plugin", "package", "library"
]);

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

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_/|]+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value) {
  return unique(normalizeText(value).split(" ").filter(token => token.length >= 3 && !STOPWORDS.has(token)));
}

function phraseList(values) {
  return unique(values
    .map(normalizeText)
    .filter(value => value.length >= 4)
    .sort((left, right) => right.length - left.length || left.localeCompare(right)));
}

function hitPhrases(text, phrases) {
  return phrases.filter(phrase => text.includes(phrase));
}

function scopeLexicon(scope) {
  const namePhrases = phraseList([scope.name]);
  const includePhrases = phraseList(scope.include ?? []);
  const identityPhrases = phraseList((scope.identity_fields ?? []).map(value => value.replaceAll("_", " ")));
  const definitionPhrases = phraseList([scope.definition]);
  const tokenWeights = new Map();
  const add = (values, weight) => {
    for (const value of values) {
      for (const token of tokens(value)) tokenWeights.set(token, Math.max(weight, tokenWeights.get(token) ?? 0));
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
    name_phrases: namePhrases,
    include_phrases: includePhrases,
    identity_phrases: identityPhrases,
    definition_phrases: definitionPhrases,
    weighted_tokens: [...tokenWeights.entries()]
      .map(([token, weight]) => ({ token, weight }))
      .sort((a, b) => b.weight - a.weight || a.token.localeCompare(b.token))
  };
}

function buildLexicon(scopeRegistry, contract) {
  const records = scopeRegistry.records.map(scopeLexicon).sort((a, b) => a.scope_id.localeCompare(b.scope_id));
  return {
    id: "kidults-scope-and-role-lexicon-v1",
    record_type: "scope_and_source_role_lexicon",
    version: "1.0.0",
    status: "STRUCTURAL_LEXICON_READY_TRACK_B_CALIBRATION_PENDING",
    generated_at: contract.effective_at,
    scope_count: records.length,
    source_role_count: Object.keys(ROLE_LEXICON).length,
    scopes: records,
    source_roles: Object.entries(ROLE_LEXICON).map(([source_role, phrases]) => ({ source_role, phrases })),
    data_channel_terms: DATA_CHANNEL_TERMS,
    authority_terms: AUTHORITY_TERMS,
    generic_code_patterns: GENERIC_CODE_PATTERNS,
    query_text_counts_as_relevance_evidence: false,
    production: "HOLD"
  };
}

function buildRawEvidenceMap(snapshot) {
  const map = new Map();
  for (const raw of snapshot.records) {
    const normalized = normalizeUrl(raw.endpoint_url);
    if (!normalized) continue;
    const value = map.get(normalized) ?? {
      endpoint_url: normalized,
      providers: new Set(),
      source_names: new Set(),
      owners: new Set(),
      descriptions: new Set(),
      topics: new Set(),
      publishers: new Set(),
      titles: new Set(),
      subjects: new Set(),
      channel_types: new Set(),
      queries: new Set(),
      scopes: new Set(),
      roles: new Set(),
      assertions: 0
    };
    value.providers.add(raw.discovery_provider);
    if (raw.source_name) value.source_names.add(raw.source_name);
    if (raw.owner) value.owners.add(raw.owner);
    if (raw.metadata?.description) value.descriptions.add(raw.metadata.description);
    for (const topic of raw.metadata?.topics ?? []) value.topics.add(topic);
    if (raw.metadata?.publisher) value.publishers.add(raw.metadata.publisher);
    if (raw.metadata?.title) value.titles.add(raw.metadata.title);
    for (const subject of raw.metadata?.subjects ?? []) value.subjects.add(typeof subject === "string" ? subject : subject?.subject);
    if (raw.channel_type_hint) value.channel_types.add(raw.channel_type_hint);
    if (raw.query) value.queries.add(raw.query);
    if (raw.scope_id) value.scopes.add(raw.scope_id);
    if (raw.source_role) value.roles.add(raw.source_role);
    value.assertions += 1;
    map.set(normalized, value);
  }
  return map;
}

function compactRawEvidence(rawEvidence) {
  if (!rawEvidence) return {
    providers: [], source_names: [], descriptions: [], topics: [], publishers: [], titles: [], subjects: [],
    channel_types: [], queries: [], assertions: 0
  };
  return {
    providers: unique([...rawEvidence.providers]),
    source_names: unique([...rawEvidence.source_names]),
    descriptions: unique([...rawEvidence.descriptions]),
    topics: unique([...rawEvidence.topics]),
    publishers: unique([...rawEvidence.publishers]),
    titles: unique([...rawEvidence.titles]),
    subjects: unique([...rawEvidence.subjects]),
    channel_types: unique([...rawEvidence.channel_types]),
    queries: unique([...rawEvidence.queries]),
    assertions: rawEvidence.assertions
  };
}

function evidenceText(record, raw) {
  return normalizeText([
    record.endpoint_url,
    record.owner,
    ...raw.source_names,
    ...raw.descriptions,
    ...raw.topics,
    ...raw.publishers,
    ...raw.titles,
    ...raw.subjects,
    ...raw.channel_types
  ].join(" "));
}

function scoreScope(text, lexicon) {
  const candidateTokens = new Set(tokens(text));
  const nameHits = hitPhrases(text, lexicon.name_phrases);
  const includeHits = hitPhrases(text, lexicon.include_phrases);
  const identityHits = hitPhrases(text, lexicon.identity_phrases);
  const weightedTokenHits = lexicon.weighted_tokens
    .filter(item => candidateTokens.has(item.token))
    .sort((a, b) => b.weight - a.weight || a.token.localeCompare(b.token));
  const score = Math.min(30,
    Math.min(12, nameHits.length * 8) +
    Math.min(8, includeHits.length * 4) +
    Math.min(6, identityHits.length * 3) +
    Math.min(10, weightedTokenHits.reduce((sum, item) => sum + item.weight, 0))
  );
  return {
    scope_id: lexicon.scope_id,
    scope_name: lexicon.scope_name,
    score,
    phrase_hits: unique([...nameHits, ...includeHits, ...identityHits]).slice(0, 12),
    token_hits: weightedTokenHits.slice(0, 15)
  };
}

function scoreRole(text, sourceRole, channelType) {
  const phrases = ROLE_LEXICON[sourceRole] ?? [];
  const phraseHits = hitPhrases(text, phrases);
  let channelBonus = 0;
  if (sourceRole === "PRIMARY_AUTHORITY" && /OFFICIAL_WEBSITE|WIKIDATA_ENTITY/.test(channelType)) channelBonus = 6;
  if (sourceRole === "INDEPENDENT_VERIFICATION" && /DATACITE/.test(channelType)) channelBonus = 6;
  if (["CATALOG_REFERENCE", "PROVENANCE_HISTORY"].includes(sourceRole) && /DATACITE/.test(channelType)) channelBonus = 3;
  if (sourceRole === "CATALOG_REFERENCE" && /GITHUB_REPOSITORY/.test(channelType) && phraseHits.some(hit => ["catalog", "catalogue", "database", "registry", "archive"].includes(hit))) channelBonus = 3;
  const score = Math.min(20, phraseHits.length * 5 + channelBonus);
  return { source_role: sourceRole, score, phrase_hits: phraseHits.slice(0, 12), channel_bonus: channelBonus };
}

function scoreCandidate(record, raw, lexiconMap) {
  const text = evidenceText(record, raw);
  const scopeScores = record.candidate_collection_scopes
    .map(scopeId => lexiconMap.get(scopeId))
    .filter(Boolean)
    .map(lexicon => scoreScope(text, lexicon))
    .sort((a, b) => b.score - a.score || a.scope_id.localeCompare(b.scope_id));
  const roleScores = record.candidate_source_roles
    .map(role => scoreRole(text, role, record.channel_type))
    .sort((a, b) => b.score - a.score || a.source_role.localeCompare(b.source_role));
  const bestScope = scopeScores[0] ?? { scope_id: null, scope_name: null, score: 0, phrase_hits: [], token_hits: [] };
  const bestRole = roleScores[0] ?? { source_role: null, score: 0, phrase_hits: [], channel_bonus: 0 };
  const dataChannelHits = hitPhrases(text, DATA_CHANNEL_TERMS);
  const authorityHits = hitPhrases(text, AUTHORITY_TERMS);
  const genericHits = hitPhrases(text, GENERIC_CODE_PATTERNS);
  const providerIds = raw.providers;
  const providerDiversity = providerIds.length;
  const channelType = record.channel_type;

  let channelSuitability = 0;
  if (/DATACITE_DATASET_OR_RESEARCH_RECORD/.test(channelType)) channelSuitability += 12;
  else if (/OFFICIAL_WEBSITE_CLAIM_FROM_WIKIDATA/.test(channelType)) channelSuitability += 10;
  else if (/WIKIDATA_ENTITY_RECORD/.test(channelType)) channelSuitability += 6;
  else if (/PROJECT_HOMEPAGE_FROM_GITHUB/.test(channelType)) channelSuitability += 3;
  if (/GITHUB_REPOSITORY/.test(channelType) && dataChannelHits.length) channelSuitability += 8;
  channelSuitability = Math.min(15, channelSuitability);

  const dataChannelScore = Math.min(20, dataChannelHits.length * 5);
  const authorityScore = Math.min(10, authorityHits.length * 3);
  const providerDiversityScore = providerDiversity > 1 ? 8 : 0;
  const rightsScore = record.rights_state.startsWith("EXPLICIT_") ? 3 : 0;
  let genericPenalty = 0;
  if (/GITHUB_REPOSITORY|PROJECT_HOMEPAGE_FROM_GITHUB/.test(channelType) && genericHits.length) {
    genericPenalty = Math.min(40, 12 + genericHits.length * 7);
  }
  const queryOnlyPenalty = bestScope.score === 0 ? 30 : bestScope.score < 5 ? 18 : 0;
  const roleMismatchPenalty = record.candidate_source_roles.length && bestRole.score === 0 ? 15 : 0;
  const rawScore = bestScope.score + bestRole.score + dataChannelScore + authorityScore +
    channelSuitability + providerDiversityScore + rightsScore - genericPenalty - queryOnlyPenalty - roleMismatchPenalty;
  const provisionalScore = Math.max(0, Math.min(100, rawScore));

  let disposition;
  if (bestScope.score >= 10 && bestRole.score >= 5 && (dataChannelScore + channelSuitability >= 8) && genericPenalty < 25) {
    disposition = "PROMOTE_PROVISIONAL_PRECISION_REVIEW";
  } else if (bestScope.score >= 8 && (dataChannelScore + channelSuitability >= 8) && bestRole.score < 5) {
    disposition = "HOLD_PLAUSIBLE_RELEVANCE_WRONG_ROLE_OR_ROLE_UNPROVEN";
  } else if (bestScope.score >= 3 || (genericHits.length && bestScope.score > 0)) {
    disposition = "HOLD_HARD_NEGATIVE_OR_KEYWORD_COLLISION";
  } else {
    disposition = "REJECT_GENERIC_OR_UNRELATED";
  }

  return {
    endpoint_id: record.endpoint_id,
    source_id: record.source_id,
    endpoint_url: record.endpoint_url,
    owner: record.owner,
    channel_type: channelType,
    provider_ids: providerIds,
    candidate_collection_scopes: record.candidate_collection_scopes,
    candidate_source_roles: record.candidate_source_roles,
    decision_scope_ids: record.decision_scope_ids,
    value_scope_ids: record.value_scope_ids,
    intelligence_product_ids: record.intelligence_product_ids,
    best_scope_evidence: bestScope,
    scope_evidence_by_candidate: scopeScores,
    best_source_role_evidence: bestRole,
    source_role_evidence_by_candidate: roleScores,
    data_channel_evidence: dataChannelHits.slice(0, 15),
    authority_evidence: authorityHits.slice(0, 15),
    generic_or_unrelated_evidence: genericHits.slice(0, 15),
    channel_suitability_score: channelSuitability,
    provider_diversity_count: providerDiversity,
    provisional_relevance_score: provisionalScore,
    scoring_components: {
      scope: bestScope.score,
      source_role: bestRole.score,
      data_channel: dataChannelScore,
      authority: authorityScore,
      channel_suitability: channelSuitability,
      cross_provider: providerDiversityScore,
      rights_metadata: rightsScore,
      generic_penalty: genericPenalty,
      query_only_penalty: queryOnlyPenalty,
      role_mismatch_penalty: roleMismatchPenalty
    },
    provisional_disposition: disposition,
    evidence_excerpt: {
      source_names: raw.source_names.slice(0, 4),
      descriptions: raw.descriptions.slice(0, 3),
      topics: raw.topics.slice(0, 12),
      publishers: raw.publishers.slice(0, 4),
      titles: raw.titles.slice(0, 4),
      queries_provenance_only: raw.queries.slice(0, 4)
    },
    scope_relevance_validated: false,
    source_role_relevance_validated: false,
    acquisition_authorized: false,
    production: "HOLD"
  };
}

function diverseSelect(records, count, used, sortAscending = false) {
  const eligible = records
    .filter(record => !used.has(record.endpoint_id))
    .sort((a, b) => {
      const scoreDelta = sortAscending
        ? a.provisional_relevance_score - b.provisional_relevance_score
        : b.provisional_relevance_score - a.provisional_relevance_score;
      return scoreDelta || a.endpoint_id.localeCompare(b.endpoint_id);
    });
  const groups = new Map();
  for (const record of eligible) {
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
      if (!used.has(record.endpoint_id)) {
        selected.push(record);
        used.add(record.endpoint_id);
      }
    }
    if (!values.length) {
      groups.delete(key);
      keys.splice(keys.indexOf(key), 1);
      if (!keys.length) break;
      cursor %= keys.length;
    } else {
      cursor += 1;
    }
  }
  if (selected.length < count) {
    for (const record of eligible) {
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

function calibrationCase(record, bucket, index) {
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
    decision_scope_ids: record.decision_scope_ids,
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

function buildCalibrationSet(ranked, contract) {
  const used = new Set();
  const clearRelevantPool = ranked.filter(record =>
    record.provisional_disposition === "PROMOTE_PROVISIONAL_PRECISION_REVIEW" &&
    record.generic_or_unrelated_evidence.length === 0);
  const wrongRolePool = ranked.filter(record =>
    record.best_scope_evidence.score >= 8 &&
    record.data_channel_evidence.length > 0 &&
    record.best_source_role_evidence.score < 5);
  const hardNegativePool = ranked.filter(record =>
    record.best_scope_evidence.score > 0 &&
    (record.generic_or_unrelated_evidence.length > 0 || record.provisional_disposition.includes("HARD_NEGATIVE")));
  const clearNegativePool = ranked.filter(record =>
    record.best_scope_evidence.score === 0 &&
    (record.generic_or_unrelated_evidence.length > 0 || record.provisional_relevance_score <= 10));

  const buckets = [
    ["CLEAR_RELEVANT_CANDIDATE", diverseSelect(clearRelevantPool.length >= 100 ? clearRelevantPool : ranked.filter(record => record.provisional_relevance_score >= 35), 100, used)],
    ["RELEVANT_WRONG_ROLE_CANDIDATE", diverseSelect(wrongRolePool.length >= 100 ? wrongRolePool : ranked.filter(record => record.best_scope_evidence.score >= 6 && record.best_source_role_evidence.score < 5), 100, used)],
    ["HARD_NEGATIVE_CANDIDATE", diverseSelect(hardNegativePool.length >= 100 ? hardNegativePool : ranked.filter(record => record.best_scope_evidence.score > 0), 100, used, true)],
    ["CLEAR_GENERIC_OR_UNRELATED_NEGATIVE_CANDIDATE", diverseSelect(clearNegativePool.length >= 100 ? clearNegativePool : ranked, 100, used, true)]
  ];
  const records = buckets.flatMap(([bucket, values]) => values.map((record, index) => calibrationCase(record, bucket, index)));
  return {
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
  };
}

function addFingerprint(value) {
  value.fingerprint = fingerprint(value);
  return value;
}

export function buildSourceRelevancePrecision({ inputDirectory = defaultInput } = {}) {
  const contract = readJson(contractPath);
  const scopeRegistry = readJson(scopeRegistryPath);
  const classification = readJson(path.join(inputDirectory, "source-classification-report.json"));
  const snapshot = readJson(path.join(inputDirectory, "raw-discovery-snapshot.json"));
  const lexicon = addFingerprint(buildLexicon(scopeRegistry, contract));
  const lexiconMap = new Map(lexicon.scopes.map(record => [record.scope_id, record]));
  const rawEvidenceMap = buildRawEvidenceMap(snapshot);
  const ranked = classification.records.map(record => {
    const normalized = normalizeUrl(record.endpoint_url);
    const raw = compactRawEvidence(rawEvidenceMap.get(normalized));
    return scoreCandidate(record, raw, lexiconMap);
  }).sort((a, b) => b.provisional_relevance_score - a.provisional_relevance_score || a.endpoint_id.localeCompare(b.endpoint_id));
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

  const calibration = addFingerprint(buildCalibrationSet(ranked, contract));
  const top200 = ranked.slice(0, 200).map(record => ({
    ...record,
    review_state: "PROVISIONAL_PENDING_TRACK_B_PRECISION_CALIBRATION",
    qualified_source: false,
    acquisition_authorized: false,
    production: "HOLD"
  }));
  const top200Queue = addFingerprint({
    id: "kidults-provisional-top-200-source-review-queue-v1",
    record_type: "provisional_precision_source_review_queue",
    version: "1.0.0",
    status: "PRELIMINARY_NOT_QUALIFIED_TRACK_B_CALIBRATION_REQUIRED",
    generated_at: contract.effective_at,
    record_count: top200.length,
    measured_precision: null,
    measured_precision_status: "NOT_AVAILABLE_BEFORE_TRACK_B_400_CASE_REVIEW",
    records: top200,
    acquisition_authorized: false,
    production: "HOLD"
  });

  const rejected = ranked.filter(record => record.provisional_disposition !== "PROMOTE_PROVISIONAL_PRECISION_REVIEW")
    .map(record => ({
      endpoint_id: record.endpoint_id,
      endpoint_url: record.endpoint_url,
      owner: record.owner,
      channel_type: record.channel_type,
      provisional_relevance_score: record.provisional_relevance_score,
      provisional_disposition: record.provisional_disposition,
      best_scope_evidence: record.best_scope_evidence,
      best_source_role_evidence: record.best_source_role_evidence,
      generic_or_unrelated_evidence: record.generic_or_unrelated_evidence,
      hold_or_reject_reason: record.provisional_disposition,
      final_rejection_authorized: false,
      track_b_review_required_for_calibration_cases: calibration.records.some(item => item.endpoint_id === record.endpoint_id),
      acquisition_authorized: false
    }));
  const rejectedRegister = addFingerprint({
    id: "kidults-rejected-and-held-source-candidate-register-v1",
    record_type: "source_candidate_hold_and_reject_register",
    version: "1.0.0",
    status: "AUTOMATED_PRELIMINARY_HOLD_REJECT_NOT_FINAL",
    generated_at: contract.effective_at,
    record_count: rejected.length,
    records: rejected,
    production: "HOLD"
  });

  const dispositionCounts = Object.fromEntries([...new Set(ranked.map(record => record.provisional_disposition))]
    .sort()
    .map(state => [state, ranked.filter(record => record.provisional_disposition === state).length]));
  const provisionalGenericTop200 = top200.filter(record => record.generic_or_unrelated_evidence.length > 0).length;
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
    provisional_generic_pattern_count_top_200: provisionalGenericTop200,
    provisional_generic_pattern_rate_top_200: provisionalGenericTop200 / top200.length,
    provisional_generic_rate_is_empirical_contamination: false,
    scope_evidence_coverage_top_200: top200.filter(record => record.best_scope_evidence.score > 0).length / top200.length,
    source_role_evidence_coverage_top_200: top200.filter(record => record.best_source_role_evidence.score > 0).length / top200.length,
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
    "provisional-top-200-review-queue-v1.json": top200Queue,
    "rejected-and-held-candidate-register-v1.json": rejectedRegister,
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
    provisional_top_200_count: top200.length,
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
