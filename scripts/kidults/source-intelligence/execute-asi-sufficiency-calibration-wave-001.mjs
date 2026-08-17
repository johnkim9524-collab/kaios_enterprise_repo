import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import {
  fingerprint,
  hashId,
  normalizeUrl,
  readJson,
  unique,
  writeJsonDirectory
} from "./asi-discovery-common-v1.mjs";

const root = process.cwd();
const contractPath = path.join(
  root,
  "coordination",
  "kidults",
  "source-intelligence",
  "asi-sufficiency-calibration-wave-001-execution-contract-v1.json"
);
const scopeRegistryPath = path.join(
  root,
  "coordination",
  "kidults",
  "data-scope",
  "collection-scope-registry-v1.json"
);
const defaultOutput = path.join(
  root,
  "artifacts",
  "agci-os",
  "asi-sufficiency-calibration-wave-001"
);

const ROLE_DISCOVERY_PHRASES = Object.freeze({
  PRIMARY_AUTHORITY: ["official catalog", "manufacturer archive", "institutional collection"],
  CATALOG_REFERENCE: ["reference database", "catalogue raisonne", "collection catalog"],
  LISTING_SUPPLY: ["specialist marketplace inventory", "dealer archive", "listing database"],
  SOLD_TRANSACTION: ["auction results", "sold price archive", "transaction database"],
  AUTHENTICATION_CONDITION: ["authentication database", "grading population report", "condition reference"],
  PROVENANCE_HISTORY: ["provenance archive", "ownership history", "historical registry"],
  CULTURE_ATTENTION: ["collector community archive", "exhibition archive", "specialist publication index"]
});

const GLOBAL_LANGUAGE_TARGETS = Object.freeze([
  "en", "ja", "de", "fr", "it", "es", "ko", "zh", "pt", "nl", "ar", "ru"
]);

const GENERIC_FALSE_POSITIVE_PATTERNS = Object.freeze([
  /\bawesome[- ]?list\b/i,
  /\bboilerplate\b/i,
  /\bstarter(?: kit| template)?\b/i,
  /\bdemo(?: app| store| ecommerce)?\b/i,
  /\bsample(?: app| project)?\b/i,
  /\btodo\b/i,
  /\btask manager\b/i,
  /\bmechanize\b/i,
  /\bmechanics lab\b/i,
  /\bwayland toolkit\b/i,
  /\bportfolio ecommerce\b/i
]);

function parseArgs(argv) {
  const config = {
    queueInput: null,
    batchInput: null,
    precisionInput: null,
    targetedInput: null,
    sufficiencyInput: null,
    output: defaultOutput,
    write: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--queue-input") config.queueInput = path.resolve(argv[++index]);
    else if (argument === "--batch-input") config.batchInput = path.resolve(argv[++index]);
    else if (argument === "--precision-input") config.precisionInput = path.resolve(argv[++index]);
    else if (argument === "--targeted-input") config.targetedInput = path.resolve(argv[++index]);
    else if (argument === "--sufficiency-input") config.sufficiencyInput = path.resolve(argv[++index]);
    else if (argument === "--output") config.output = path.resolve(argv[++index]);
    else if (argument === "--write") config.write = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  for (const name of ["queueInput", "batchInput", "precisionInput", "targetedInput", "sufficiencyInput"]) {
    if (!config[name]) throw new Error(`Missing required argument: --${name.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`).replace(/Input$/, "-input")}`);
  }
  return config;
}

function findFile(directory, fileName) {
  const direct = path.join(directory, fileName);
  if (fs.existsSync(direct)) return direct;
  const stack = [directory];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const location = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(location);
      else if (entry.name === fileName) return location;
    }
  }
  throw new Error(`Required file not found: ${fileName} under ${directory}`);
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9:/+.@-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function endpointHost(value) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "unknown-host";
  }
}

function ownerKey(value) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown-owner";
}

function explicitState(value) {
  const normalized = String(value ?? "").trim().toUpperCase();
  return Boolean(normalized) && !["NOT_ASSESSED", "NOT_MEASURED", "UNSET", "NULL"].includes(normalized);
}

function knownState(value) {
  const normalized = String(value ?? "").trim().toUpperCase();
  return explicitState(normalized) && !normalized.startsWith("UNKNOWN");
}

function genericCollision(record) {
  const text = [record.owner, record.endpoint_url, record.channel_type, ...(record.evidence_text ?? [])].join(" ");
  return GENERIC_FALSE_POSITIVE_PATTERNS.some(pattern => pattern.test(text));
}

function familyKey(record) {
  if (record.underlying_work_key) return String(record.underlying_work_key);
  const host = endpointHost(record.endpoint_url);
  return `family:${ownerKey(record.owner)}:${host}`;
}

function originPriority(origin) {
  const priorities = {
    TARGETED_HIGH_AUTHORITY: 5000,
    PRECISION_V2_TRUSTED_SOURCE_REGISTRY: 4500,
    PRECISION_V2_BOUNDED_ADAPTER_CONTRACT: 4400,
    PRECISION_V2_HOLD: 3200,
    PRECISION_V2_OTHER: 2200,
    BATCH_001_ENDPOINT: 1000
  };
  return priorities[origin] ?? 0;
}

function channelEvidence(record) {
  if (record.origin === "TARGETED_HIGH_AUTHORITY") return true;
  if (["PRECISION_V2_TRUSTED_SOURCE_REGISTRY", "PRECISION_V2_BOUNDED_ADAPTER_CONTRACT"].includes(record.origin)) return true;
  if (record.explicit_channel_suitability === true) return true;
  const text = normalizeText([record.channel_type, ...(record.evidence_text ?? [])].join(" "));
  return /(official|museum|institution|archive|catalog|catalogue|registry|database|dataset|api|auction|marketplace|grading|certification|transaction|research)/.test(text);
}

function buildTargetedCandidates(records) {
  return records.map(record => ({
    source_id: record.source_id,
    endpoint_id: hashId("ep", normalizeUrl(record.official_endpoint) ?? record.official_endpoint),
    endpoint_url: normalizeUrl(record.official_endpoint) ?? record.official_endpoint,
    owner: record.display_name,
    candidate_collection_scopes: record.collection_scope_ids ?? [],
    candidate_source_roles: record.source_roles ?? [],
    decision_ids: record.customer_decision_archetypes ?? [],
    value_scope_ids: record.irreplaceable_value_scope_ids ?? [],
    channel_type: record.channel_type,
    access_state: record.access_mode,
    rights_state: record.rights_state,
    commercial_use_state: record.commercial_use_state,
    freshness_state: "NOT_MEASURED",
    continuity_state: "NOT_MEASURED",
    jurisdiction_state: record.jurisdiction_state,
    language_state: "NOT_MEASURED",
    verification_state: record.verification_state,
    explicit_scope_evidence: true,
    explicit_channel_suitability: true,
    hard_rejection_reasons: [],
    evidence_text: [record.authority_basis, ...(record.evidence_references ?? [])],
    underlying_work_key: `target:${ownerKey(record.display_name)}:${endpointHost(record.official_endpoint)}`,
    origin: "TARGETED_HIGH_AUTHORITY",
    rank_score: 1000,
    source_pool_promoted: false,
    acquisition_authorized: false,
    production: "HOLD"
  }));
}

function precisionOrigin(record) {
  if (record.record_origin === "TRUSTED_SOURCE_REGISTRY") return "PRECISION_V2_TRUSTED_SOURCE_REGISTRY";
  if (record.record_origin === "BOUNDED_ADAPTER_CONTRACT") return "PRECISION_V2_BOUNDED_ADAPTER_CONTRACT";
  if (record.ranking_state === "HOLD_V2_MORE_EVIDENCE_REQUIRED") return "PRECISION_V2_HOLD";
  return "PRECISION_V2_OTHER";
}

function buildPrecisionCandidates(records) {
  return records.map(record => ({
    source_id: record.source_id,
    endpoint_id: record.endpoint_id,
    endpoint_url: normalizeUrl(record.endpoint_url) ?? record.endpoint_url,
    owner: record.owner,
    candidate_collection_scopes: record.candidate_collection_scopes ?? [],
    candidate_source_roles: record.corrected_source_roles?.length
      ? record.corrected_source_roles
      : (record.candidate_source_roles ?? []),
    decision_ids: [],
    value_scope_ids: [],
    channel_type: record.channel_type,
    access_state: record.channel_type,
    rights_state: record.rights_state,
    commercial_use_state: record.commercial_use_state,
    freshness_state: "NOT_MEASURED",
    continuity_state: "NOT_MEASURED",
    jurisdiction_state: "NOT_MEASURED",
    language_state: "NOT_MEASURED",
    verification_state: record.verification_state,
    explicit_scope_evidence: Array.isArray(record.explicit_scope_evidence)
      ? record.explicit_scope_evidence.length > 0
      : Boolean(record.explicit_scope_evidence),
    explicit_channel_suitability: record.explicit_channel_suitability === true,
    hard_rejection_reasons: record.hard_rejection_reasons ?? [],
    evidence_text: [
      ...(record.evidence_excerpt?.source_names ?? []),
      ...(record.evidence_excerpt?.descriptions ?? []),
      ...(record.evidence_excerpt?.topics ?? []),
      ...(record.evidence_excerpt?.publishers ?? []),
      ...(record.evidence_excerpt?.titles ?? [])
    ],
    underlying_work_key: record.underlying_work_key,
    origin: precisionOrigin(record),
    rank_score: record.ranking_score ?? 0,
    ranking_state: record.ranking_state,
    source_pool_promoted: false,
    acquisition_authorized: false,
    production: "HOLD"
  }));
}

function buildBatchCandidates(records) {
  return records.map(record => ({
    source_id: record.source_id,
    endpoint_id: record.endpoint_id,
    endpoint_url: normalizeUrl(record.endpoint_url) ?? record.endpoint_url,
    owner: record.owner,
    candidate_collection_scopes: record.candidate_collection_scopes ?? [],
    candidate_source_roles: record.candidate_source_roles ?? [],
    decision_ids: record.customer_decisions_supported ?? [],
    value_scope_ids: record.value_scope_ids ?? [],
    channel_type: record.channel_type,
    access_state: record.access_state,
    rights_state: record.rights_state,
    commercial_use_state: record.commercial_use_state,
    freshness_state: record.freshness_state,
    continuity_state: record.continuity_risk,
    jurisdiction_state: record.jurisdiction_state,
    language_state: "NOT_MEASURED",
    verification_state: record.authority_state,
    explicit_scope_evidence: record.scope_relevance_state !== "QUERY_MATCH_PRELIMINARY",
    explicit_channel_suitability: false,
    hard_rejection_reasons: [],
    evidence_text: [
      record.source_family,
      record.latest_metadata_timestamp,
      ...(record.required_data_fields_supported ?? []),
      ...(record.discovery_provenance?.flatMap?.(item => item.evidence ?? []) ?? [])
    ].filter(Boolean),
    underlying_work_key: null,
    origin: "BATCH_001_ENDPOINT",
    rank_score: 0,
    source_pool_promoted: false,
    acquisition_authorized: false,
    production: "HOLD"
  }));
}

function mergeCandidates(...candidateSets) {
  const byEndpoint = new Map();
  for (const candidate of candidateSets.flat()) {
    if (!candidate.endpoint_url) continue;
    candidate.independent_family_key = familyKey(candidate);
    candidate.generic_collision = genericCollision(candidate);
    const key = normalizeUrl(candidate.endpoint_url) ?? candidate.endpoint_url;
    const current = byEndpoint.get(key);
    const candidateScore = originPriority(candidate.origin) + candidate.rank_score;
    const currentScore = current ? originPriority(current.origin) + current.rank_score : -Infinity;
    if (!current || candidateScore > currentScore) byEndpoint.set(key, candidate);
  }
  return [...byEndpoint.values()].sort((a, b) => {
    const scoreA = originPriority(a.origin) + a.rank_score;
    const scoreB = originPriority(b.origin) + b.rank_score;
    return scoreB - scoreA
      || a.independent_family_key.localeCompare(b.independent_family_key)
      || a.endpoint_url.localeCompare(b.endpoint_url);
  });
}

function candidateScore(candidate, scopeId, role) {
  const exactScope = candidate.candidate_collection_scopes.includes(scopeId);
  const exactRole = candidate.candidate_source_roles.includes(role);
  const hardReject = candidate.hard_rejection_reasons.length > 0 || candidate.generic_collision;
  return originPriority(candidate.origin)
    + candidate.rank_score
    + (exactScope ? 500 : 0)
    + (exactRole ? 500 : 0)
    + (candidate.explicit_scope_evidence ? 150 : 0)
    + (channelEvidence(candidate) ? 150 : 0)
    + (candidate.explicit_channel_suitability ? 100 : 0)
    + (candidate.decision_ids.length ? 50 : 0)
    + (candidate.value_scope_ids.length ? 50 : 0)
    + (explicitState(candidate.rights_state) ? 20 : 0)
    + (explicitState(candidate.access_state) ? 20 : 0)
    - (hardReject ? 10000 : 0);
}

function laneCandidates(pool, scopeId, role, maximum) {
  const candidates = pool
    .filter(candidate => candidate.candidate_collection_scopes.includes(scopeId))
    .filter(candidate => candidate.candidate_source_roles.includes(role))
    .map(candidate => ({ candidate, score: candidateScore(candidate, scopeId, role) }))
    .sort((a, b) => b.score - a.score
      || a.candidate.independent_family_key.localeCompare(b.candidate.independent_family_key)
      || a.candidate.endpoint_url.localeCompare(b.candidate.endpoint_url));

  const selected = [];
  const seenFamilies = new Set();
  const seenEndpoints = new Set();
  for (const item of candidates) {
    const endpoint = normalizeUrl(item.candidate.endpoint_url) ?? item.candidate.endpoint_url;
    if (seenFamilies.has(item.candidate.independent_family_key) || seenEndpoints.has(endpoint)) continue;
    seenFamilies.add(item.candidate.independent_family_key);
    seenEndpoints.add(endpoint);
    selected.push(item.candidate);
    if (selected.length === maximum) break;
  }
  return selected;
}

function provisionalAllowedOrigin(origin) {
  return [
    "TARGETED_HIGH_AUTHORITY",
    "PRECISION_V2_TRUSTED_SOURCE_REGISTRY",
    "PRECISION_V2_BOUNDED_ADAPTER_CONTRACT"
  ].includes(origin);
}

function assessCandidate(workItem, candidate) {
  if (!candidate) {
    return {
      work_item_id: workItem.work_item_id,
      wave_id: workItem.wave_id,
      lane_id: workItem.lane_id,
      core_domain_id: workItem.core_domain_id,
      collection_scope_id: workItem.collection_scope_id,
      source_role: workItem.source_role,
      candidate_ordinal: workItem.candidate_ordinal,
      candidate_state: "NO_CANDIDATE_AVAILABLE",
      source_id: null,
      endpoint_id: null,
      endpoint_url: null,
      owner: null,
      independent_family_key: null,
      origin: null,
      checks: {
        candidate_available: false,
        normalized_endpoint_present: false,
        exact_collection_scope_assignment: false,
        exact_source_role_assignment: false,
        owner_identity_present: false,
        independent_family_key_present: false,
        official_or_specialist_channel_evidence: false,
        explicit_channel_suitability: false,
        decision_and_value_linkage_present_or_lane_derived: false,
        rights_state_explicit: false,
        technical_access_state_explicit: false,
        freshness_state_explicit: false,
        continuity_state_explicit: false,
        jurisdiction_state_explicit: false,
        language_state_explicit: false,
        hard_rejection_absent: false
      },
      automated_outcome: "NO_CANDIDATE_AVAILABLE",
      provisional_high_authority_candidate: false,
      qualification_state: "NOT_QUALIFIED",
      rights_cleared: false,
      source_pool_promoted: false,
      acquisition_authorized: false,
      production: "HOLD"
    };
  }

  const exactScope = candidate.candidate_collection_scopes.includes(workItem.collection_scope_id);
  const exactRole = candidate.candidate_source_roles.includes(workItem.source_role);
  const ownerPresent = Boolean(candidate.owner && ownerKey(candidate.owner) !== "unknown-owner");
  const familyPresent = Boolean(candidate.independent_family_key);
  const officialOrSpecialist = channelEvidence(candidate);
  const scopeAndChannelEvidence = candidate.explicit_scope_evidence === true && officialOrSpecialist;
  const decisionValueLinkage = candidate.decision_ids.length > 0
    || candidate.value_scope_ids.length > 0
    || (exactScope && exactRole);
  const rightsExplicit = explicitState(candidate.rights_state) || explicitState(candidate.commercial_use_state);
  const technicalExplicit = explicitState(candidate.access_state) || Boolean(candidate.channel_type);
  const freshnessExplicit = explicitState(candidate.freshness_state);
  const continuityExplicit = explicitState(candidate.continuity_state);
  const jurisdictionExplicit = knownState(candidate.jurisdiction_state);
  const languageExplicit = knownState(candidate.language_state);
  const hardRejectionReasons = unique([
    ...(candidate.hard_rejection_reasons ?? []),
    ...(candidate.generic_collision ? ["GENERIC_SOFTWARE_OR_KEYWORD_COLLISION"] : [])
  ]);
  const hardRejectionAbsent = hardRejectionReasons.length === 0;
  const provisionalHighAuthority = provisionalAllowedOrigin(candidate.origin)
    && exactScope
    && exactRole
    && ownerPresent
    && familyPresent
    && officialOrSpecialist
    && candidate.explicit_channel_suitability === true
    && hardRejectionAbsent;

  let outcome;
  if (!hardRejectionAbsent) outcome = "REJECT_KNOWN_FALSE_POSITIVE_CLASS";
  else if (!scopeAndChannelEvidence || !exactScope || !exactRole) outcome = "HOLD_SCOPE_ROLE_OR_CHANNEL_EVIDENCE_REQUIRED";
  else if (provisionalHighAuthority) outcome = "PROVISIONAL_HIGH_AUTHORITY_CANDIDATE_NOT_QUALIFIED";
  else outcome = "HOLD_RIGHTS_OR_TECHNICAL_PREFLIGHT_REQUIRED";

  return {
    work_item_id: workItem.work_item_id,
    wave_id: workItem.wave_id,
    lane_id: workItem.lane_id,
    core_domain_id: workItem.core_domain_id,
    collection_scope_id: workItem.collection_scope_id,
    source_role: workItem.source_role,
    candidate_ordinal: workItem.candidate_ordinal,
    candidate_state: "AUTONOMOUS_PREASSESSMENT_COMPLETE",
    source_id: candidate.source_id,
    endpoint_id: candidate.endpoint_id,
    endpoint_url: candidate.endpoint_url,
    owner: candidate.owner,
    independent_family_key: candidate.independent_family_key,
    family_resolution_state: candidate.underlying_work_key
      ? "UNDERLYING_WORK_KEY_AVAILABLE_NOT_FINAL_LINEAGE_VALIDATION"
      : "OWNER_ENDPOINT_PROXY_REQUIRES_FINAL_LINEAGE_VALIDATION",
    origin: candidate.origin,
    supplied_collection_scopes: candidate.candidate_collection_scopes,
    supplied_source_roles: candidate.candidate_source_roles,
    rights_state: candidate.rights_state,
    commercial_use_state: candidate.commercial_use_state,
    technical_access_state: candidate.access_state,
    freshness_state: candidate.freshness_state,
    continuity_state: candidate.continuity_state,
    jurisdiction_state: candidate.jurisdiction_state,
    language_state: candidate.language_state,
    verification_state: candidate.verification_state,
    hard_rejection_reasons: hardRejectionReasons,
    checks: {
      candidate_available: true,
      normalized_endpoint_present: Boolean(normalizeUrl(candidate.endpoint_url)),
      exact_collection_scope_assignment: exactScope,
      exact_source_role_assignment: exactRole,
      owner_identity_present: ownerPresent,
      independent_family_key_present: familyPresent,
      official_or_specialist_channel_evidence: officialOrSpecialist,
      explicit_channel_suitability: candidate.explicit_channel_suitability === true,
      decision_and_value_linkage_present_or_lane_derived: decisionValueLinkage,
      rights_state_explicit: rightsExplicit,
      technical_access_state_explicit: technicalExplicit,
      freshness_state_explicit: freshnessExplicit,
      continuity_state_explicit: continuityExplicit,
      jurisdiction_state_explicit: jurisdictionExplicit,
      language_state_explicit: languageExplicit,
      hard_rejection_absent: hardRejectionAbsent
    },
    automated_outcome: outcome,
    provisional_high_authority_candidate: provisionalHighAuthority,
    provisional_high_authority_state: provisionalHighAuthority
      ? "NOT_TRACK_B_VALIDATED_NOT_RIGHTS_CLEARED"
      : "NOT_APPLICABLE",
    qualification_state: "NOT_QUALIFIED",
    rights_cleared: false,
    source_pool_promoted: false,
    acquisition_authorized: false,
    production: "HOLD"
  };
}

function ratio(numerator, denominator) {
  return denominator ? numerator / denominator : null;
}

function maxOwnerConcentration(records) {
  const assigned = records.filter(record => record.source_id);
  if (!assigned.length) return null;
  const counts = new Map();
  for (const record of assigned) counts.set(record.owner, (counts.get(record.owner) ?? 0) + 1);
  return Math.max(...counts.values()) / assigned.length;
}

function buildLaneMetric(laneId, records, contract) {
  const assigned = records.filter(record => record.source_id);
  const provisional = assigned.filter(record => record.provisional_high_authority_candidate);
  const scopeRoleEvidence = assigned.filter(record => record.checks.exact_collection_scope_assignment
    && record.checks.exact_source_role_assignment
    && record.checks.official_or_specialist_channel_evidence
    && record.checks.explicit_channel_suitability
    && record.checks.hard_rejection_absent);
  const uniqueFamilies = unique(assigned.map(record => record.independent_family_key));
  const provisionalFamilies = unique(provisional.map(record => record.independent_family_key));
  const sample = records[0];
  const provisionalCount = provisionalFamilies.length;
  const scopeEvidenceRate = ratio(scopeRoleEvidence.length, assigned.length) ?? 0;
  let nextWavePriority;
  let nextAssessmentTarget;
  if (provisionalCount < contract.next_wave_policy.high_priority_when_provisional_families_below
    || scopeEvidenceRate < 0.25
    || records.some(record => record.automated_outcome === "NO_CANDIDATE_AVAILABLE")) {
    nextWavePriority = "P0_HIGH_RISK_OR_LOW_YIELD";
    nextAssessmentTarget = contract.next_wave_policy.high_risk_or_low_yield_assessment_target;
  } else if (provisionalCount < contract.next_wave_policy.medium_priority_when_provisional_families_below
    || scopeEvidenceRate < 0.5) {
    nextWavePriority = "P1_MEDIUM_YIELD_GAP";
    nextAssessmentTarget = contract.next_wave_policy.medium_additional_assessment_target;
  } else {
    nextWavePriority = "P2_NORMAL_SEQUENTIAL_SAMPLE";
    nextAssessmentTarget = contract.next_wave_policy.normal_additional_assessment_target;
  }

  return {
    lane_id: laneId,
    core_domain_id: sample.core_domain_id,
    collection_scope_id: sample.collection_scope_id,
    source_role: sample.source_role,
    planned_candidate_assessments: records.length,
    assigned_candidate_count: assigned.length,
    unfilled_slot_count: records.length - assigned.length,
    unique_independent_family_count: uniqueFamilies.length,
    provisional_high_authority_family_count: provisionalFamilies.length,
    automated_scope_role_evidence_survival_rate: ratio(scopeRoleEvidence.length, assigned.length),
    owner_lineage_resolution_rate: ratio(assigned.filter(record => record.checks.independent_family_key_present).length, assigned.length),
    rights_state_explicit_rate: ratio(assigned.filter(record => record.checks.rights_state_explicit).length, assigned.length),
    technical_state_explicit_rate: ratio(assigned.filter(record => record.checks.technical_access_state_explicit).length, assigned.length),
    freshness_state_explicit_rate: ratio(assigned.filter(record => record.checks.freshness_state_explicit).length, assigned.length),
    continuity_state_explicit_rate: ratio(assigned.filter(record => record.checks.continuity_state_explicit).length, assigned.length),
    jurisdiction_state_explicit_rate: ratio(assigned.filter(record => record.checks.jurisdiction_state_explicit).length, assigned.length),
    language_state_explicit_rate: ratio(assigned.filter(record => record.checks.language_state_explicit).length, assigned.length),
    provisional_high_authority_survival_rate: ratio(provisionalFamilies.length, uniqueFamilies.length),
    maximum_owner_concentration_in_lane: maxOwnerConcentration(assigned),
    automated_parameter_state: "CALIBRATION_CANDIDATE_REQUIRES_TRACK_B_SAMPLE_VALIDATION",
    next_wave_priority: nextWavePriority,
    next_candidate_assessment_target: nextAssessmentTarget,
    source_pool_promoted: false,
    acquisition_authorized: false,
    production: "HOLD"
  };
}

function buildFamilyRecords(assessments) {
  const map = new Map();
  for (const record of assessments.filter(item => item.independent_family_key)) {
    const current = map.get(record.independent_family_key) ?? {
      independent_family_key: record.independent_family_key,
      owners: new Set(),
      endpoints: new Set(),
      source_ids: new Set(),
      origins: new Set(),
      core_domains: new Set(),
      collection_scopes: new Set(),
      source_roles: new Set(),
      lane_ids: new Set(),
      provisional_high_authority: false,
      rights_states: new Set(),
      technical_states: new Set(),
      jurisdictions: new Set(),
      languages: new Set()
    };
    current.owners.add(record.owner);
    current.endpoints.add(record.endpoint_url);
    current.source_ids.add(record.source_id);
    current.origins.add(record.origin);
    current.core_domains.add(record.core_domain_id);
    current.collection_scopes.add(record.collection_scope_id);
    current.source_roles.add(record.source_role);
    current.lane_ids.add(record.lane_id);
    current.provisional_high_authority ||= record.provisional_high_authority_candidate;
    if (record.rights_state) current.rights_states.add(record.rights_state);
    if (record.technical_access_state) current.technical_states.add(record.technical_access_state);
    if (record.jurisdiction_state) current.jurisdictions.add(record.jurisdiction_state);
    if (record.language_state) current.languages.add(record.language_state);
    map.set(record.independent_family_key, current);
  }
  return [...map.values()].map(record => ({
    independent_family_key: record.independent_family_key,
    owners: [...record.owners].sort(),
    endpoints: [...record.endpoints].sort(),
    source_ids: [...record.source_ids].sort(),
    origins: [...record.origins].sort(),
    core_domains: [...record.core_domains].sort(),
    collection_scopes: [...record.collection_scopes].sort(),
    source_roles: [...record.source_roles].sort(),
    lane_ids: [...record.lane_ids].sort(),
    lane_count: record.lane_ids.size,
    provisional_high_authority_candidate: record.provisional_high_authority,
    rights_states: [...record.rights_states].sort(),
    technical_states: [...record.technical_states].sort(),
    jurisdictions: [...record.jurisdictions].sort(),
    languages: [...record.languages].sort(),
    resolution_state: record.independent_family_key.startsWith("work:") || record.independent_family_key.startsWith("anchor:")
      ? "UNDERLYING_WORK_KEY_AVAILABLE_FINAL_OWNER_LINEAGE_VALIDATION_PENDING"
      : "OWNER_ENDPOINT_PROXY_FINAL_OWNER_LINEAGE_VALIDATION_PENDING",
    trust_qualified: false,
    rights_cleared: false,
    source_pool_promoted: false,
    acquisition_authorized: false,
    production: "HOLD"
  })).sort((a, b) => a.independent_family_key.localeCompare(b.independent_family_key));
}

function countValues(records, selector) {
  const counts = new Map();
  for (const record of records) {
    const value = selector(record);
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

function addFingerprints(outputs) {
  for (const [name, value] of Object.entries(outputs)) {
    if (name === "run-manifest.json") continue;
    value.fingerprint = fingerprint(value);
  }
}

export function executeAsiSufficiencyCalibrationWave001({
  queueInput,
  batchInput,
  precisionInput,
  targetedInput,
  sufficiencyInput
}) {
  const contract = readJson(contractPath);
  const scopes = readJson(scopeRegistryPath);
  const scopeMap = new Map(scopes.records.map(record => [record.scope_id, record]));
  const queue = readJson(findFile(queueInput, "asi-sufficiency-calibration-wave-001-work-queue.json"));
  const batch = readJson(findFile(batchInput, "global-source-universe-batch-001.json"));
  const precision = readJson(findFile(precisionInput, "precision-ranked-universe-v2.json"));
  const targeted = readJson(findFile(targetedInput, "targeted-high-authority-source-candidate-registry-v1.json"));
  const sufficiency = readJson(findFile(sufficiencyInput, "source-sufficiency-calculation-v2.json"));

  const pool = mergeCandidates(
    buildTargetedCandidates(targeted.records),
    buildPrecisionCandidates(precision.records),
    buildBatchCandidates(batch.records)
  );

  const groupedWork = new Map();
  for (const workItem of queue.records) {
    if (!groupedWork.has(workItem.lane_id)) groupedWork.set(workItem.lane_id, []);
    groupedWork.get(workItem.lane_id).push(workItem);
  }

  const assessments = [];
  for (const [laneId, workItems] of [...groupedWork.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const sortedItems = [...workItems].sort((a, b) => a.candidate_ordinal - b.candidate_ordinal);
    const sample = sortedItems[0];
    const selected = laneCandidates(
      pool,
      sample.collection_scope_id,
      sample.source_role,
      contract.queue.candidate_assessments_per_lane
    );
    for (let index = 0; index < sortedItems.length; index += 1) {
      assessments.push(assessCandidate(sortedItems[index], selected[index] ?? null));
    }
  }
  assessments.sort((a, b) => a.work_item_id.localeCompare(b.work_item_id));

  const laneRecords = [...groupedWork.keys()].sort().map(laneId =>
    buildLaneMetric(laneId, assessments.filter(record => record.lane_id === laneId), contract)
  );
  const familyRecords = buildFamilyRecords(assessments);
  const assigned = assessments.filter(record => record.source_id);
  const provisional = assessments.filter(record => record.provisional_high_authority_candidate);
  const outcomeCounts = countValues(assessments, record => record.automated_outcome);
  const rejectionReasonCounts = countValues(
    assessments.flatMap(record => (record.hard_rejection_reasons ?? []).map(reason => ({ reason }))),
    record => record.reason
  );
  const ownerCounts = countValues(familyRecords.flatMap(record => record.owners.map(owner => ({ owner }))), record => record.owner);
  const originCounts = countValues(assigned, record => record.origin);
  const jurisdictionCounts = countValues(assigned, record => knownState(record.jurisdiction_state) ? record.jurisdiction_state : null);
  const languageCounts = countValues(assigned, record => knownState(record.language_state) ? record.language_state : null);
  const topOwnerShare = familyRecords.length && ownerCounts.length ? ownerCounts[0].count / familyRecords.length : null;
  const topOriginShare = assigned.length && originCounts.length ? originCounts[0].count / assigned.length : null;

  const assessmentsOutput = {
    id: "asi-sufficiency-calibration-wave-001-assessments",
    record_type: "autonomous_source_sufficiency_calibration_assessments",
    version: "1.0.0",
    status: "AUTONOMOUS_PREASSESSMENT_COMPLETE_TRACK_B_VALIDATION_REQUIRED",
    generated_at: contract.effective_at,
    contract_id: contract.id,
    wave_id: queue.wave_id,
    input_candidate_pool_size: pool.length,
    work_items_processed: assessments.length,
    scope_role_lanes: laneRecords.length,
    records: assessments,
    review_boundary: contract.review_boundary,
    source_pool_promotions: 0,
    acquisition_authorized: false,
    production: "HOLD"
  };

  const laneOutput = {
    id: "lane-survival-and-yield-v1",
    record_type: "source_lane_survival_and_yield",
    version: "1.0.0",
    status: "AUTOMATED_CALIBRATION_CANDIDATE_COMPLETE",
    generated_at: contract.effective_at,
    lane_count: laneRecords.length,
    records: laneRecords,
    summary: {
      assigned_candidate_count: assigned.length,
      unfilled_slot_count: assessments.length - assigned.length,
      unique_independent_family_count: familyRecords.length,
      provisional_high_authority_family_count: familyRecords.filter(record => record.provisional_high_authority_candidate).length,
      mean_provisional_high_authority_survival_rate: laneRecords.reduce((sum, record) => sum + (record.provisional_high_authority_survival_rate ?? 0), 0) / laneRecords.length,
      high_priority_lanes: laneRecords.filter(record => record.next_wave_priority === "P0_HIGH_RISK_OR_LOW_YIELD").length,
      medium_priority_lanes: laneRecords.filter(record => record.next_wave_priority === "P1_MEDIUM_YIELD_GAP").length,
      normal_priority_lanes: laneRecords.filter(record => record.next_wave_priority === "P2_NORMAL_SEQUENTIAL_SAMPLE").length
    },
    parameter_state: "NOT_OFFICIAL_UNTIL_TRACK_B_SAMPLE_VALIDATION",
    production: "HOLD"
  };

  const familyOutput = {
    id: "source-family-resolution-v1",
    record_type: "source_family_resolution_ledger",
    version: "1.0.0",
    status: "PROVISIONAL_OWNER_LINEAGE_RESOLUTION_COMPLETE_FINAL_VALIDATION_PENDING",
    generated_at: contract.effective_at,
    independent_family_count: familyRecords.length,
    provisional_high_authority_family_count: familyRecords.filter(record => record.provisional_high_authority_candidate).length,
    records: familyRecords,
    duplicate_family_within_lane: 0,
    source_pool_promotions: 0,
    production: "HOLD"
  };

  const diversityOutput = {
    id: "global-diversity-and-concentration-v1",
    record_type: "global_source_diversity_and_concentration",
    version: "1.0.0",
    status: jurisdictionCounts.length || languageCounts.length
      ? "PARTIALLY_MEASURED_GAPS_EXPLICIT"
      : "NOT_MEASURED_REQUIRED_NEXT_WAVE",
    generated_at: contract.effective_at,
    independent_family_count: familyRecords.length,
    core_domains_represented: unique(familyRecords.flatMap(record => record.core_domains)),
    collection_scopes_represented: unique(familyRecords.flatMap(record => record.collection_scopes)),
    source_roles_represented: unique(familyRecords.flatMap(record => record.source_roles)),
    jurisdiction_counts: jurisdictionCounts,
    language_counts: languageCounts,
    owner_counts: ownerCounts,
    origin_counts: originCounts,
    maximum_single_owner_family_share: topOwnerShare,
    maximum_single_origin_assessment_share: topOriginShare,
    required_macro_regions: 6,
    required_countries_or_jurisdictions: 25,
    required_languages: 12,
    macro_regions_measured: null,
    countries_or_jurisdictions_measured: jurisdictionCounts.length,
    languages_measured: languageCounts.length,
    diversity_gate_pass: false,
    source_pool_promotions: 0,
    production: "HOLD"
  };

  const attritionOutput = {
    id: "source-attrition-taxonomy-v1",
    record_type: "source_attrition_taxonomy",
    version: "1.0.0",
    status: "AUTOMATED_PREASSESSMENT_ATTRITION_MEASURED_TRACK_B_VALIDATION_PENDING",
    generated_at: contract.effective_at,
    total_work_items: assessments.length,
    assigned_candidates: assigned.length,
    provisional_high_authority_assessments: provisional.length,
    automated_provisional_survival_rate: ratio(provisional.length, assigned.length),
    automated_provisional_attrition_rate: assigned.length ? 1 - provisional.length / assigned.length : null,
    outcome_counts: outcomeCounts,
    hard_rejection_reason_counts: rejectionReasonCounts,
    caveat: "Rates measure this autonomous candidate pool and ranking policy. They are not official trust, rights, technical or active-evidence survival rates until Track B and preflight validation.",
    source_pool_promotions: 0,
    production: "HOLD"
  };

  const planningAttritionValues = unique(
    sufficiency.baseline.categories.map(record => record.inputs.attrition.total_attrition_rate)
  );
  const empiricalCandidate = {
    id: "source-sufficiency-empirical-calibration-candidate-v1",
    record_type: "source_sufficiency_empirical_calibration_candidate",
    version: "1.0.0",
    status: "CANDIDATE_NOT_APPLIED_TO_OFFICIAL_DRIVER_PROFILE",
    generated_at: contract.effective_at,
    linked_sufficiency_profile_id: sufficiency.profile_id,
    planning_attrition_rates: planningAttritionValues,
    automated_observations: {
      candidate_pool_size: pool.length,
      assigned_candidate_assessments: assigned.length,
      unique_independent_families: familyRecords.length,
      provisional_high_authority_families: familyRecords.filter(record => record.provisional_high_authority_candidate).length,
      automated_provisional_survival_rate: ratio(provisional.length, assigned.length),
      automated_provisional_attrition_rate: assigned.length ? 1 - provisional.length / assigned.length : null,
      mean_channels_per_family_in_assigned_pool: ratio(unique(assigned.map(record => record.endpoint_url)).length, familyRecords.length),
      cross_category_family_reuse_rate: ratio(
        familyRecords.filter(record => record.core_domains.length > 1).length,
        familyRecords.length
      )
    },
    official_profile_update: "BLOCKED_PENDING_TRACK_B_STRATIFIED_SAMPLE_AND_RIGHTS_TECHNICAL_PREFLIGHT",
    required_validation: [
      "TRACK_B_STRATIFIED_SAMPLE",
      "OWNER_LINEAGE_AUDIT",
      "RIGHTS_AND_ACCESS_PREFLIGHT",
      "TECHNICAL_ACCESS_TEST",
      "ACTIVE_EVIDENCE_CONTRIBUTION_MEASUREMENT"
    ],
    source_pool_promotions: 0,
    acquisition_authorized: false,
    production: "HOLD"
  };

  const nextWaveRecords = laneRecords.map(record => {
    const scope = scopeMap.get(record.collection_scope_id);
    return {
      next_work_item_id: `next:${record.lane_id}`,
      parent_wave_id: queue.wave_id,
      lane_id: record.lane_id,
      core_domain_id: record.core_domain_id,
      collection_scope_id: record.collection_scope_id,
      collection_scope_name: scope?.name ?? record.collection_scope_id,
      source_role: record.source_role,
      priority: record.next_wave_priority,
      additional_candidate_assessment_target: record.next_candidate_assessment_target,
      current_unique_families: record.unique_independent_family_count,
      current_provisional_high_authority_families: record.provisional_high_authority_family_count,
      critical_independent_family_floor: contract.next_wave_policy.critical_family_floor_per_lane,
      discovery_mode: "TARGETED_OFFICIAL_SPECIALIST_AND_LOCAL_LANGUAGE",
      broad_generic_discovery: "CLOSED",
      target_languages: GLOBAL_LANGUAGE_TARGETS,
      scope_terms: unique([
        scope?.name,
        scope?.definition,
        ...(scope?.include ?? []),
        ...(scope?.identity_fields ?? [])
      ].filter(Boolean)),
      source_role_discovery_phrases: ROLE_DISCOVERY_PHRASES[record.source_role] ?? [],
      required_evidence: [
        "OFFICIAL_OR_INDEPENDENTLY_VERIFIABLE_ENDPOINT",
        "OWNER_OPERATOR_AND_LINEAGE",
        "EXACT_SCOPE_AND_ROLE_EVIDENCE",
        "DECISION_AND_IRREPLACEABLE_VALUE_LINKAGE",
        "REGION_LANGUAGE_AND_JURISDICTION",
        "RIGHTS_ACCESS_TECHNICAL_FRESHNESS_AND_CONTINUITY"
      ],
      next_gate: "AUTONOMOUS_TARGETED_DISCOVERY_THEN_TRACK_B_RISK_WEIGHTED_SAMPLE",
      source_pool_promotions: 0,
      acquisition_authorized: false,
      production: "HOLD"
    };
  });

  const nextWaveOutput = {
    id: "next-autonomous-source-work-wave-v1",
    record_type: "autonomous_source_next_work_wave",
    version: "1.0.0",
    status: "READY_FOR_TARGETED_AUTONOMOUS_EXECUTION",
    generated_at: contract.effective_at,
    parent_wave_id: queue.wave_id,
    lane_count: nextWaveRecords.length,
    total_additional_candidate_assessment_target: nextWaveRecords.reduce(
      (sum, record) => sum + record.additional_candidate_assessment_target,
      0
    ),
    high_priority_lanes: nextWaveRecords.filter(record => record.priority === "P0_HIGH_RISK_OR_LOW_YIELD").length,
    medium_priority_lanes: nextWaveRecords.filter(record => record.priority === "P1_MEDIUM_YIELD_GAP").length,
    normal_priority_lanes: nextWaveRecords.filter(record => record.priority === "P2_NORMAL_SEQUENTIAL_SAMPLE").length,
    records: nextWaveRecords,
    source_pool_promotions: 0,
    acquisition_authorized: false,
    production: "HOLD"
  };

  const outputs = {
    "asi-sufficiency-calibration-wave-001-assessments.json": assessmentsOutput,
    "lane-survival-and-yield-v1.json": laneOutput,
    "source-family-resolution-v1.json": familyOutput,
    "global-diversity-and-concentration-v1.json": diversityOutput,
    "source-attrition-taxonomy-v1.json": attritionOutput,
    "source-sufficiency-empirical-calibration-candidate-v1.json": empiricalCandidate,
    "next-autonomous-source-work-wave-v1.json": nextWaveOutput
  };
  addFingerprints(outputs);

  const manifest = {
    id: "asi-sufficiency-calibration-wave-001-run-manifest",
    record_type: "autonomous_source_sufficiency_calibration_run",
    version: "1.0.0",
    status: "PASS_AUTONOMOUS_PREASSESSMENT_NEXT_TARGETED_WAVE_READY",
    generated_at: contract.effective_at,
    inputs: {
      contract: { id: contract.id, fingerprint: fingerprint(contract) },
      queue: { id: queue.id, fingerprint: queue.fingerprint },
      batch: { id: batch.id, fingerprint: batch.fingerprint },
      precision: { id: precision.id, fingerprint: precision.fingerprint },
      targeted: { id: targeted.id, fingerprint: targeted.fingerprint },
      sufficiency: { id: sufficiency.id, fingerprint: sufficiency.fingerprint }
    },
    outputs: Object.fromEntries(Object.entries(outputs).map(([name, value]) => [name, value.fingerprint])),
    work_items_processed: assessments.length,
    scope_role_lanes: laneRecords.length,
    candidate_pool_size: pool.length,
    assigned_candidate_assessments: assigned.length,
    explicit_unfilled_slots: assessments.length - assigned.length,
    unique_independent_families: familyRecords.length,
    provisional_high_authority_families: familyRecords.filter(record => record.provisional_high_authority_candidate).length,
    automated_provisional_survival_rate: ratio(provisional.length, assigned.length),
    high_priority_next_wave_lanes: nextWaveOutput.high_priority_lanes,
    medium_priority_next_wave_lanes: nextWaveOutput.medium_priority_lanes,
    normal_priority_next_wave_lanes: nextWaveOutput.normal_priority_lanes,
    next_wave_total_additional_assessments: nextWaveOutput.total_additional_candidate_assessment_target,
    track_b_validation_complete: false,
    official_empirical_profile_updated: false,
    source_pool_promotions: 0,
    acquisition_authorized: false,
    candidate_r2: "BLOCKED",
    indexes_computed: 0,
    production: "HOLD"
  };
  manifest.run_fingerprint = fingerprint(manifest);
  outputs["run-manifest.json"] = manifest;
  return outputs;
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  const outputs = executeAsiSufficiencyCalibrationWave001(config);
  if (config.write) writeJsonDirectory(config.output, outputs);
  const manifest = outputs["run-manifest.json"];
  console.log("KIDULTS ASI Sufficiency Calibration Wave 001: PASS");
  console.log(`Work items / lanes: ${manifest.work_items_processed} / ${manifest.scope_role_lanes}`);
  console.log(`Assigned / unfilled: ${manifest.assigned_candidate_assessments} / ${manifest.explicit_unfilled_slots}`);
  console.log(`Unique families / provisional high-authority families: ${manifest.unique_independent_families} / ${manifest.provisional_high_authority_families}`);
  console.log(`Automated provisional survival: ${manifest.automated_provisional_survival_rate?.toFixed(4) ?? "NOT_MEASURED"}`);
  console.log(`Next wave lanes H/M/N: ${manifest.high_priority_next_wave_lanes} / ${manifest.medium_priority_next_wave_lanes} / ${manifest.normal_priority_next_wave_lanes}`);
  console.log(`Next additional assessments: ${manifest.next_wave_total_additional_assessments}`);
  console.log("Track B validation: INCOMPLETE; Source Pool promotions: 0; Acquisition: BLOCKED; Production: HOLD");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
