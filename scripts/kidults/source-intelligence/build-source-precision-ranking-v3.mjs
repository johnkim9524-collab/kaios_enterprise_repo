import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { fingerprint, hashId, normalizeUrl, readJson, unique, writeJsonDirectory } from "./asi-discovery-common-v1.mjs";

const root = process.cwd();
const scopeRegistryPath = path.join(root, "coordination", "kidults", "data-scope", "collection-scope-registry-v1.json");
const GENERATED_AT = "2026-08-17T17:10:00+09:00";

function parseArgs(argv) {
  const config = { precisionV1: null, v2: null, calibration: null, targeted: null, output: null, write: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--precision-v1") config.precisionV1 = path.resolve(argv[++index]);
    else if (arg === "--v2") config.v2 = path.resolve(argv[++index]);
    else if (arg === "--calibration") config.calibration = path.resolve(argv[++index]);
    else if (arg === "--targeted") config.targeted = path.resolve(argv[++index]);
    else if (arg === "--output") config.output = path.resolve(argv[++index]);
    else if (arg === "--write") config.write = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  for (const key of ["precisionV1", "v2", "calibration", "targeted", "output"]) if (!config[key]) throw new Error(`--${key} input is required`);
  return config;
}

function normalizeText(value) {
  return String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[_|]+/g, " ").replace(/[^a-z0-9:/+.@-]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizedOwner(value) { return normalizeText(value).replace(/[^a-z0-9]+/g, " ").trim(); }
function termHits(text, terms = []) { return unique(terms.map(normalizeText).filter(term => term.length >= 3 && text.includes(term))); }

function evidenceText(record) {
  const e = record.evidence_excerpt ?? {};
  return normalizeText([record.endpoint_url, record.owner, record.channel_type, ...(e.source_names ?? []), ...(e.descriptions ?? []), ...(e.topics ?? []), ...(e.publishers ?? []), ...(e.titles ?? [])].join(" "));
}

function sourceName(record) { return normalizeText((record.evidence_excerpt?.source_names ?? [])[0]); }

function familyKey(record) {
  if (record.source_family_key) return record.source_family_key;
  if (record.record_origin === "TARGETED_HIGH_AUTHORITY") return `target:${record.source_id}`;
  if (["TRUSTED_SOURCE_REGISTRY", "BOUNDED_ADAPTER_CONTRACT"].includes(record.record_origin) && record.underlying_work_key) return record.underlying_work_key;
  const channel = record.channel_type;
  const owner = normalizedOwner(record.owner);
  const name = sourceName(record);
  if (channel === "DATACITE_DATASET_OR_RESEARCH_RECORD" && name) {
    const title = name.replace(/\b(dataset|data set|version|reproducibility archive|supplement|v[0-9]+)\b/g, " ").replace(/\s+/g, " ").trim();
    return `datacite:${owner}:${title}`;
  }
  if (/GITHUB_REPOSITORY|PROJECT_HOMEPAGE_FROM_GITHUB/.test(channel)) {
    try {
      const u = new URL(record.endpoint_url);
      const parts = u.pathname.toLowerCase().split("/").filter(Boolean);
      if (parts.length >= 2) return `github:${parts[0]}:${parts[1]}`;
    } catch {}
    return `github:${owner}:${name || record.endpoint_id}`;
  }
  if (channel === "OFFICIAL_WEBSITE_CLAIM_FROM_WIKIDATA") {
    try { return `official:${new URL(record.endpoint_url).hostname.toLowerCase().replace(/^www\./, "")}`; } catch {}
  }
  return `${channel}:${owner}:${name || record.endpoint_id}`;
}

function scopeStrength(record, lexicon) {
  const text = evidenceText(record);
  let best = { score: 0, scope_id: null, phrase_hits: [], token_hits: [] };
  for (const scopeId of record.candidate_collection_scopes ?? []) {
    const scope = lexicon.scopes.find(value => value.scope_id === scopeId);
    if (!scope) continue;
    const phraseHits = [...(scope.name_phrases ?? []), ...(scope.include_phrases ?? [])].filter(value => text.includes(normalizeText(value)));
    const tokenHits = [];
    let score = phraseHits.length * 8;
    for (const weighted of scope.weighted_tokens ?? []) {
      const token = normalizeText(weighted.token);
      if (token.length >= 3 && new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text)) {
        tokenHits.push(token);
        score += weighted.weight;
      }
    }
    if (score > best.score) best = { score, scope_id: scopeId, phrase_hits: unique(phraseHits), token_hits: unique(tokenHits) };
  }
  return best;
}

function collisionReason(record, text) {
  const scopes = new Set(record.candidate_collection_scopes ?? []);
  if (/\b(exclusive license|franchise license|royalty|trademark license|asset purchase|licensing agreement|trade name)\b/.test(text)) return "LICENSE_OR_BUSINESS_RECORD";
  if (scopes.has("scope-seating") && /\b(seating preference|child car seat|adaptive seating|cerebral palsy|theatre seating|audience seating|seat preference|ergonomic posture)\b/.test(text) && !/\b(chair|chairs|furniture|sofa|stool|collectible)\b/.test(text)) return "HUMAN_SEATING_OR_NON_COLLECTIBLE_COLLISION";
  if (scopes.has("scope-construction-systems") && /\b(construction industry|construction project|construction waste|rfid|erp|building information modeling|bim|cost database|workflow)\b/.test(text) && !/\b(lego|meccano|construction toy|building set|model kit|collectible)\b/.test(text)) return "CONSTRUCTION_INDUSTRY_OR_SYSTEM_TERM_COLLISION";
  if (scopes.has("scope-trading-cards") && /\b(steam trading|crypto trading|bitcoin|trading bot|financial trading)\b/.test(text) && !/\b(trading card|pokemon|pokémon|sports card|tcg|psa|beckett|card set)\b/.test(text)) return "DIGITAL_OR_TRADING_TERM_COLLISION";
  if (scopes.has("scope-tables-storage") && /\b(sql|database table|data table|table schema|hash table|storage engine|database storage)\b/.test(text) && !/\b(furniture|cabinet|desk|sideboard)\b/.test(text)) return "TABLE_DATABASE_COLLISION";
  return null;
}

function correctedResearchRoles(record, text) {
  const roles = new Set(["INDEPENDENT_VERIFICATION"]);
  if (/provenance|ownership|archive|historical|history/.test(text)) roles.add("PROVENANCE_HISTORY");
  if (/authentication|grading|gemolog|hallmark|condition|centering/.test(text)) roles.add("AUTHENTICATION_CONDITION");
  if (/market|price|sales|investment|financial|scarcity|liquidity/.test(text)) roles.add("MACRO_CONTEXT");
  if (/culture|fashion|design|media|community|memorabilia|narrative/.test(text)) roles.add("CULTURE_ATTENTION");
  return [...roles].sort();
}

function rawRecovery(record, lexicon) {
  const text = evidenceText(record);
  const collision = collisionReason(record, text);
  if (collision) return { eligible: false, reason: collision, score: -1000, scope: scopeStrength(record, lexicon), roles: [] };
  const scope = scopeStrength(record, lexicon);
  const dataHits = termHits(text, lexicon.data_channel_terms ?? []);
  const authorityHits = termHits(text, lexicon.authority_terms ?? []);
  const genericHits = termHits(text, lexicon.generic_code_patterns ?? []);
  const channel = record.channel_type;
  let eligible = false;
  let reason = "INSUFFICIENT_COLLECTIBLE_EVIDENCE";
  let roles = record.candidate_source_roles ?? [];
  if (channel === "DATACITE_DATASET_OR_RESEARCH_RECORD") {
    eligible = scope.score >= 5 && genericHits.length <= 1;
    reason = eligible ? "CALIBRATION_RECOVERED_DIRECT_SCOPE_RESEARCH" : "DATACITE_SCOPE_EVIDENCE_INSUFFICIENT";
    roles = correctedResearchRoles(record, text);
  } else if (channel === "OFFICIAL_WEBSITE_CLAIM_FROM_WIKIDATA") {
    eligible = scope.score >= 3;
    reason = eligible ? "OFFICIAL_WEBSITE_SCOPE_MATCH" : "OFFICIAL_WEBSITE_SCOPE_EVIDENCE_INSUFFICIENT";
    roles = unique(["PRIMARY_AUTHORITY", ...(record.candidate_source_roles ?? [])]);
  } else if (/GITHUB_REPOSITORY|PROJECT_HOMEPAGE_FROM_GITHUB/.test(channel)) {
    const explicitData = /\b(dataset|database|catalog|catalogue|archive|registry|price|sales|auction|json|csv|open data|set list|sensor|specification|provenance)\b/.test(text);
    eligible = scope.score >= 8 && dataHits.length >= 1 && genericHits.length === 0 && explicitData;
    reason = eligible ? "CALIBRATION_RECOVERED_STRUCTURED_DATA_CHANNEL" : "GENERIC_OR_WEAK_GITHUB_CHANNEL";
  }
  const score = scope.score * 3 + dataHits.length * 5 + authorityHits.length * 4 - genericHits.length * 10 + (channel === "DATACITE_DATASET_OR_RESEARCH_RECORD" ? 20 : channel === "OFFICIAL_WEBSITE_CLAIM_FROM_WIKIDATA" ? 40 : 5);
  return { eligible, reason, score, scope, roles: unique(roles), dataHits, authorityHits, genericHits };
}

function commonCandidate(record, extras = {}) {
  return {
    candidate_id: extras.candidate_id ?? record.endpoint_id,
    source_id: record.source_id,
    endpoint_id: record.endpoint_id,
    endpoint_url: record.endpoint_url,
    owner: record.owner,
    channel_type: record.channel_type,
    candidate_collection_scopes: unique(record.candidate_collection_scopes ?? []),
    corrected_source_roles: unique(extras.corrected_source_roles ?? record.corrected_source_roles ?? record.candidate_source_roles ?? []),
    record_origin: extras.record_origin ?? record.record_origin ?? "PRECISION_V1_ENDPOINT",
    evidence_excerpt: record.evidence_excerpt ?? {},
    explicit_scope_evidence: unique(extras.explicit_scope_evidence ?? record.explicit_scope_evidence ?? []),
    rights_state: record.rights_state ?? "UNKNOWN_NOT_INFERRED",
    commercial_use_state: record.commercial_use_state ?? "UNKNOWN_NOT_INFERRED",
    verification_state: record.verification_state ?? "NOT_VERIFIED",
    track_b_seed_state: extras.track_b_seed_state ?? "UNREVIEWED_V3_CANDIDATE",
    v3_reason: extras.v3_reason,
    v3_score: extras.v3_score,
    source_family_key: extras.source_family_key ?? familyKey(record),
    owner_lineage_state: "OWNER_IDENTIFIED_FAMILY_KEY_DERIVED_NOT_QUALIFIED",
    qualification_state: "NOT_QUALIFIED",
    source_pool_promoted: false,
    acquisition_authorized: false,
    production: "HOLD"
  };
}

export function buildSourcePrecisionRankingV3({ precisionV1, v2, calibration, targeted }) {
  const universe = readJson(path.join(precisionV1, "provisional-precision-ranked-universe-v1.json"));
  const lexicon = readJson(path.join(precisionV1, "scope-and-role-lexicon-v1.json"));
  const rankedV2 = readJson(path.join(v2, "precision-ranked-universe-v2.json"));
  const calibration400 = readJson(path.join(calibration, "track-b-calibration-assessment-400-v2.json"));
  const targetedRegistry = readJson(path.join(targeted, "targeted-high-authority-source-expansion-v1", "targeted-high-authority-source-candidate-registry-v1.json"));
  const targetedAssessment = readJson(path.join(targeted, "track-b-targeted-high-authority-top50-pilot-v1-robust-fixed", "targeted-high-authority-top50-assessment-v1.json"));
  const scopeRegistry = readJson(scopeRegistryPath);

  if (universe.records.length !== 5391) throw new Error(`Expected 5,391 precision-v1 records; received ${universe.records.length}.`);
  if (calibration400.reviewed_records !== 400 || calibration400.unresolved_records !== 0) throw new Error("400-case calibration input is incomplete.");
  if (targetedAssessment.reviewed !== 50 || targetedAssessment.relevant !== 50 || targetedAssessment.unresolved !== 0) throw new Error("Targeted Top-50 positive foundation is incomplete.");

  const universeByEndpoint = new Map(universe.records.map(record => [record.endpoint_id, record]));
  const calibrationByEndpoint = new Map(calibration400.records.map(record => [record.endpoint_id, record]));
  const calibrationNegativeIds = new Set(calibration400.records.filter(record => record.scope_relevance_label === "NOT_RELEVANT").map(record => record.endpoint_id));
  const calibrationPositive = calibration400.records.filter(record => record.scope_relevance_label === "RELEVANT" && record.generic_code_or_keyword_collision_label !== "DUPLICATE_UNDERLYING_WORK");
  const targetedPositiveIds = new Set(targetedAssessment.records.filter(record => record.scope_relevance_label === "RELEVANT").map(record => record.source_id));

  const attempted = [];
  const collapsed = [];
  const retained = [];
  const familyKeys = new Set();
  const endpointUrls = new Set();

  function addCandidate(candidate) {
    attempted.push(candidate);
    const normalized = normalizeUrl(candidate.endpoint_url) ?? candidate.endpoint_url;
    if (familyKeys.has(candidate.source_family_key) || endpointUrls.has(normalized)) {
      collapsed.push({ candidate_id: candidate.candidate_id, endpoint_id: candidate.endpoint_id, source_family_key: candidate.source_family_key, endpoint_url: normalized, reason: "FAMILY_OR_ENDPOINT_DUPLICATE" });
      return false;
    }
    familyKeys.add(candidate.source_family_key);
    endpointUrls.add(normalized);
    retained.push(candidate);
    return true;
  }

  for (const source of targetedRegistry.records.filter(record => targetedPositiveIds.has(record.source_id)).sort((a, b) => a.source_id.localeCompare(b.source_id))) {
    const endpoint = normalizeUrl(source.official_endpoint) ?? source.official_endpoint;
    addCandidate(commonCandidate({
      source_id: source.source_id, endpoint_id: hashId("ep", endpoint), endpoint_url: endpoint, owner: source.display_name,
      channel_type: source.channel_type, candidate_collection_scopes: source.collection_scope_ids, candidate_source_roles: source.source_roles,
      evidence_excerpt: { source_names: [source.display_name], descriptions: [source.authority_basis], topics: source.source_roles, publishers: [source.display_name], titles: [] },
      rights_state: source.rights_state, commercial_use_state: source.commercial_use_state, verification_state: source.verification_state,
      record_origin: "TARGETED_HIGH_AUTHORITY"
    }, {
      candidate_id: `targeted:${source.source_id}`, record_origin: "TARGETED_HIGH_AUTHORITY", corrected_source_roles: source.source_roles,
      explicit_scope_evidence: source.collection_scope_ids.map(scopeId => `TARGETED_CONTRACT_SCOPE:${scopeId}`), track_b_seed_state: "TRACK_B_TARGETED_TOP50_RELEVANT",
      v3_reason: "TARGETED_HIGH_AUTHORITY_TRACK_B_RELEVANT", v3_score: 2000, source_family_key: `target:${source.source_id}`
    }));
  }

  for (const assessment of calibrationPositive.sort((a, b) => a.review_case_id.localeCompare(b.review_case_id))) {
    const source = universeByEndpoint.get(assessment.endpoint_id);
    if (!source) throw new Error(`Calibration positive endpoint missing from precision-v1 universe: ${assessment.endpoint_id}`);
    addCandidate(commonCandidate(source, {
      record_origin: "TRACK_B_CALIBRATION_POSITIVE", corrected_source_roles: assessment.corrected_source_roles.length ? assessment.corrected_source_roles : source.candidate_source_roles,
      explicit_scope_evidence: [`TRACK_B_CALIBRATION_RELEVANT:${assessment.review_case_id}`], track_b_seed_state: "TRACK_B_CALIBRATION_RELEVANT",
      v3_reason: assessment.decision_value_contribution_label === "DIRECT_REFERENCE" ? "CALIBRATION_DIRECT_REFERENCE" : "CALIBRATION_CONTEXTUAL_RELEVANCE",
      v3_score: assessment.decision_value_contribution_label === "DIRECT_REFERENCE" ? 1800 : 1600, source_family_key: familyKey(source)
    }));
  }

  for (const source of targetedRegistry.records.filter(record => !targetedPositiveIds.has(record.source_id)).sort((a, b) => a.source_id.localeCompare(b.source_id))) {
    const endpoint = normalizeUrl(source.official_endpoint) ?? source.official_endpoint;
    addCandidate(commonCandidate({
      source_id: source.source_id, endpoint_id: hashId("ep", endpoint), endpoint_url: endpoint, owner: source.display_name,
      channel_type: source.channel_type, candidate_collection_scopes: source.collection_scope_ids, candidate_source_roles: source.source_roles,
      evidence_excerpt: { source_names: [source.display_name], descriptions: [source.authority_basis], topics: source.source_roles, publishers: [source.display_name], titles: [] },
      rights_state: source.rights_state, commercial_use_state: source.commercial_use_state, verification_state: source.verification_state,
      record_origin: "TARGETED_HIGH_AUTHORITY"
    }, {
      candidate_id: `targeted:${source.source_id}`, record_origin: "TARGETED_HIGH_AUTHORITY", corrected_source_roles: source.source_roles,
      explicit_scope_evidence: source.collection_scope_ids.map(scopeId => `TARGETED_CONTRACT_SCOPE:${scopeId}`), track_b_seed_state: "TARGETED_AUTHORITY_UNREVIEWED",
      v3_reason: "TARGETED_HIGH_AUTHORITY_REQUIRES_DIRECT_REVIEW", v3_score: 1500, source_family_key: `target:${source.source_id}`
    }));
  }

  for (const anchor of rankedV2.records.filter(record => ["TRUSTED_SOURCE_REGISTRY", "BOUNDED_ADAPTER_CONTRACT"].includes(record.record_origin)).sort((a, b) => a.source_id.localeCompare(b.source_id))) {
    if (calibrationNegativeIds.has(anchor.endpoint_id)) continue;
    addCandidate(commonCandidate(anchor, {
      record_origin: anchor.record_origin, explicit_scope_evidence: anchor.explicit_scope_evidence?.length ? anchor.explicit_scope_evidence : anchor.candidate_collection_scopes.map(scopeId => `ANCHOR_SCOPE:${scopeId}`),
      track_b_seed_state: "OFFICIAL_ANCHOR_UNREVIEWED", v3_reason: "REGISTERED_OR_BOUNDED_OFFICIAL_ANCHOR", v3_score: 1400,
      source_family_key: anchor.underlying_work_key ?? `anchor:${anchor.source_id}`
    }));
  }

  const rawRecoveryCandidates = [];
  for (const record of universe.records) {
    if (calibrationByEndpoint.has(record.endpoint_id)) continue;
    const recovery = rawRecovery(record, lexicon);
    if (!recovery.eligible) continue;
    rawRecoveryCandidates.push(commonCandidate(record, {
      corrected_source_roles: recovery.roles, explicit_scope_evidence: [...recovery.scope.phrase_hits, ...recovery.scope.token_hits].map(value => `LEXICAL_SCOPE:${value}`),
      track_b_seed_state: "UNREVIEWED_CALIBRATION_RECOVERY", v3_reason: recovery.reason, v3_score: 1000 + recovery.score,
      source_family_key: familyKey(record)
    }));
  }
  rawRecoveryCandidates.sort((a, b) => b.v3_score - a.v3_score || a.endpoint_id.localeCompare(b.endpoint_id));
  for (const candidate of rawRecoveryCandidates) addCandidate(candidate);

  retained.sort((a, b) => b.v3_score - a.v3_score || a.source_family_key.localeCompare(b.source_family_key));
  retained.forEach((record, index) => { record.v3_rank = index + 1; });

  const buffer = retained.slice(0, 240);
  const top200 = retained.slice(0, Math.min(200, retained.length));
  const directReady = retained.length >= 200;
  const requiredRoles = scopeRegistry.common_contract.required_source_roles;
  const scopeDepth = scopeRegistry.records.map(scope => {
    const records = retained.filter(record => record.candidate_collection_scopes.includes(scope.scope_id));
    const roles = unique(records.flatMap(record => record.corrected_source_roles));
    return {
      scope_id: scope.scope_id, scope_name: scope.name, candidate_family_count: records.length, target_primary_family_count: 8,
      family_gap_to_8: Math.max(0, 8 - records.length), required_roles: requiredRoles,
      represented_required_roles: requiredRoles.filter(role => roles.includes(role)), missing_required_roles: requiredRoles.filter(role => !roles.includes(role))
    };
  });

  const collisionCounts = {};
  for (const record of calibration400.records) {
    const key = record.generic_code_or_keyword_collision_label;
    collisionCounts[key] = (collisionCounts[key] ?? 0) + 1;
  }

  const outputs = {};
  outputs["source-precision-ranking-v3.json"] = {
    id: "kidults-source-precision-ranking-v3", record_type: "source_precision_ranking_v3", version: "3.0.0",
    status: directReady ? "DIRECT_TOP200_CANDIDATE_DEPTH_READY" : "VALID_CALIBRATION_DRIVEN_RERANK_RESIDUAL_SOURCE_GAP",
    generated_at: GENERATED_AT, precision_v1_records: universe.records.length, calibration_cases: 400,
    attempted_candidate_records: attempted.length, deduplicated_candidate_families: retained.length, records: retained,
    source_pool_promotions: 0, acquisition_authorized: false, candidate_r2: "BLOCKED", production: "HOLD"
  };
  outputs["source-precision-v3-candidate-buffer.json"] = {
    id: "kidults-source-precision-v3-candidate-buffer", record_type: "source_precision_candidate_buffer", version: "3.0.0",
    status: retained.length >= 240 ? "PREFERRED_240_BUFFER_READY" : "BUFFER_SHORTFALL_EXPLICIT",
    generated_at: GENERATED_AT, target_count: 240, record_count: buffer.length, records: buffer,
    source_pool_promotions: 0, acquisition_authorized: false, production: "HOLD"
  };
  outputs["direct-top200-candidate-queue-v3.json"] = {
    id: "kidults-direct-top200-candidate-queue-v3", record_type: "direct_top200_candidate_queue", version: "3.0.0",
    status: directReady ? "READY_FOR_TRACK_B_DIRECT_TOP200_PACKAGING" : "HOLD_RESIDUAL_SOURCE_DEPTH",
    generated_at: GENERATED_AT, frozen: directReady, target_count: 200, record_count: top200.length, records: top200,
    source_pool_promotions: 0, acquisition_authorized: false, production: "HOLD"
  };
  outputs["source-family-deduplication-v3.json"] = {
    id: "kidults-source-family-deduplication-v3", record_type: "source_family_deduplication", version: "3.0.0", status: "PASS",
    generated_at: GENERATED_AT, attempted_records: attempted.length, retained_unique_families: retained.length,
    collapsed_count: collapsed.length, records: collapsed, production: "HOLD"
  };
  outputs["scope-role-depth-v3.json"] = {
    id: "kidults-scope-role-depth-v3", record_type: "scope_role_depth", version: "3.0.0",
    status: "GAP_MEASURED", generated_at: GENERATED_AT, scope_count: scopeDepth.length,
    scopes_represented: scopeDepth.filter(value => value.candidate_family_count > 0).length,
    scopes_at_eight_family_floor: scopeDepth.filter(value => value.family_gap_to_8 === 0).length,
    remaining_family_assignments_to_eight_floor: scopeDepth.reduce((sum, value) => sum + value.family_gap_to_8, 0), records: scopeDepth,
    production: "HOLD"
  };
  outputs["calibration-feature-ledger-v3.json"] = {
    id: "kidults-calibration-feature-ledger-v3", record_type: "calibration_feature_ledger", version: "3.0.0",
    status: "400_CASE_CALIBRATION_APPLIED", generated_at: GENERATED_AT,
    reviewed: calibration400.reviewed_records, relevant: calibration400.relevant_records, not_relevant: calibration400.not_relevant_records,
    duplicate_underlying_work_flags: calibration400.duplicate_underlying_work_flags, collision_counts: collisionCounts,
    exact_calibration_negative_ids: [...calibrationNegativeIds].sort(), exact_calibration_positive_nonduplicate_count: calibrationPositive.length,
    production: "HOLD"
  };
  outputs["v3-residual-source-gap.json"] = {
    id: "kidults-v3-residual-source-gap", record_type: "source_depth_residual_gap", version: "3.0.0",
    status: directReady ? "DIRECT_TOP200_DEPTH_READY" : "TARGETED_DISCOVERY_REQUIRED_FOR_RESIDUAL_ONLY",
    generated_at: GENERATED_AT, deduplicated_candidate_families: retained.length,
    direct_top200_family_gap: Math.max(0, 200 - retained.length), preferred_240_buffer_gap: Math.max(0, 240 - retained.length),
    scopes_without_any_candidate: scopeDepth.filter(value => value.candidate_family_count === 0).map(value => value.scope_id),
    scope_family_gaps: scopeDepth.filter(value => value.family_gap_to_8 > 0),
    direct_top200_ready: directReady, generic_broad_discovery_authorized: false, targeted_residual_discovery_authorized: !directReady,
    source_pool_promotions: 0, acquisition_authorized: false, candidate_r2: "BLOCKED", production: "HOLD"
  };

  for (const value of Object.values(outputs)) value.fingerprint = fingerprint(value);
  const manifest = {
    id: "kidults-source-precision-ranking-v3-run", record_type: "source_precision_ranking_v3_run", version: "3.0.0",
    status: directReady ? "RANKING_V3_PASS_TOP200_DEPTH_READY" : "RANKING_V3_PASS_RESIDUAL_GAP_EXPLICIT",
    generated_at: GENERATED_AT,
    inputs: {
      precision_v1: { id: universe.id, fingerprint: universe.fingerprint },
      v2_ranked: { id: rankedV2.id, fingerprint: rankedV2.fingerprint },
      calibration_400: { id: calibration400.id, fingerprint: calibration400.fingerprint },
      targeted_registry: { id: targetedRegistry.id, fingerprint: targetedRegistry.fingerprint },
      targeted_assessment: { id: targetedAssessment.id, fingerprint: targetedAssessment.fingerprint },
      scope_registry: { id: scopeRegistry.id, fingerprint: fingerprint(scopeRegistry) }
    },
    outputs: Object.fromEntries(Object.entries(outputs).map(([name, value]) => [name, value.fingerprint])),
    precision_v1_records: universe.records.length, calibration_cases: 400, targeted_reviewed_positive: targetedPositiveIds.size,
    deduplicated_candidate_families: retained.length, candidate_buffer_count: buffer.length, direct_top200_count: top200.length,
    direct_top200_ready: directReady, residual_top200_gap: Math.max(0, 200 - retained.length), residual_240_gap: Math.max(0, 240 - retained.length),
    source_pool_promotions: 0, acquisition_authorized: false, candidate_r2_created: false, production: "HOLD"
  };
  manifest.run_fingerprint = fingerprint(manifest);
  outputs["run-manifest.json"] = manifest;
  return outputs;
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  const outputs = buildSourcePrecisionRankingV3(config);
  if (config.write) writeJsonDirectory(config.output, outputs);
  const run = outputs["run-manifest.json"];
  console.log("KIDULTS Source Precision Ranking v3: PASS");
  console.log(`Candidate families: ${run.deduplicated_candidate_families}; direct Top-200 gap: ${run.residual_top200_gap}; preferred buffer gap: ${run.residual_240_gap}`);
  console.log("Source Pool promotions 0; Acquisition BLOCKED; Candidate R2 BLOCKED; Production HOLD");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
