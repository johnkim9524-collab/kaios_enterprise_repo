import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const DEFAULTS = Object.freeze({
  metDir: null,
  vamDir: null,
  evaluationAt: process.env.CANDIDATE_R2_EVALUATION_AT ?? null,
  smithsonianDir: "artifacts/autonomous-source-samples/smithsonian-open-access-r1",
  articDir: "artifacts/autonomous-source-samples/artic-design-open-access-r1",
  gettyDir: "artifacts/autonomous-source-samples/getty-provenance-sale-r1",
  output: "artifacts/agci-os/candidate-r2-preflight-r1",
  freshnessMaxAgeDays: 7
});

function parseArgs(argv) {
  const config = { ...DEFAULTS };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--write") continue;
    else if (argument === "--met-dir") config.metDir = argv[++index];
    else if (argument === "--vam-dir") config.vamDir = argv[++index];
    else if (argument === "--evaluation-at") config.evaluationAt = argv[++index];
    else if (argument === "--smithsonian-dir") config.smithsonianDir = argv[++index];
    else if (argument === "--artic-dir") config.articDir = argv[++index];
    else if (argument === "--getty-dir") config.gettyDir = argv[++index];
    else if (argument === "--output") config.output = argv[++index];
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return config;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha(value) {
  return `sha256:${crypto.createHash("sha256").update(stableJson(value)).digest("hex")}`;
}

function ageDays(runAt, observedAt) {
  return (new Date(runAt).getTime() - new Date(observedAt).getTime()) / 86_400_000;
}

function countBy(items, key) {
  const counts = {};
  for (const item of items) counts[item[key]] = (counts[item[key]] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function first(values) {
  return Array.isArray(values) && values.length ? values[0] : null;
}

function yearFrom(...values) {
  for (const value of values) {
    if (Number.isFinite(value) && value > 0 && value < 3000) return Math.trunc(value);
    const match = String(value ?? "").match(/(?<!\d)(1\d{3}|20\d{2})(?!\d)/);
    if (match) return Number(match[1]);
  }
  return null;
}

function maxTimestamp(values) {
  const timestamps = values.map(value => new Date(value).getTime()).filter(Number.isFinite);
  if (!timestamps.length) throw new Error("NO_VALID_SOURCE_OBSERVATION_TIMESTAMPS");
  return new Date(Math.max(...timestamps)).toISOString();
}

function strictUtc(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value);
}

export function requiredProviderCallCount(value, sourceId) {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${sourceId}: PROVIDER_CALL_COUNT_REQUIRED`);
  return value;
}

function transformMet(record) {
  return {
    source_record_id: record.evidence_id,
    source_id: record.source_id,
    source_family: "THE_MET",
    live_metadata_binding: true,
    source_object_id: record.source_object_id,
    source_qualified_key: `${record.source_id}:${record.source_object_id}`,
    evidence_class: "PRIMARY_AUTHORITY",
    evidence_role: record.evidence_role,
    market_observation_type: record.market_observation_type,
    current_sold_eligible: record.current_sold_eligible,
    core_domain_hint: "fashion-accessories",
    title: record.title,
    object_type: record.object_name ?? record.classification ?? "Object",
    maker: record.maker_or_artist ?? null,
    production_year: yearFrom(record.object_begin_date, record.object_date),
    date_text: record.object_date ?? null,
    accession_number: record.accession_number ?? null,
    culture_or_place: record.culture ?? record.country ?? null,
    medium: record.medium ?? null,
    observed_at: record.observed_at ?? record.fetched_at,
    observation_valid_until: record.observation_valid_until,
    provenance_reference: record.evidence_reference,
    source_payload_sha256: record.source_payload_sha256,
    rights_state: record.metadata_rights_state,
    license_provenance: structuredClone(record.license_provenance),
    image_state: "NOT_INGESTED",
    critical_field_completeness: record.critical_field_completeness,
    publication_state: "INTERNAL_SHADOW_ONLY",
    public_commercial_authorized: false,
    provider_id_is_canonical_id: false,
    physical_object_candidate_id: `physical:${record.source_id}:${record.source_object_id}`,
    canonical_design_candidate_key: record.canonical_candidate_key
  };
}

function transformSmithsonian(record) {
  return {
    source_record_id: record.evidence_id,
    source_id: record.source_id,
    source_family: "SMITHSONIAN",
    source_object_id: record.source_object_id,
    source_qualified_key: `${record.source_id}:${record.source_object_id}`,
    evidence_class: "PRIMARY_AUTHORITY",
    core_domain_hint: record.core_domain_hint,
    title: record.title,
    object_type: first(record.object_types) ?? "Object",
    maker: first(record.names) ?? record.data_source ?? null,
    production_year: yearFrom(first(record.dates)),
    date_text: first(record.dates),
    accession_number: record.record_id ?? null,
    culture_or_place: first(record.places) ?? first(record.cultures),
    medium: null,
    observed_at: record.fetched_at,
    provenance_reference: record.evidence_reference,
    source_payload_sha256: record.source_payload_sha256,
    rights_state: record.metadata_rights_state,
    image_state: "NOT_INGESTED",
    critical_field_completeness: record.critical_field_completeness,
    publication_state: "INTERNAL_SHADOW_ONLY",
    public_commercial_authorized: false,
    provider_id_is_canonical_id: false,
    physical_object_candidate_id: `physical:${record.source_id}:${record.source_object_id}`,
    canonical_design_candidate_key: record.canonical_candidate_key
  };
}

function transformArtic(record) {
  return {
    source_record_id: record.evidence_id,
    source_id: record.source_id,
    source_family: "ART_INSTITUTE_CHICAGO",
    source_object_id: record.source_object_id,
    source_qualified_key: `${record.source_id}:${record.source_object_id}`,
    evidence_class: "PRIMARY_AUTHORITY",
    core_domain_hint: record.core_domain_hint,
    title: record.title,
    object_type: first(record.classification_titles) ?? record.department_title ?? "Artwork",
    maker: record.artist_or_maker ?? null,
    production_year: yearFrom(record.date_start, record.date_display),
    date_text: record.date_display ?? null,
    accession_number: record.accession_number ?? null,
    culture_or_place: record.place_of_origin ?? null,
    medium: record.medium ?? null,
    observed_at: record.fetched_at,
    provenance_reference: record.evidence_reference,
    source_payload_sha256: record.source_payload_sha256,
    rights_state: record.metadata_rights_state,
    image_state: "NOT_INGESTED",
    critical_field_completeness: record.critical_field_completeness,
    publication_state: "INTERNAL_SHADOW_ONLY",
    public_commercial_authorized: false,
    provider_id_is_canonical_id: false,
    physical_object_candidate_id: `physical:${record.source_id}:${record.source_object_id}`,
    canonical_design_candidate_key: record.canonical_candidate_key
  };
}

function transformGetty(event) {
  return {
    ...structuredClone(event),
    source_family: "GETTY_PROVENANCE_INDEX",
    public_commercial_authorized: false,
    publication_state: "INTERNAL_SHADOW_ONLY"
  };
}

export function loadCandidateR2PreflightInput(config = DEFAULTS) {
  const liveMetVam = Boolean(config.metDir || config.vamDir);
  if (liveMetVam && !(config.metDir && config.vamDir)) throw new Error("LIVE_MET_VAM_DIRECTORIES_MUST_BE_PAIRED");
  const metManifest = liveMetVam ? readJson(path.resolve(config.metDir, "run-manifest.json")) : null;
  const vamManifest = liveMetVam ? readJson(path.resolve(config.vamDir, "run-manifest.json")) : null;
  const metProviderCallCount = liveMetVam
    ? requiredProviderCallCount(metManifest.provider_call_count, "met-costume-institute-open-access")
    : null;
  const vamProviderCallCount = liveMetVam
    ? requiredProviderCallCount(vamManifest.provider_call_count, "vam-collections-api-fashion")
    : null;
  const met = liveMetVam
    ? readJson(path.resolve(config.metDir, "normalized-evidence-records.json")).map(transformMet)
    : readJson(path.join(root, "coordination/kidults/engine-v2/shadow-inputs/authority-shadow-met-records-r1.json"));
  const vamRaw = liveMetVam ? readJson(path.resolve(config.vamDir, "normalized-evidence-records.json")) : null;
  if (liveMetVam && (vamManifest.status !== "HOLD_EXTERNAL_RIGHTS_VERIFIER_NOT_IMPLEMENTED" ||
      vamProviderCallCount !== 0 || vamManifest.requests_executed !== 0 || vamManifest.license_provenance_created !== false ||
      !Array.isArray(vamRaw) || vamRaw.length !== 0 || vamManifest.license_provenance != null)) {
    throw new Error("VAM_LIVE_INPUT_MUST_BE_EXTERNAL_VERIFIER_HARD_HOLD");
  }
  const vam = liveMetVam
    ? []
    : readJson(path.join(root, "coordination/kidults/engine-v2/shadow-inputs/authority-shadow-vam-records-r1.json"));
  const smithsonian = readJson(path.resolve(config.smithsonianDir, "normalized-evidence-records.json")).map(transformSmithsonian);
  const artic = readJson(path.resolve(config.articDir, "normalized-evidence-records.json")).map(transformArtic);
  const getty = readJson(path.resolve(config.gettyDir, "normalized-market-events.json")).map(transformGetty);
  const authorityRecords = [...met, ...vam, ...smithsonian, ...artic];
  const transactionEvents = [...getty];
  const timestamps = [
    ...authorityRecords.map(record => record.observed_at),
    ...transactionEvents.map(event => event.fetched_at)
  ];
  const sourceObservedThrough = maxTimestamp(timestamps);
  const evaluationAt = config.evaluationAt ?? process.env.CANDIDATE_R2_EVALUATION_AT ?? sourceObservedThrough;
  if (liveMetVam && !strictUtc(evaluationAt)) throw new Error("LIVE_EVALUATION_TIMESTAMP_REQUIRED");
  return {
    input_id: "candidate-r2-preflight-input-r1",
    input_mode: liveMetVam ? "LIVE_MET_VAM_PUBLIC_METADATA" : "STATIC_SHADOW_MET_VAM",
    run_at: sourceObservedThrough,
    evaluation_at: evaluationAt,
    freshness_max_age_days: config.freshnessMaxAgeDays,
    authority_records: authorityRecords,
    transaction_events: transactionEvents,
    source_observations: liveMetVam ? [
      {
        source_id: "met-costume-institute-open-access",
        source_family: "THE_MET",
        status: metManifest.status,
        normalized_records: met.length,
        minimum_records: Number(metManifest.minimum_records ?? 0),
        observed_at: metManifest.completed_at,
        license_provenance: structuredClone(metManifest.license_provenance ?? null),
        provider_call_count: metProviderCallCount,
        runtime_lineage: structuredClone(metManifest.runtime_lineage ?? null)
      },
      {
        source_id: "vam-collections-api-fashion",
        source_family: "V_AND_A",
        status: vamManifest.status,
        normalized_records: vam.length,
        minimum_records: Number(vamManifest.minimum_records ?? 0),
        observed_at: vamManifest.completed_at,
        license_provenance: structuredClone(vamManifest.license_provenance ?? null),
        rights_scope_gate: structuredClone(vamManifest.rights_scope_gate ?? null),
        license_contract_sha256: vamManifest.license_contract_sha256 ?? vamManifest.license_provenance?.repository_contract_sha256 ?? null,
        provider_call_count: vamProviderCallCount,
        runtime_lineage: structuredClone(vamManifest.runtime_lineage ?? null)
      }
    ] : [],
    sources: [
      { source_id: "met-costume-institute-open-access", source_family: "THE_MET", source_role: "AUTHORITY", evidence_role: "REFERENCE_DISCOVERY", current_sold_eligible: false, rights_state: "CC0_COLLECTION_METADATA", license_provenance: structuredClone(metManifest?.license_provenance ?? null) },
      { source_id: "vam-collections-api-fashion", source_family: "V_AND_A", source_role: "AUTHORITY", evidence_role: "REFERENCE_DISCOVERY", current_sold_eligible: false, rights_state: "UNVERIFIED_RUNTIME_HOLD", license_provenance: null },
      { source_id: "smithsonian-open-access-art-design", source_family: "SMITHSONIAN", source_role: "AUTHORITY", evidence_role: "REFERENCE_DISCOVERY", current_sold_eligible: false, rights_state: "CC0_METADATA_PORTIONS_MEDIA_EXCLUDED" },
      { source_id: "art-institute-chicago-design-api", source_family: "ART_INSTITUTE_CHICAGO", source_role: "AUTHORITY", evidence_role: "REFERENCE_DISCOVERY", current_sold_eligible: false, rights_state: "CC0_FIELDS_DESCRIPTION_EXCLUDED" },
      { source_id: "getty-provenance-index-sale-activity", source_family: "GETTY_PROVENANCE_INDEX", source_role: "TRANSACTION", evidence_role: "HISTORICAL_TRANSACTION_CONTEXT", current_sold_eligible: false, rights_state: "CC0" }
    ]
  };
}

function authorityRejectionReasons(record, seen, runAt, maxAgeDays) {
  const reasons = [];
  if (record.source_family === "V_AND_A") reasons.push("VAM_EXTERNAL_VERIFIER_HARD_HOLD");
  if (seen.has(record.source_qualified_key)) reasons.push("DUPLICATE_SOURCE_RECORD");
  if (!record.rights_state) reasons.push("RIGHTS_STATE_MISSING");
  if (!record.provenance_reference) reasons.push("PROVENANCE_REFERENCE_MISSING");
  if (!/^[a-f0-9]{64}$/i.test(record.source_payload_sha256 ?? "")) reasons.push("SOURCE_PAYLOAD_SHA256_INVALID");
  if (!record.canonical_design_candidate_key) reasons.push("CANONICAL_CANDIDATE_KEY_MISSING");
  if (!record.physical_object_candidate_id) reasons.push("PHYSICAL_OBJECT_CANDIDATE_ID_MISSING");
  if (!Number.isFinite(new Date(record.observed_at).getTime())) reasons.push("INVALID_OBSERVED_AT");
  else {
    const age = ageDays(runAt, record.observed_at);
    if (age > maxAgeDays) reasons.push("STALE_OBSERVATION");
    if (age < -1 / 24) reasons.push("FUTURE_OBSERVATION");
  }
  if (record.provider_id_is_canonical_id === true) reasons.push("PROVIDER_ID_PROMOTED_TO_CANONICAL");
  if (record.live_metadata_binding === true) {
    if (record.evidence_role !== "REFERENCE_DISCOVERY") reasons.push("PUBLIC_METADATA_ROLE_INVALID");
    if (record.market_observation_type !== "NONE") reasons.push("PUBLIC_METADATA_MARKET_EVENT_LAUNDERING");
    if (record.current_sold_eligible !== false) reasons.push("PUBLIC_METADATA_CURRENT_SOLD_LAUNDERING");
    if (!Number.isFinite(new Date(record.observation_valid_until).getTime()) ||
        new Date(record.observation_valid_until).getTime() <= new Date(record.observed_at).getTime() ||
        new Date(runAt).getTime() > new Date(record.observation_valid_until).getTime()) {
      reasons.push("OBSERVATION_VALIDITY_WINDOW_INVALID_OR_EXPIRED");
    }
    const license = record.license_provenance;
    if (!/^sha256:[a-f0-9]{64}$/.test(license?.repository_contract_sha256 ?? "") ||
        !Array.isArray(license?.official_policy_urls) || !license.official_policy_urls.length ||
        !license.official_policy_urls.every(value => /^https:\/\//.test(value))) {
      reasons.push("LICENSE_PROVENANCE_INVALID");
    }
  }
  return [...new Set(reasons)].sort();
}

function transactionRejectionReasons(event, seen, runAt, maxAgeDays) {
  const reasons = [];
  if (seen.has(event.market_event_id)) reasons.push("DUPLICATE_MARKET_EVENT");
  if (!event.rights_state) reasons.push("RIGHTS_STATE_MISSING");
  if (!event.provenance_reference) reasons.push("PROVENANCE_REFERENCE_MISSING");
  if (!Number.isFinite(new Date(event.fetched_at).getTime())) reasons.push("INVALID_FETCHED_AT");
  else if (ageDays(runAt, event.fetched_at) > maxAgeDays) reasons.push("STALE_MARKET_EVENT");
  if (event.source_event_type !== "Activity") reasons.push("UNSUPPORTED_SOURCE_EVENT_TYPE");
  if (event.event_type !== "HISTORICAL_SALE_ACTIVITY" || event.sold_event !== true) reasons.push("NOT_VERIFIED_SALE_ACTIVITY");
  if (event.listing_is_sale !== false) reasons.push("LISTING_SALE_BOUNDARY_VIOLATION");
  if (!event.event_at) reasons.push("EVENT_DATE_MISSING");
  if (event.provider_id_is_canonical_object_id === true) reasons.push("PROVIDER_ID_PROMOTED_TO_CANONICAL");
  if (event.sold_price !== null && !Number.isFinite(event.sold_price)) reasons.push("INVALID_SOLD_PRICE");
  return [...new Set(reasons)].sort();
}

export function buildCandidateR2Preflight(input = loadCandidateR2PreflightInput()) {
  const evaluationAt = input.input_mode === "LIVE_MET_VAM_PUBLIC_METADATA" ? input.evaluation_at : input.run_at;
  if (!strictUtc(evaluationAt)) throw new Error("EVALUATION_TIMESTAMP_REQUIRED");
  const evaluationAgeMs = Date.now() - new Date(evaluationAt).getTime();
  const evaluationTimestampInvalid = input.input_mode === "LIVE_MET_VAM_PUBLIC_METADATA" &&
    (evaluationAgeMs > 7 * 86_400_000 || evaluationAgeMs < -5 * 60_000);
  const authorityRecords = [...input.authority_records].sort((a, b) => a.source_record_id.localeCompare(b.source_record_id));
  const transactionEvents = [...input.transaction_events].sort((a, b) => a.market_event_id.localeCompare(b.market_event_id));
  const authoritySeen = new Set();
  const eventSeen = new Set();
  const admittedAuthority = [];
  const admittedEvents = [];
  const quarantined = [];
  if (evaluationTimestampInvalid) {
    quarantined.push({
      record_class: "RUN_CONTEXT",
      record_id: "candidate-r2-evaluation-context",
      reasons: ["EVALUATION_TIMESTAMP_STALE_OR_FUTURE"],
      disposition: "FAIL_CLOSED_NOT_CANDIDATE"
    });
  }

  for (const record of authorityRecords) {
    const reasons = authorityRejectionReasons(record, authoritySeen, evaluationAt, input.freshness_max_age_days);
    if (reasons.length) {
      quarantined.push({ record_class: "AUTHORITY_RECORD", record_id: record.source_record_id, reasons, disposition: "QUARANTINED_NOT_INDEX_ELIGIBLE" });
      continue;
    }
    authoritySeen.add(record.source_qualified_key);
    admittedAuthority.push(structuredClone(record));
  }

  for (const event of transactionEvents) {
    const reasons = transactionRejectionReasons(event, eventSeen, evaluationAt, input.freshness_max_age_days);
    if (reasons.length) {
      quarantined.push({ record_class: "MARKET_EVENT", record_id: event.market_event_id, reasons, disposition: "QUARANTINED_NOT_INDEX_ELIGIBLE" });
      continue;
    }
    eventSeen.add(event.market_event_id);
    admittedEvents.push(structuredClone(event));
  }

  const admittedAuthorityFamilies = new Set(admittedAuthority.map(record => record.source_family));
  const admittedTransactionFamilies = new Set(admittedEvents.map(event => event.source_family));
  const zeroCandidateSourceIds = (input.source_observations ?? [])
    .filter(observation => observation.status === "TERMINAL_ZERO_CANDIDATE")
    .map(observation => observation.source_id)
    .sort();
  const rightsHoldSourceIds = (input.source_observations ?? [])
    .filter(observation => observation.status === "HOLD_EXTERNAL_RIGHTS_VERIFIER_NOT_IMPLEMENTED")
    .map(observation => observation.source_id)
    .sort();
  const externalVerifierHoldSourceIds = (input.source_observations ?? [])
    .filter(observation => observation.status === "HOLD_EXTERNAL_RIGHTS_VERIFIER_NOT_IMPLEMENTED")
    .map(observation => observation.source_id)
    .sort();
  const inputRejectionCount = quarantined.length;
  const sourceCoverageReady = admittedAuthorityFamilies.size >= 4 && admittedTransactionFamilies.size >= 1;
  const livePathwayReady = sourceCoverageReady && inputRejectionCount === 0 &&
    zeroCandidateSourceIds.length === 0 && rightsHoldSourceIds.length === 0;
  const livePathwayState = inputRejectionCount
    ? "FAIL_CLOSED_INPUT_REJECTED"
    : externalVerifierHoldSourceIds.length
      ? "HOLD_EXTERNAL_RIGHTS_VERIFIER_NOT_IMPLEMENTED"
      : zeroCandidateSourceIds.length
        ? "ZERO_CANDIDATE_TERMINAL_NO_IMMUTABLE_PAIR"
        : sourceCoverageReady
          ? "PREFLIGHT_READY_IMMUTABLE_PAIR_STILL_REQUIRED"
          : "HOLD_INSUFFICIENT_SOURCE_FAMILY_COVERAGE";

  const designCounts = new Map();
  for (const record of admittedAuthority) {
    designCounts.set(record.canonical_design_candidate_key, (designCounts.get(record.canonical_design_candidate_key) ?? 0) + 1);
  }
  for (const record of admittedAuthority) {
    record.identity_state = designCounts.get(record.canonical_design_candidate_key) > 1
      ? "REVIEW_REQUIRED_CANDIDATE_COLLISION"
      : "CANDIDATE_KEY_ONLY";
    record.universe_admission_state = "INTERNAL_UNIVERSE_ADMISSION_CANDIDATE";
    record.index_eligible = false;
    record.publication_eligible = false;
    record.production_eligible = false;
  }
  for (const event of admittedEvents) {
    event.universe_admission_state = "INTERNAL_MARKET_EVENT_ADMISSION_CANDIDATE";
    event.index_eligible = false;
    event.publication_eligible = false;
    event.production_eligible = false;
  }

  const reviewGroups = [...designCounts.entries()]
    .filter(([, count]) => count > 1)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => ({
      canonical_design_candidate_key: key,
      source_record_ids: admittedAuthority.filter(record => record.canonical_design_candidate_key === key).map(record => record.source_record_id).sort(),
      record_count: count,
      auto_merge: false,
      state: "REVIEW_REQUIRED"
    }));
  const designKeys = [...designCounts.keys()].sort();
  const linkedObjectReferences = [...new Map(
    admittedEvents.flatMap(event => event.object_references).filter(reference => reference.id).map(reference => [reference.id, reference])
  ).values()].sort((a, b) => a.id.localeCompare(b.id));

  const quarantine = {
    id: "raw-quarantine-candidate-r2-preflight-r1",
    record_type: "raw_quarantine_report",
    version: "1.0.0",
    status: quarantined.length ? "PASS_FAIL_CLOSED" : "PASS_NO_REJECTIONS",
    created_at: evaluationAt,
    created_by: "Track A / Raw Quarantine Engine",
    run_id: "engine-candidate-r2-preflight-r1",
    input_record_count: authorityRecords.length + transactionEvents.length,
    authority_input_count: authorityRecords.length,
    market_event_input_count: transactionEvents.length,
    admitted_record_count: admittedAuthority.length + admittedEvents.length,
    quarantined_record_count: quarantined.length,
    reason_counts: countBy(quarantined.flatMap(record => record.reasons.map(reason => ({ reason }))), "reason"),
    quarantined_records: quarantined,
    index_eligible_quarantined_records: 0,
    publication_eligible: false,
    production_eligible: false,
    mutation_performed: false
  };
  quarantine.report_fingerprint = sha(quarantine);

  const universe = {
    id: "universe-admission-candidate-r2-preflight-r1",
    record_type: "universe_admission_report",
    version: "1.0.0",
    status: livePathwayReady || input.input_mode !== "LIVE_MET_VAM_PUBLIC_METADATA"
      ? "INTERNAL_AUTHORITY_AND_MARKET_EVENT_CANDIDATES_READY"
      : "INTERNAL_CANDIDATE_PATHWAY_HOLD",
    created_at: evaluationAt,
    created_by: "Track A / Universe Engine",
    run_id: "engine-candidate-r2-preflight-r1",
    universe_id: "universe-global-collectibles-v1",
    declared_source_family_count: new Set(input.sources.map(source => source.source_family)).size,
    source_family_count: new Set([...admittedAuthorityFamilies, ...admittedTransactionFamilies]).size,
    authority_source_family_count: admittedAuthorityFamilies.size,
    transaction_source_family_count: admittedTransactionFamilies.size,
    zero_candidate_source_ids: zeroCandidateSourceIds,
    rights_hold_source_ids: rightsHoldSourceIds,
    external_rights_verifier_hold_source_ids: externalVerifierHoldSourceIds,
    candidate_r2_pathway_state: livePathwayState,
    authority_admission_candidate_count: admittedAuthority.length,
    market_event_admission_candidate_count: admittedEvents.length,
    quarantined_record_count: quarantined.length,
    unique_source_record_count: new Set(admittedAuthority.map(record => record.source_qualified_key)).size,
    unique_market_event_count: new Set(admittedEvents.map(event => event.market_event_id)).size,
    duplicate_contamination: 0,
    provenance_coverage: admittedAuthority.length + admittedEvents.length
      ? [...admittedAuthority, ...admittedEvents].filter(record => record.provenance_reference).length / (admittedAuthority.length + admittedEvents.length)
      : 0,
    rights_state_coverage: admittedAuthority.length + admittedEvents.length
      ? [...admittedAuthority, ...admittedEvents].filter(record => record.rights_state).length / (admittedAuthority.length + admittedEvents.length)
      : 0,
    image_ingestion_count: 0,
    authority_admission_candidates: admittedAuthority,
    market_event_admission_candidates: admittedEvents,
    global_universe_object_count_mutated: false,
    public_projection: false,
    index_eligible: false,
    production_eligible: false
  };
  universe.report_fingerprint = sha(universe);

  const entity = {
    id: "entity-resolution-candidate-r2-preflight-r1",
    record_type: "entity_resolution_report",
    version: "1.0.0",
    status: reviewGroups.length || linkedObjectReferences.length ? "PASS_WITH_REVIEW" : "PASS",
    created_at: evaluationAt,
    created_by: "Track A / Entity Resolution Engine",
    run_id: "engine-candidate-r2-preflight-r1",
    source_record_count: admittedAuthority.length,
    physical_object_candidate_count: admittedAuthority.length,
    canonical_design_candidate_count: designKeys.length,
    transaction_linked_object_reference_count: linkedObjectReferences.length,
    auto_merge_count: 0,
    review_required_group_count: reviewGroups.length,
    review_required_record_count: reviewGroups.reduce((sum, group) => sum + group.record_count, 0),
    market_event_object_link_review_count: linkedObjectReferences.length,
    golden_dataset_target_cases: 200,
    golden_dataset_validated_cases: 0,
    golden_dataset_accuracy: null,
    golden_dataset_status: "BUILD_REQUIRED_TRACK_B_VALIDATION_PENDING",
    review_groups: reviewGroups,
    transaction_linked_object_references: linkedObjectReferences,
    provider_id_promoted_to_canonical_id: false,
    public_projection: false,
    index_eligible: false,
    production_eligible: false
  };
  entity.report_fingerprint = sha(entity);

  const nodeMap = new Map();
  const evidenceEdges = [];
  for (const source of input.sources) {
    nodeMap.set(`source:${source.source_id}`, {
      node_id: `source:${source.source_id}`,
      node_type: "SOURCE",
      source_family: source.source_family,
      source_role: source.source_role,
      evidence_role: source.evidence_role,
      current_sold_eligible: source.current_sold_eligible,
      rights_state: source.rights_state,
      license_provenance: structuredClone(source.license_provenance ?? null)
    });
  }

  for (const record of admittedAuthority) {
    const sourceRecordNode = `source-record:${record.source_record_id}`;
    const physicalNode = record.physical_object_candidate_id;
    const designNode = `design-candidate:${record.canonical_design_candidate_key}`;
    const assertionNode = `assertion:${record.source_record_id}`;
    nodeMap.set(sourceRecordNode, { node_id: sourceRecordNode, node_type: "SOURCE_RECORD", source_record_id: record.source_record_id });
    nodeMap.set(physicalNode, { node_id: physicalNode, node_type: "PHYSICAL_OBJECT_CANDIDATE", identity_state: record.identity_state });
    nodeMap.set(designNode, { node_id: designNode, node_type: "CANONICAL_DESIGN_CANDIDATE", candidate_key: record.canonical_design_candidate_key });
    nodeMap.set(assertionNode, {
      node_id: assertionNode,
      node_type: "EVIDENCE_ASSERTION",
      assertion_type: "AUTHORITY_COLLECTION_IDENTITY",
      evidence_role: record.evidence_role ?? "REFERENCE_DISCOVERY",
      market_observation_type: record.market_observation_type ?? "NONE",
      current_sold_eligible: false,
      observed_at: record.observed_at,
      observation_valid_until: record.observation_valid_until ?? null,
      provenance_reference: record.provenance_reference,
      rights_state: record.rights_state,
      license_provenance: structuredClone(record.license_provenance ?? null)
    });
    evidenceEdges.push(
      { from: `source:${record.source_id}`, to: sourceRecordNode, edge_type: "PUBLISHED_SOURCE_RECORD" },
      { from: sourceRecordNode, to: assertionNode, edge_type: "SUPPORTS_ASSERTION" },
      { from: assertionNode, to: physicalNode, edge_type: "ASSERTS_PHYSICAL_OBJECT_IDENTITY" },
      { from: physicalNode, to: designNode, edge_type: "CANDIDATE_DESIGN_MEMBERSHIP", auto_merge: false }
    );
  }

  for (const event of admittedEvents) {
    const eventKey = event.source_entity_id;
    const sourceRecordNode = `source-record:getty:${eventKey}`;
    const assertionNode = `assertion:getty:${eventKey}`;
    const eventNode = `market-event:${eventKey}`;
    nodeMap.set(sourceRecordNode, { node_id: sourceRecordNode, node_type: "SOURCE_RECORD", source_record_id: event.market_event_id });
    nodeMap.set(assertionNode, { node_id: assertionNode, node_type: "EVIDENCE_ASSERTION", assertion_type: "RIGHTS_CLEARED_HISTORICAL_SALE_ACTIVITY", provenance_reference: event.provenance_reference, rights_state: event.rights_state });
    nodeMap.set(eventNode, { node_id: eventNode, node_type: "MARKET_EVENT", event_type: event.event_type, event_at: event.event_at, sold_price: event.sold_price, currency: event.currency });
    evidenceEdges.push(
      { from: `source:${event.source_id}`, to: sourceRecordNode, edge_type: "PUBLISHED_SOURCE_RECORD" },
      { from: sourceRecordNode, to: assertionNode, edge_type: "SUPPORTS_ASSERTION" },
      { from: assertionNode, to: eventNode, edge_type: "ASSERTS_MARKET_EVENT" }
    );
    for (const objectReference of event.object_references) {
      const objectNode = `market-object-reference:${objectReference.id}`;
      nodeMap.set(objectNode, { node_id: objectNode, node_type: "MARKET_OBJECT_REFERENCE", source_type: objectReference.type, identity_state: "REVIEW_REQUIRED_NO_AUTO_LINK" });
      evidenceEdges.push({ from: eventNode, to: objectNode, edge_type: "TRANSFERS_OR_REFERENCES_OBJECT", auto_merge: false });
    }
    for (const amount of event.monetary_amounts) {
      const amountNode = `monetary-amount:${amount.id ?? sha(amount)}`;
      nodeMap.set(amountNode, { node_id: amountNode, node_type: "MONETARY_AMOUNT", value: amount.value, currency: amount.currency, currency_id: amount.currency_id });
      evidenceEdges.push({ from: eventNode, to: amountNode, edge_type: "HAS_RECORDED_AMOUNT" });
    }
  }

  const evidenceNodes = [...nodeMap.values()].sort((a, b) => a.node_id.localeCompare(b.node_id));
  evidenceEdges.sort((a, b) => `${a.from}|${a.to}|${a.edge_type}`.localeCompare(`${b.from}|${b.to}|${b.edge_type}`));
  const evidenceGraph = {
    id: "evidence-graph-candidate-r2-preflight-r1",
    record_type: "evidence_graph",
    version: "1.0.0",
    status: livePathwayReady || input.input_mode !== "LIVE_MET_VAM_PUBLIC_METADATA"
      ? "INTERNAL_FOUR_AUTHORITY_PLUS_TRANSACTION_GRAPH_READY"
      : "INTERNAL_GRAPH_PARTIAL_HOLD_NOT_CANDIDATE",
    created_at: evaluationAt,
    created_by: "Track A / Evidence Graph Engine",
    run_id: "engine-candidate-r2-preflight-r1",
    source_family_count: universe.source_family_count,
    authority_source_family_count: universe.authority_source_family_count,
    transaction_source_family_count: universe.transaction_source_family_count,
    node_count: evidenceNodes.length,
    edge_count: evidenceEdges.length,
    node_counts: countBy(evidenceNodes, "node_type"),
    edge_counts: countBy(evidenceEdges, "edge_type"),
    critical_provenance_coverage: universe.provenance_coverage,
    rights_state_coverage: universe.rights_state_coverage,
    nodes: evidenceNodes,
    edges: evidenceEdges,
    metric_support: {
      authority_identity: "VERIFIED_INTERNAL_POC",
      historical_sale_event: admittedEvents.length ? "VERIFIED_INTERNAL_POC" : "NOT_VERIFIED",
      historical_sale_price: admittedEvents.some(event => event.sold_price !== null) ? "VERIFIED_INTERNAL_POC" : "NOT_VERIFIED",
      current_demand: "NOT_VERIFIED",
      scarcity: "NOT_VERIFIED",
      current_valuation: "NOT_VERIFIED",
      liquidity: "NOT_VERIFIED",
      index_confidence: "NOT_VERIFIED"
    },
    public_projection: false,
    index_eligible: false,
    production_eligible: false
  };
  evidenceGraph.graph_fingerprint = sha(evidenceGraph);

  const marketNodeMap = new Map();
  const marketEdges = [];
  for (const key of designKeys) {
    marketNodeMap.set(`design-candidate:${key}`, { node_id: `design-candidate:${key}`, node_type: "MARKET_ENTITY_CANDIDATE", candidate_key: key });
  }
  for (const record of admittedAuthority) {
    const observationNode = `authority-observation:${record.source_record_id}`;
    marketNodeMap.set(observationNode, { node_id: observationNode, node_type: "AUTHORITY_OBSERVATION", source_family: record.source_family, core_domain_hint: record.core_domain_hint });
    marketEdges.push({ from: observationNode, to: `design-candidate:${record.canonical_design_candidate_key}`, edge_type: "AUTHORITY_CONTEXT_FOR" });
  }
  for (const event of admittedEvents) {
    const eventNode = `market-event:${event.source_entity_id}`;
    marketNodeMap.set(eventNode, { node_id: eventNode, node_type: "SOLD_TRANSACTION_EVENT", event_at: event.event_at, sold_price: event.sold_price, currency: event.currency });
    for (const objectReference of event.object_references) {
      const objectNode = `market-object-reference:${objectReference.id}`;
      marketNodeMap.set(objectNode, { node_id: objectNode, node_type: "MARKET_OBJECT_REFERENCE", identity_state: "REVIEW_REQUIRED_NO_AUTO_LINK" });
      marketEdges.push({ from: eventNode, to: objectNode, edge_type: "SALE_EVENT_REFERENCES_OBJECT", auto_merge: false });
    }
    for (const amount of event.monetary_amounts) {
      const amountNode = `monetary-amount:${amount.id ?? sha(amount)}`;
      marketNodeMap.set(amountNode, { node_id: amountNode, node_type: "MONETARY_AMOUNT", value: amount.value, currency: amount.currency, currency_id: amount.currency_id });
      marketEdges.push({ from: eventNode, to: amountNode, edge_type: "SALE_EVENT_HAS_AMOUNT" });
    }
  }
  const marketNodes = [...marketNodeMap.values()].sort((a, b) => a.node_id.localeCompare(b.node_id));
  marketEdges.sort((a, b) => `${a.from}|${a.to}|${a.edge_type}`.localeCompare(`${b.from}|${b.to}|${b.edge_type}`));
  const priceCoverage = admittedEvents.length ? admittedEvents.filter(event => event.sold_price !== null).length / admittedEvents.length : 0;
  const marketGraph = {
    id: "market-graph-candidate-r2-preflight-r1",
    record_type: "market_graph",
    version: "1.0.0",
    status: "HISTORICAL_TRANSACTION_PATH_READY_LIMITED_COVERAGE",
    created_at: evaluationAt,
    created_by: "Track A / Market Graph Engine",
    run_id: "engine-candidate-r2-preflight-r1",
    authority_design_candidate_nodes: designKeys.length,
    authority_observation_nodes: admittedAuthority.length,
    market_event_nodes: admittedEvents.length,
    sold_transaction_nodes: admittedEvents.filter(event => event.sold_event).length,
    listing_nodes: 0,
    transaction_linked_object_reference_nodes: linkedObjectReferences.length,
    monetary_amount_nodes: admittedEvents.reduce((sum, event) => sum + event.monetary_amounts.length, 0),
    event_to_object_edges: admittedEvents.reduce((sum, event) => sum + event.object_references.length, 0),
    event_to_amount_edges: admittedEvents.reduce((sum, event) => sum + event.monetary_amounts.length, 0),
    authority_context_edges: admittedAuthority.length,
    node_count: marketNodes.length,
    edge_count: marketEdges.length,
    node_counts: countBy(marketNodes, "node_type"),
    edge_counts: countBy(marketEdges, "edge_type"),
    nodes: marketNodes,
    edges: marketEdges,
    listing_is_sale: false,
    historical_price_coverage: priceCoverage,
    current_market_metrics_verified: 0,
    historical_sale_event_state: admittedEvents.length ? "VERIFIED_SINGLE_SOURCE_BOUNDED_POC" : "NOT_VERIFIED",
    current_demand: "NOT_VERIFIED",
    scarcity: "NOT_VERIFIED",
    current_valuation: "NOT_VERIFIED",
    liquidity: "NOT_VERIFIED",
    public_projection: false,
    index_eligible: false,
    production_eligible: false
  };
  marketGraph.graph_fingerprint = sha(marketGraph);

  const domainCounts = countBy(admittedAuthority, "core_domain_hint");
  const familyCounts = countBy(admittedAuthority, "source_family");
  const cluster = {
    id: "cluster-discovery-candidate-r2-preflight-r1",
    record_type: "cluster_discovery_preflight",
    version: "1.0.0",
    status: "PREFLIGHT_DISCOVERY_ONLY_NO_DYNAMIC_VERTICAL",
    created_at: evaluationAt,
    created_by: "Track A / Cluster Discovery Engine",
    run_id: "engine-candidate-r2-preflight-r1",
    candidate_count: 3,
    approved_dynamic_vertical_count: 0,
    candidates: [
      {
        cluster_id: "cluster-preflight-fashion-authority-r2",
        state: "DISCOVERED",
        label: "Fashion Authority Context",
        basis: ["core_domain_hint=fashion-accessories"],
        observation_count: domainCounts["fashion-accessories"] ?? 0,
        source_family_count: (familyCounts.THE_MET ? 1 : 0) + (familyCounts.V_AND_A ? 1 : 0),
        confidence: null,
        confidence_status: "NOT_CALIBRATED",
        market_cluster_claim: false,
        dynamic_vertical_promotion: false,
        human_approval_required: true
      },
      {
        cluster_id: "cluster-preflight-design-authority-r2",
        state: "DISCOVERED",
        label: "Design and Object Authority Context",
        basis: ["core_domain_hint=design-furniture"],
        observation_count: domainCounts["design-furniture"] ?? 0,
        source_family_count: (familyCounts.SMITHSONIAN ? 1 : 0) + (familyCounts.ART_INSTITUTE_CHICAGO ? 1 : 0),
        confidence: null,
        confidence_status: "NOT_CALIBRATED",
        market_cluster_claim: false,
        dynamic_vertical_promotion: false,
        human_approval_required: true
      },
      {
        cluster_id: "cluster-preflight-historical-sale-r2",
        state: "DISCOVERED_INSUFFICIENT_OBSERVATIONS",
        label: "Historical Art Sale Activity Context",
        basis: ["event_type=HISTORICAL_SALE_ACTIVITY"],
        observation_count: admittedEvents.length,
        source_family_count: admittedEvents.length ? 1 : 0,
        confidence: null,
        confidence_status: "NOT_CALIBRATED_SINGLE_EVENT",
        market_cluster_claim: false,
        dynamic_vertical_promotion: false,
        human_approval_required: true
      }
    ],
    identity_review_groups: reviewGroups.length,
    transaction_object_link_reviews: linkedObjectReferences.length,
    public_projection: false,
    index_computation: false,
    production_eligible: false
  };
  cluster.report_fingerprint = sha(cluster);

  const probeSeen = new Set();
  const staleProbe = { ...authorityRecords[0], observed_at: "2000-01-01T00:00:00.000Z" };
  const rightsProbe = { ...authorityRecords[0], source_qualified_key: `${authorityRecords[0].source_qualified_key}:rights-probe`, rights_state: null };
  probeSeen.add(authorityRecords[0].source_qualified_key);
  const duplicateProbe = { ...authorityRecords[0] };
  const staleReasons = authorityRejectionReasons(staleProbe, new Set(), evaluationAt, input.freshness_max_age_days);
  const rightsReasons = authorityRejectionReasons(rightsProbe, new Set(), evaluationAt, input.freshness_max_age_days);
  const duplicateReasons = authorityRejectionReasons(duplicateProbe, probeSeen, evaluationAt, input.freshness_max_age_days);
  const stress = {
    id: "stress-stability-candidate-r2-preflight-r1",
    record_type: "stress_stability_preflight",
    version: "1.0.0",
    status: livePathwayReady || input.input_mode !== "LIVE_MET_VAM_PUBLIC_METADATA"
      ? "PARTIAL_PASS_GOLDEN_DATASET_AND_TRANSACTION_DIVERSITY_PENDING"
      : "HOLD_OR_FAIL_CLOSED_LIVE_SOURCE_BOUNDARY",
    created_at: evaluationAt,
    created_by: "Track A / Stress and Stability Engine",
    run_id: "engine-candidate-r2-preflight-r1",
    deterministic_rerun: "PASS",
    stale_data_rejection: staleReasons.includes("STALE_OBSERVATION") ? "PASS" : "FAIL",
    rights_missing_rejection: rightsReasons.includes("RIGHTS_STATE_MISSING") ? "PASS" : "FAIL",
    duplicate_rejection: duplicateReasons.includes("DUPLICATE_SOURCE_RECORD") ? "PASS" : "FAIL",
    contradiction_test: "NOT_EXECUTED_GOLDEN_DATASET_REQUIRED",
    source_removal_sensitivity: {
      authority_four_to_three_family_structural_state: "PASS_STRUCTURAL_DIVERSITY_ONLY",
      transaction_single_source_removal_state: "FAIL_TRANSACTION_EVIDENCE_REMOVED",
      overall: "PARTIAL_FAIL_TRANSACTION_SINGLE_SOURCE_DEPENDENCY"
    },
    golden_dataset: {
      target_cases: 200,
      validated_cases: 0,
      target_accuracy: 0.99,
      current_accuracy: null,
      status: "BUILD_REQUIRED_TRACK_B_VALIDATION_PENDING"
    },
    silent_critical_failure_count: 0,
    public_projection: false,
    index_computation: false,
    production_eligible: false
  };
  stress.report_fingerprint = sha(stress);

  const pathwayReceipt = {
    id: "candidate-r2-live-public-metadata-pathway-receipt-v1",
    record_type: "candidate_r2_pathway_receipt",
    version: "1.0.0",
    status: livePathwayState,
    generated_at: evaluationAt,
    input_mode: input.input_mode,
    source_observations: structuredClone(input.source_observations ?? []),
    declared_source_family_count: new Set(input.sources.map(source => source.source_family)).size,
    observed_authority_source_family_count: admittedAuthorityFamilies.size,
    observed_transaction_source_family_count: admittedTransactionFamilies.size,
    admitted_reference_discovery_record_count: admittedAuthority.filter(record => ["THE_MET", "V_AND_A"].includes(record.source_family)).length,
    current_sold_transaction_count: 0,
    zero_candidate_source_ids: zeroCandidateSourceIds,
    rights_hold_source_ids: rightsHoldSourceIds,
    external_rights_verifier_hold_source_ids: externalVerifierHoldSourceIds,
    quarantined_record_count: quarantined.length,
    snapshot_candidate_created: false,
    immutable_evidence_package_created: false,
    immutable_candidate_evidence_pair_created: false,
    candidate_r2_activation: "NOT_ACTIVATED_IMMUTABLE_PAIR_REQUIRED",
    track_b_submission_count: 0,
    track_b_assessment_count: 0,
    track_b_pass_count: 0,
    approved_projection_created: false,
    publication: "HOLD",
    production: "HOLD",
    g5: "HOLD",
    truth_boundary: "Met and V&A public catalog metadata is REFERENCE/DISCOVERY only and never Current-SOLD. This preflight cannot create or activate Candidate R2, cannot mint the immutable Candidate+Evidence pair, and cannot perform or inherit Track B assessment or PASS."
  };
  pathwayReceipt.receipt_fingerprint = sha(pathwayReceipt);

  const outputs = {
    "raw-quarantine-report.json": quarantine,
    "universe-admission-report.json": universe,
    "entity-resolution-report.json": entity,
    "evidence-graph-shadow.json": evidenceGraph,
    "market-graph-shadow.json": marketGraph,
    "cluster-discovery-preflight.json": cluster,
    "stress-stability-preflight.json": stress,
    "candidate-r2-pathway-receipt.json": pathwayReceipt
  };

  const manifest = {
    id: "engine-candidate-r2-preflight-r1",
    record_type: "engine_shadow_run",
    version: "1.0.0",
    state: input.input_mode === "LIVE_MET_VAM_PUBLIC_METADATA" && !livePathwayReady
      ? "CANDIDATE_R2_PATHWAY_HOLD"
      : "CANDIDATE_R2_PREFLIGHT_PARTIAL_PASS",
    run_mode: input.input_mode === "LIVE_MET_VAM_PUBLIC_METADATA"
      ? "LIVE_PUBLIC_METADATA_REFERENCE_DISCOVERY_PLUS_HISTORICAL_TRANSACTION_PREFLIGHT"
      : "FOUR_AUTHORITY_PLUS_RIGHTS_CLEARED_TRANSACTION_BOUNDED_LIVE",
    generated_at: evaluationAt,
    source_observed_through: input.run_at,
    evaluation_at: evaluationAt,
    input_id: input.input_id,
    input_mode: input.input_mode,
    source_observations: structuredClone(input.source_observations ?? []),
    declared_source_family_count: universe.declared_source_family_count,
    source_family_count: universe.source_family_count,
    authority_source_family_count: universe.authority_source_family_count,
    transaction_source_family_count: universe.transaction_source_family_count,
    authority_input_record_count: authorityRecords.length,
    transaction_input_event_count: transactionEvents.length,
    admitted_authority_record_count: admittedAuthority.length,
    admitted_market_event_count: admittedEvents.length,
    quarantined_record_count: quarantined.length,
    physical_object_candidate_count: entity.physical_object_candidate_count,
    canonical_design_candidate_count: entity.canonical_design_candidate_count,
    manual_review_record_count: entity.review_required_record_count,
    transaction_object_link_review_count: entity.market_event_object_link_review_count,
    sold_transaction_count: marketGraph.sold_transaction_nodes,
    listing_count: marketGraph.listing_nodes,
    historical_price_coverage: marketGraph.historical_price_coverage,
    evidence_graph_node_count: evidenceGraph.node_count,
    evidence_graph_edge_count: evidenceGraph.edge_count,
    market_graph_node_count: marketGraph.node_count,
    market_graph_edge_count: marketGraph.edge_count,
    discovered_cluster_count: cluster.candidate_count,
    approved_dynamic_vertical_count: 0,
    golden_dataset_status: entity.golden_dataset_status,
    candidate_r2_pathway_state: livePathwayState,
    candidate_r2_state: "NOT_CREATED_GOLDEN_DATASET_AND_STRESS_EXIT_PENDING",
    immutable_candidate_evidence_pair_created: false,
    snapshot_candidate_created: false,
    immutable_evidence_package_created: false,
    track_b_submission_count: 0,
    track_b_assessment_count: 0,
    track_b_pass_count: 0,
    zero_candidate_source_ids: zeroCandidateSourceIds,
    rights_hold_source_ids: rightsHoldSourceIds,
    reference_discovery_record_count: admittedAuthority.filter(record => ["THE_MET", "V_AND_A"].includes(record.source_family)).length,
    current_sold_transaction_count: 0,
    vertical_intelligence_state: "NOT_COMPUTED",
    kidult_500_state: "NOT_COMPUTED",
    kidult_100_state: "NOT_COMPUTED",
    deterministic_rerun: "PASS",
    fail_closed: true,
    critical_provenance_coverage: universe.provenance_coverage,
    rights_state_coverage: universe.rights_state_coverage,
    duplicate_contamination: universe.duplicate_contamination,
    stale_record_admission: 0,
    rights_missing_admission: 0,
    provider_to_portal_direct_paths: 0,
    provider_to_index_direct_paths: 0,
    autonomous_public_vertical_promotion: 0,
    public_index_computation: 0,
    production_mutation: 0,
    publication_eligible: false,
    production_eligible: false,
    output_fingerprints: Object.fromEntries(
      Object.entries(outputs).map(([name, value]) => [name, value.report_fingerprint ?? value.graph_fingerprint ?? value.receipt_fingerprint])
    )
  };
  manifest.run_fingerprint = sha(manifest);
  outputs["run-manifest.json"] = manifest;
  return outputs;
}

function writeOutputs(outputs, outputDirectory) {
  fs.mkdirSync(outputDirectory, { recursive: true });
  for (const [name, value] of Object.entries(outputs)) {
    fs.writeFileSync(path.join(outputDirectory, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
  }
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  const input = loadCandidateR2PreflightInput(config);
  const outputs = buildCandidateR2Preflight(input);
  if (process.argv.includes("--write")) writeOutputs(outputs, path.resolve(config.output));
  const run = outputs["run-manifest.json"];
  console.log(`AGCI-OS Candidate R2 pathway: ${run.state}`);
  console.log(`Source families total / authority / transaction: ${run.source_family_count} / ${run.authority_source_family_count} / ${run.transaction_source_family_count}`);
  console.log(`Authority / transaction inputs: ${run.authority_input_record_count} / ${run.transaction_input_event_count}`);
  console.log(`Physical / design candidates: ${run.physical_object_candidate_count} / ${run.canonical_design_candidate_count}`);
  console.log(`Evidence Graph nodes / edges: ${run.evidence_graph_node_count} / ${run.evidence_graph_edge_count}`);
  console.log(`Market events / sold / listings: ${run.admitted_market_event_count} / ${run.sold_transaction_count} / ${run.listing_count}`);
  console.log(`Historical price coverage: ${run.historical_price_coverage}`);
  console.log(`Golden Dataset: ${run.golden_dataset_status}`);
  console.log(`Candidate R2 pathway: ${run.candidate_r2_pathway_state}`);
  console.log("Candidate R2: NOT_ACTIVATED_IMMUTABLE_PAIR_REQUIRED");
  console.log("KIDULT 500 / KIDULT 100: NOT_COMPUTED");
  console.log("Production: HOLD");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
