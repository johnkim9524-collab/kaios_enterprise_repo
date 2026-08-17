import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { fingerprint, hashId, normalizeUrl, readJson, unique, writeJsonDirectory } from "./asi-discovery-common-v1.mjs";

const root = process.cwd();
const contractPath = path.join(root, "coordination", "kidults", "source-intelligence", "source-precision-ranking-v2-contract.json");
const scopeRegistryPath = path.join(root, "coordination", "kidults", "data-scope", "collection-scope-registry-v1.json");
const trustedRoot = path.join(root, "coordination", "kidults", "registry", "trusted-source");
const trustedIndexPath = path.join(trustedRoot, "index.json");
const adapterRoot = path.join(root, "coordination", "kidults", "autonomous", "source-discovery", "contracts");
const defaultPrecisionInput = path.join(root, "artifacts", "input", "source-relevance-precision-v1");
const defaultPilotInput = path.join(root, "artifacts", "input", "track-b-top50-pilot-v1");
const defaultOutput = path.join(root, "artifacts", "agci-os", "source-precision-ranking-v2");

function parseArgs(argv) {
  const config = { precisionInput: defaultPrecisionInput, pilotInput: defaultPilotInput, output: defaultOutput, write: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--precision-input") config.precisionInput = path.resolve(argv[++index]);
    else if (argument === "--pilot-input") config.pilotInput = path.resolve(argv[++index]);
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
    .replace(/[_|]+/g, " ")
    .replace(/[^a-z0-9:/+.@-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function termHits(text, terms = []) {
  return unique(terms.map(normalizeText).filter(term => term.length >= 3 && text.includes(term)));
}

function evidenceText(record) {
  const excerpt = record.evidence_excerpt ?? {};
  return normalizeText([
    record.endpoint_url,
    record.owner,
    record.channel_type,
    ...(excerpt.source_names ?? []),
    ...(excerpt.descriptions ?? []),
    ...(excerpt.topics ?? []),
    ...(excerpt.publishers ?? []),
    ...(excerpt.titles ?? [])
  ].join(" "));
}

function loadTrustedRecords() {
  const index = readJson(trustedIndexPath);
  return index.records
    .map(reference => readJson(path.join(trustedRoot, reference.path)))
    .sort((a, b) => a.vertical_id.localeCompare(b.vertical_id));
}

function loadAdapterContracts() {
  if (!fs.existsSync(adapterRoot)) return [];
  return fs.readdirSync(adapterRoot)
    .filter(name => name.endsWith(".json"))
    .sort()
    .map(name => ({ file: name, ...readJson(path.join(adapterRoot, name)) }));
}

function canonicalRoles(rawRoles, aliases) {
  return unique((rawRoles ?? []).map(role => aliases[String(role).toLowerCase()] ?? String(role).toUpperCase()));
}

function scopeEvidence(record, contract) {
  const text = evidenceText(record);
  const details = (record.candidate_collection_scopes ?? []).map(scopeId => {
    const positive = termHits(text, contract.scope_strong_terms[scopeId] ?? []);
    const collisions = termHits(text, contract.scope_collision_terms[scopeId] ?? []);
    return {
      scope_id: scopeId,
      positive_terms: positive,
      collision_terms: collisions,
      score: positive.length * 12 - collisions.length * 50
    };
  }).sort((a, b) => b.score - a.score || a.scope_id.localeCompare(b.scope_id));
  return details[0] ?? { scope_id: null, positive_terms: [], collision_terms: [], score: 0 };
}

function correctRoles(record, text) {
  const roles = new Set();
  const channel = record.channel_type;
  const supplied = record.candidate_source_roles ?? [];
  const research = /study|research|thesis|paper|article|conference|reproducibility|journal/.test(text);
  if (channel === "DATACITE_DATASET_OR_RESEARCH_RECORD" || research) {
    roles.add("INDEPENDENT_VERIFICATION");
    if (/provenance|ownership|historical archive|object history|geneahorology/.test(text)) roles.add("PROVENANCE_HISTORY");
    if (/authentication|grading|gemolog|gemstone|pearl|hallmark|condition|centering measurement/.test(text)) roles.add("AUTHENTICATION_CONDITION");
    if (/market|price|sales|investment|financial|scarcity|liquidity/.test(text)) roles.add("MACRO_CONTEXT");
    if (/culture|fashion history|design history|popular culture|media|community/.test(text)) roles.add("CULTURE_ATTENTION");
    if (/event-level sold records|auction results database|transaction dataset/.test(text)) roles.add("SOLD_TRANSACTION");
  } else {
    for (const role of supplied) roles.add(role);
    if (/catalog|catalogue|database|registry|reference|archive/.test(text)) roles.add("CATALOG_REFERENCE");
    if (/official|manufacturer|museum collection|institutional collection/.test(text)) roles.add("PRIMARY_AUTHORITY");
    if (/sold|auction result|transaction|hammer price|realized price/.test(text)) roles.add("SOLD_TRANSACTION");
    if (/listing|inventory|marketplace|availability/.test(text)) roles.add("LISTING_SUPPLY");
    if (/authentication|grading|certification|population report|condition/.test(text)) roles.add("AUTHENTICATION_CONDITION");
    if (/provenance|ownership history|archive/.test(text)) roles.add("PROVENANCE_HISTORY");
  }
  return [...roles].sort();
}

function underlyingWorkKey(record) {
  if (record.record_origin && record.record_origin !== "BATCH_001_ENDPOINT") {
    return `anchor:${record.source_id}`;
  }
  const excerpt = record.evidence_excerpt ?? {};
  const sourceName = normalizeText((excerpt.source_names ?? [])[0]);
  const publisher = normalizeText((excerpt.publishers ?? [])[0] ?? record.owner);
  if (record.channel_type === "DATACITE_DATASET_OR_RESEARCH_RECORD" && sourceName.length >= 20) {
    const title = sourceName
      .replace(/\b(dataset|data set|version|reproducibility archive|supplement|v[0-9]+)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return `work:${publisher}:${title}`;
  }
  if (/GITHUB_REPOSITORY|PROJECT_HOMEPAGE_FROM_GITHUB/.test(record.channel_type) && sourceName.includes("/")) {
    return `repo:${sourceName}`;
  }
  try {
    const url = new URL(record.endpoint_url);
    let pathname = url.pathname.replace(/\/(?:files?|versions?)\/\d+$/i, "").replace(/\/\d+$/, "").replace(/\/$/, "");
    return `url:${url.hostname.toLowerCase().replace(/^www\./, "")}${pathname.toLowerCase()}`;
  } catch {
    return `endpoint:${record.endpoint_id}`;
  }
}

function buildTrustedAnchors(contract, trustedRecords) {
  const records = [];
  for (const vertical of trustedRecords) {
    for (const candidate of vertical.source_candidates ?? []) {
      const scopeIds = contract.trusted_anchor_scope_map[candidate.source_id] ?? [];
      if (!scopeIds.length) continue;
      const endpoint = normalizeUrl(candidate.official_url) ?? candidate.official_url;
      records.push({
        source_id: candidate.source_id,
        endpoint_id: hashId("ep", endpoint),
        endpoint_url: endpoint,
        owner: candidate.display_name,
        channel_type: candidate.access_mode?.includes("API") ? "TRUSTED_REGISTRY_API_OR_DATASET" : "TRUSTED_REGISTRY_OFFICIAL_CHANNEL",
        candidate_collection_scopes: scopeIds,
        candidate_source_roles: canonicalRoles(candidate.primary_roles, contract.source_role_aliases),
        corrected_source_roles: canonicalRoles(candidate.primary_roles, contract.source_role_aliases),
        record_origin: "TRUSTED_SOURCE_REGISTRY",
        verification_state: candidate.verification_state ?? "NOT_VERIFIED",
        rights_state: candidate.rights_state ?? "UNKNOWN",
        commercial_use_state: candidate.commercial_use_state ?? "UNKNOWN",
        trust_score_provisional: candidate.trust_score_provisional ?? null,
        evidence_excerpt: {
          source_names: [candidate.display_name],
          descriptions: [candidate.authority_basis, candidate.coverage_scope].filter(Boolean),
          topics: candidate.primary_roles ?? [],
          publishers: [candidate.display_name],
          titles: []
        },
        explicit_scope_evidence: scopeIds,
        explicit_channel_suitability: true,
        hard_rejection_reasons: [],
        training_state: "NOT_IN_PILOT_TRAINING_SET",
        ranking_score: contract.ranking_rules.trusted_registry_anchor_base_score + (candidate.trust_score_provisional ?? 0),
        ranking_state: "ANCHOR_CANDIDATE_NOT_TRACK_B_VALIDATED",
        qualification_state: "NOT_QUALIFIED",
        acquisition_authorized: false,
        production: "HOLD"
      });
    }
  }
  return records;
}

function buildAdapterAnchors(contract, adapterContracts) {
  const records = [];
  for (const adapter of adapterContracts) {
    const scopeIds = contract.bounded_adapter_scope_map[adapter.contract_id] ?? [];
    if (!scopeIds.length) continue;
    const endpoint = normalizeUrl(adapter.api_base_url ?? adapter.official_url ?? adapter.references?.[0]);
    if (!endpoint) continue;
    records.push({
      source_id: adapter.source_id ?? adapter.contract_id,
      endpoint_id: hashId("ep", endpoint),
      endpoint_url: endpoint,
      owner: adapter.source_id ?? adapter.contract_id,
      channel_type: "BOUNDED_ADAPTER_CONTRACT",
      candidate_collection_scopes: scopeIds,
      candidate_source_roles: ["PRIMARY_AUTHORITY", "CATALOG_REFERENCE", "INDEPENDENT_VERIFICATION"],
      corrected_source_roles: ["PRIMARY_AUTHORITY", "CATALOG_REFERENCE", "INDEPENDENT_VERIFICATION"],
      record_origin: "BOUNDED_ADAPTER_CONTRACT",
      verification_state: adapter.status ?? "UNKNOWN",
      rights_state: adapter.rights_state ?? "UNKNOWN",
      commercial_use_state: adapter.collection_mode ?? "UNKNOWN",
      trust_score_provisional: null,
      evidence_excerpt: {
        source_names: [adapter.source_id ?? adapter.contract_id],
        descriptions: [adapter.source_class, adapter.access_mode, adapter.collection_mode].filter(Boolean),
        topics: adapter.field_allowlist ?? [],
        publishers: [adapter.owner ?? "Track A"],
        titles: []
      },
      explicit_scope_evidence: scopeIds,
      explicit_channel_suitability: true,
      hard_rejection_reasons: [],
      training_state: "NOT_IN_PILOT_TRAINING_SET",
      ranking_score: contract.ranking_rules.bounded_adapter_anchor_base_score,
      ranking_state: "BOUNDED_ADAPTER_ANCHOR_NOT_SOURCE_POOL_PROMOTION",
      qualification_state: "NOT_QUALIFIED",
      acquisition_authorized: false,
      production: "HOLD"
    });
  }
  return records;
}

function scoreRawRecord(record, contract, pilotMap) {
  const text = evidenceText(record);
  const scope = scopeEvidence(record, contract);
  const licenseHits = termHits(text, contract.license_business_rejection_terms);
  const genericHits = termHits(text, contract.generic_software_rejection_terms);
  const channelHits = termHits(text, contract.channel_suitability_terms);
  const decisionHits = termHits(text, contract.decision_evidence_terms);
  const hardReasons = [];
  if (licenseHits.length || normalizeText(record.owner).includes("royaltystat")) hardReasons.push("LICENSE_FRANCHISE_OR_BUSINESS_RECORD");
  if (scope.collision_terms.length) hardReasons.push("KNOWN_SCOPE_SEMANTIC_COLLISION");
  if (/GITHUB_REPOSITORY|PROJECT_HOMEPAGE_FROM_GITHUB/.test(record.channel_type) && genericHits.length && scope.positive_terms.length === 0) {
    hardReasons.push("GENERIC_SOFTWARE_OR_KEYWORD_COLLISION");
  }
  const trainingReview = pilotMap.get(record.endpoint_id);
  let trainingState = "NOT_IN_PILOT_TRAINING_SET";
  if (trainingReview?.scope_relevance_label === "RELEVANT") trainingState = contract.training_rules.pilot_relevant_endpoint_state;
  if (trainingReview?.scope_relevance_label === "NOT_RELEVANT") {
    trainingState = contract.training_rules.pilot_false_positive_endpoint_state;
    hardReasons.push("TRACK_B_PILOT_FALSE_POSITIVE");
  }

  const correctedRoles = correctRoles(record, text);
  let channelSuitability = channelHits.length > 0;
  if (record.channel_type === "OFFICIAL_WEBSITE_CLAIM_FROM_WIKIDATA") channelSuitability = true;
  if (record.channel_type === "DATACITE_DATASET_OR_RESEARCH_RECORD") {
    channelSuitability = channelHits.length > 0 && decisionHits.length > 0 && scope.positive_terms.length > 0;
  }
  if (/GITHUB_REPOSITORY|PROJECT_HOMEPAGE_FROM_GITHUB/.test(record.channel_type)) {
    channelSuitability = channelHits.length > 0 && scope.positive_terms.length > 0 && genericHits.length === 0;
  }

  const authorityHits = termHits(text, ["official", "museum", "archive", "library", "institute", "foundation", "manufacturer", "association", "university", "government", "heritage", "society"]);
  const channelBonus = record.channel_type === "OFFICIAL_WEBSITE_CLAIM_FROM_WIKIDATA" ? 24
    : record.channel_type === "DATACITE_DATASET_OR_RESEARCH_RECORD" ? 10
      : record.channel_type === "GITHUB_REPOSITORY" ? 8
        : 3;
  const penalties = hardReasons.length * 100 + genericHits.length * 12 + (channelSuitability ? 0 : 35) + (scope.positive_terms.length ? 0 : 45);
  const rankingScore = scope.positive_terms.length * 18 + channelHits.length * 7 + decisionHits.length * 4 + authorityHits.length * 3 + correctedRoles.length * 2 + channelBonus - penalties;
  const rankingState = hardReasons.length ? "REJECT_V2_HARD_GATE"
    : rankingScore >= contract.ranking_rules.raw_candidate_promotion_score_minimum && channelSuitability
      ? "PROMOTE_TO_V2_REVIEW_QUEUE_NOT_QUALIFIED"
      : rankingScore >= contract.ranking_rules.raw_candidate_hold_score_minimum
        ? "HOLD_V2_MORE_EVIDENCE_REQUIRED"
        : "REJECT_V2_INSUFFICIENT_SCOPE_OR_CHANNEL_EVIDENCE";

  return {
    ...record,
    record_origin: "BATCH_001_ENDPOINT",
    corrected_source_roles: correctedRoles,
    explicit_scope_evidence: scope.positive_terms,
    best_v2_scope_id: scope.scope_id,
    scope_collision_evidence: scope.collision_terms,
    explicit_channel_suitability: channelSuitability,
    channel_suitability_evidence: channelHits,
    decision_evidence: decisionHits,
    authority_evidence_v2: authorityHits,
    license_business_evidence: licenseHits,
    generic_software_evidence_v2: genericHits,
    hard_rejection_reasons: unique(hardReasons),
    training_state: trainingState,
    ranking_score: rankingScore,
    ranking_state: rankingState,
    qualification_state: "NOT_QUALIFIED",
    acquisition_authorized: false,
    production: "HOLD"
  };
}

function deduplicateUnderlying(records) {
  const groups = new Map();
  for (const record of records) {
    const key = underlyingWorkKey(record);
    record.underlying_work_key = key;
    const values = groups.get(key) ?? [];
    values.push(record);
    groups.set(key, values);
  }
  const retained = [];
  const collapsed = [];
  for (const [key, values] of groups) {
    values.sort((a, b) => b.ranking_score - a.ranking_score || a.endpoint_id.localeCompare(b.endpoint_id));
    retained.push(values[0]);
    if (values.length > 1) collapsed.push({
      underlying_work_key: key,
      retained_endpoint_id: values[0].endpoint_id,
      collapsed_endpoint_ids: values.slice(1).map(value => value.endpoint_id),
      collapsed_count: values.length - 1
    });
  }
  retained.sort((a, b) => b.ranking_score - a.ranking_score || a.endpoint_id.localeCompare(b.endpoint_id));
  collapsed.sort((a, b) => a.underlying_work_key.localeCompare(b.underlying_work_key));
  return { retained, collapsed };
}

function stripForBlind(record, rank) {
  return {
    blind_case_id: `v2-blind-${String(rank).padStart(3, "0")}`,
    endpoint_id: record.endpoint_id,
    source_id: record.source_id,
    endpoint_url: record.endpoint_url,
    owner: record.owner,
    channel_type: record.channel_type,
    record_origin: record.record_origin,
    candidate_collection_scopes: record.candidate_collection_scopes,
    assigned_source_roles: record.corrected_source_roles,
    evidence_excerpt: record.evidence_excerpt,
    explicit_scope_evidence: record.explicit_scope_evidence,
    channel_suitability_evidence: record.channel_suitability_evidence ?? [record.channel_type],
    rights_state: record.rights_state ?? "UNKNOWN_NOT_INFERRED",
    verification_state: record.verification_state ?? "NOT_VERIFIED",
    underlying_work_key: record.underlying_work_key,
    numeric_ranking_score_visible_to_reviewer: false,
    training_endpoint_excluded: true,
    track_b_scope_relevance_label: null,
    track_b_source_role_label: null,
    track_b_rationale: null,
    track_b_reviewed_at: null,
    qualification_state: "NOT_QUALIFIED",
    acquisition_authorized: false,
    production: "HOLD"
  };
}

export function buildSourcePrecisionRankingV2({ precisionInput = defaultPrecisionInput, pilotInput = defaultPilotInput } = {}) {
  const contract = readJson(contractPath);
  const scopeRegistry = readJson(scopeRegistryPath);
  const universe = readJson(path.join(precisionInput, "provisional-precision-ranked-universe-v1.json"));
  const pilot = readJson(path.join(pilotInput, "source-relevance-top50-pilot-assessment-v1.json"));
  const taxonomy = readJson(path.join(pilotInput, "top50-false-positive-taxonomy-v1.json"));
  const directives = readJson(path.join(pilotInput, "top50-ranking-recalibration-directives-v1.json"));
  const pilotMap = new Map(pilot.records.map(record => [record.endpoint_id, record]));
  const pilotIds = new Set(pilot.records.map(record => record.endpoint_id));

  const anchors = [
    ...buildTrustedAnchors(contract, loadTrustedRecords()),
    ...buildAdapterAnchors(contract, loadAdapterContracts())
  ];
  const raw = universe.records.map(record => scoreRawRecord(record, contract, pilotMap));
  const { retained, collapsed } = deduplicateUnderlying([...anchors, ...raw]);
  retained.forEach((record, index) => { record.v2_rank = index + 1; });

  const top200 = retained.slice(0, contract.targets.top_200_review_queue);
  const blindEligible = retained.filter(record =>
    !pilotIds.has(record.endpoint_id) &&
    record.hard_rejection_reasons.length === 0 &&
    record.explicit_scope_evidence.length > 0 &&
    record.explicit_channel_suitability === true &&
    !record.scope_collision_evidence?.length &&
    ["TRUSTED_SOURCE_REGISTRY", "BOUNDED_ADAPTER_CONTRACT"].includes(record.record_origin)
      || (
        !pilotIds.has(record.endpoint_id) &&
        record.hard_rejection_reasons.length === 0 &&
        record.explicit_scope_evidence.length > 0 &&
        record.explicit_channel_suitability === true &&
        record.ranking_state === "PROMOTE_TO_V2_REVIEW_QUEUE_NOT_QUALIFIED"
      )
  );
  const blindTop50 = [];
  const blindKeys = new Set();
  for (const record of blindEligible) {
    if (blindTop50.length >= contract.targets.blind_top_50_review_queue) break;
    if (blindKeys.has(record.underlying_work_key)) continue;
    blindTop50.push(record);
    blindKeys.add(record.underlying_work_key);
  }
  if (blindTop50.length < contract.targets.blind_top_50_review_queue) {
    for (const record of retained) {
      if (blindTop50.length >= contract.targets.blind_top_50_review_queue) break;
      if (pilotIds.has(record.endpoint_id) || record.hard_rejection_reasons.length || blindKeys.has(record.underlying_work_key)) continue;
      if (!record.explicit_scope_evidence.length || !record.explicit_channel_suitability) continue;
      record.blind_queue_fill_state = "STRONGEST_AVAILABLE_HOLD_REQUIRES_TRACK_B_REJECTION_OR_CONFIRMATION";
      blindTop50.push(record);
      blindKeys.add(record.underlying_work_key);
    }
  }
  if (blindTop50.length !== contract.targets.blind_top_50_review_queue) {
    throw new Error(`Unable to build blind Top-50 queue; selected ${blindTop50.length}.`);
  }

  const rankedUniverse = {
    id: "kidults-source-precision-ranked-universe-v2",
    record_type: "source_precision_ranked_universe",
    version: "2.0.0",
    status: "PILOT_TAXONOMY_RECALIBRATED_TRACK_B_BLIND_RECHECK_PENDING",
    generated_at: contract.effective_at,
    contract_id: contract.id,
    input_endpoint_count: universe.records.length,
    anchor_candidate_count: anchors.length,
    deduplicated_ranked_count: retained.length,
    records: retained,
    source_pool_promotions: 0,
    acquisition_authorized: false,
    production: "HOLD"
  };

  const top200Queue = {
    id: "kidults-source-precision-top-200-review-queue-v2",
    record_type: "source_precision_review_queue",
    version: "2.0.0",
    status: "V2_QUEUE_READY_NOT_QUALIFIED",
    generated_at: contract.effective_at,
    contract_id: contract.id,
    record_count: top200.length,
    pilot_training_endpoint_count: pilotIds.size,
    records: top200,
    source_pool_promotions: 0,
    acquisition_authorized: false,
    production: "HOLD"
  };

  const blindInput = {
    id: "kidults-source-precision-blind-top50-input-v2",
    record_type: "track_b_blind_source_relevance_input",
    version: "2.0.0",
    status: "BLIND_REVIEW_READY_NUMERIC_SCORE_HIDDEN",
    generated_at: contract.effective_at,
    contract_id: contract.id,
    record_count: blindTop50.length,
    pilot_training_endpoint_overlap: blindTop50.filter(record => pilotIds.has(record.endpoint_id)).length,
    records: blindTop50.map((record, index) => stripForBlind(record, index + 1)),
    source_pool_promotions: 0,
    acquisition_authorized: false,
    production: "HOLD"
  };

  const rejectedAndHeld = {
    id: "kidults-source-precision-v2-rejected-and-held-register",
    record_type: "source_precision_rejected_and_held_register",
    version: "2.0.0",
    status: "V2_ERROR_CORPUS_ACTIVE",
    generated_at: contract.effective_at,
    rejected_count: retained.filter(record => record.ranking_state?.startsWith("REJECT")).length,
    held_count: retained.filter(record => record.ranking_state?.startsWith("HOLD")).length,
    records: retained.filter(record => record.ranking_state?.startsWith("REJECT") || record.ranking_state?.startsWith("HOLD")),
    acquisition_authorized: false,
    production: "HOLD"
  };

  const dedupReport = {
    id: "kidults-underlying-work-deduplication-report-v1",
    record_type: "underlying_work_deduplication_report",
    version: "1.0.0",
    status: "PASS",
    generated_at: contract.effective_at,
    input_records: anchors.length + raw.length,
    retained_records: retained.length,
    collapsed_groups: collapsed.length,
    collapsed_endpoints: collapsed.reduce((sum, value) => sum + value.collapsed_count, 0),
    blind_top50_duplicate_underlying_works: blindTop50.length - new Set(blindTop50.map(record => record.underlying_work_key)).size,
    records: collapsed,
    production: "HOLD"
  };

  const roleCorrectionRecords = raw
    .filter(record => JSON.stringify(record.candidate_source_roles ?? []) !== JSON.stringify(record.corrected_source_roles ?? []))
    .map(record => ({
      endpoint_id: record.endpoint_id,
      endpoint_url: record.endpoint_url,
      supplied_roles: record.candidate_source_roles ?? [],
      corrected_roles: record.corrected_source_roles,
      channel_type: record.channel_type,
      training_state: record.training_state
    }));
  const roleCorrection = {
    id: "kidults-source-role-correction-report-v1",
    record_type: "source_role_correction_report",
    version: "1.0.0",
    status: "PILOT_TAXONOMY_APPLIED",
    generated_at: contract.effective_at,
    corrected_record_count: roleCorrectionRecords.length,
    records: roleCorrectionRecords,
    production: "HOLD"
  };

  const blindLicenseCount = blindTop50.filter(record => record.license_business_evidence?.length).length;
  const blindCollisionCount = blindTop50.filter(record => record.scope_collision_evidence?.length).length;
  const gapReport = {
    id: "kidults-source-precision-v2-gap-report",
    record_type: "source_precision_gap_report",
    version: "2.0.0",
    status: "V2_STRUCTURAL_GATE_PASS_EMPIRICAL_PRECISION_PENDING",
    generated_at: contract.effective_at,
    input_endpoints: universe.records.length,
    trusted_and_bounded_anchor_candidates: anchors.length,
    pilot_training_cases: pilot.records.length,
    pilot_false_positive_taxonomy: taxonomy.code_counts,
    recalibration_directives: directives.directives,
    top_200_records: top200.length,
    blind_top_50_records: blindTop50.length,
    blind_top_50_training_overlap: blindInput.pilot_training_endpoint_overlap,
    blind_top_50_license_or_business_records: blindLicenseCount,
    blind_top_50_known_scope_collisions: blindCollisionCount,
    blind_top_50_duplicate_underlying_works: dedupReport.blind_top50_duplicate_underlying_works,
    blind_top_50_explicit_scope_evidence_coverage: blindTop50.filter(record => record.explicit_scope_evidence.length).length / blindTop50.length,
    blind_top_50_channel_suitability_coverage: blindTop50.filter(record => record.explicit_channel_suitability).length / blindTop50.length,
    measured_top_50_precision: null,
    measured_top_50_precision_status: "NOT_MEASURED_NEW_BLIND_REVIEW_REQUIRED",
    interim_precision_threshold: contract.targets.interim_top50_precision_minimum,
    final_precision_threshold: contract.targets.final_top50_precision_minimum,
    source_pool_promotions: 0,
    acquisition_authorized: false,
    candidate_r2: "BLOCKED",
    kidult_500: "NOT_COMPUTED",
    kidult_100: "NOT_COMPUTED",
    production: "HOLD"
  };

  const outputs = {
    "precision-ranked-universe-v2.json": rankedUniverse,
    "precision-top-200-review-queue-v2.json": top200Queue,
    "blind-top50-input-v2.json": blindInput,
    "precision-v2-rejected-and-held-register.json": rejectedAndHeld,
    "underlying-work-deduplication-report-v1.json": dedupReport,
    "source-role-correction-report-v1.json": roleCorrection,
    "precision-v2-gap-report.json": gapReport
  };
  for (const value of Object.values(outputs)) value.fingerprint = fingerprint(value);

  const manifest = {
    id: "kidults-source-precision-ranking-v2-run",
    record_type: "source_precision_ranking_run",
    version: "2.0.0",
    status: "SOURCE_PRECISION_RANKING_V2_PASS_BLIND_RECHECK_PENDING",
    generated_at: contract.effective_at,
    inputs: {
      contract: { id: contract.id, fingerprint: fingerprint(contract) },
      scope_registry: { id: scopeRegistry.id, fingerprint: fingerprint(scopeRegistry) },
      precision_universe: { id: universe.id, fingerprint: universe.fingerprint },
      pilot_assessment: { id: pilot.id, fingerprint: pilot.fingerprint },
      trusted_registry: { id: readJson(trustedIndexPath).registry_id, fingerprint: fingerprint(readJson(trustedIndexPath)) }
    },
    outputs: Object.fromEntries(Object.entries(outputs).map(([name, value]) => [name, value.fingerprint])),
    input_endpoint_count: universe.records.length,
    anchor_candidate_count: anchors.length,
    ranked_count: retained.length,
    top_200_count: top200.length,
    blind_top_50_count: blindTop50.length,
    blind_training_overlap: blindInput.pilot_training_endpoint_overlap,
    blind_license_count: blindLicenseCount,
    blind_collision_count: blindCollisionCount,
    blind_underlying_duplicate_count: dedupReport.blind_top50_duplicate_underlying_works,
    measured_precision: null,
    measured_precision_status: "NOT_MEASURED",
    source_pool_promotions: 0,
    acquisition_authorized: false,
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
  const outputs = buildSourcePrecisionRankingV2({ precisionInput: config.precisionInput, pilotInput: config.pilotInput });
  if (config.write) writeJsonDirectory(config.output, outputs);
  const manifest = outputs["run-manifest.json"];
  console.log("KIDULTS Source Precision Ranking v2: PASS / BLIND RECHECK PENDING");
  console.log(`Input / ranked endpoints: ${manifest.input_endpoint_count} / ${manifest.ranked_count}`);
  console.log(`Anchor candidates: ${manifest.anchor_candidate_count}`);
  console.log(`Top-200 / Blind Top-50: ${manifest.top_200_count} / ${manifest.blind_top_50_count}`);
  console.log(`Blind training overlap / license / collisions / duplicates: ${manifest.blind_training_overlap} / ${manifest.blind_license_count} / ${manifest.blind_collision_count} / ${manifest.blind_underlying_duplicate_count}`);
  console.log("Measured precision: NOT_MEASURED — new Track B blind review required");
  console.log("Acquisition: BLOCKED; Production: HOLD");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
