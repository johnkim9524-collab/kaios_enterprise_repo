import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  fingerprint,
  loadGlobalPoolR1Inputs,
  validateGlobalPoolR1Inputs
} from "./compile-global-pool-r1-frontier-v1.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../../..");
const defaultContractPath = path.join(
  repositoryRoot,
  "coordination/kidults/source-intelligence/global-pool-r1-frontier-seed-channel-contract-v1.json"
);
const CONTEXT_CHANNEL_MARKERS = ["MUSEUM", "INSTITUTIONAL"];
const MARKET_CORE_ROLES = new Set(["LISTING_SUPPLY", "SOLD_TRANSACTION", "AUTHENTICATION_CONDITION"]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function sortedUnique(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashId(prefix, value, length = 32) {
  return `${prefix}-${crypto.createHash("sha256").update(value).digest("hex").slice(0, length)}`;
}

function sha256(value) {
  return `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
}

function resolveInput(contractPath, inputPath) {
  const repositoryPath = path.resolve(repositoryRoot, inputPath);
  if (fs.existsSync(repositoryPath)) return repositoryPath;
  return path.resolve(path.dirname(contractPath), inputPath);
}

function parsePsv(file, expectedHeader, delimiter) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(line => line.trim().length > 0);
  assert(lines.length > 1, "Bootstrap PSV must contain a header and records.");
  const header = lines.shift().split(delimiter).map(value => value.trim());
  assert(stableJson(header) === stableJson(expectedHeader), "Bootstrap PSV header does not match its source contract.");
  return lines.map((line, index) => {
    const values = line.split(delimiter);
    assert(values.length === header.length, `Bootstrap PSV row ${index + 2} has ${values.length} fields; expected ${header.length}.`);
    return Object.fromEntries(header.map((key, field) => [key, values[field].trim()]));
  });
}

export function normalizeRegisteredEndpoint(rawUrl) {
  try {
    const url = new URL(rawUrl.trim());
    if (!new Set(["http:", "https:"]).has(url.protocol)) return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
    if (!host || host === "localhost" || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(":")) return null;
    return {
      canonical_host: host,
      canonical_host_hash: sha256(host),
      registered_endpoint_url: url.href,
      registered_origin: `${url.protocol}//${host}`
    };
  } catch {
    return null;
  }
}

export function loadGlobalPoolR1BootstrapInputs(contractPath = defaultContractPath) {
  const core = loadGlobalPoolR1Inputs(contractPath);
  const sourceContractPath = resolveInput(contractPath, core.contract.canonical_inputs.bootstrap_source_contract);
  const sourceRecordsPath = resolveInput(contractPath, core.contract.canonical_inputs.bootstrap_source_records);
  const scopeCrosswalkPath = resolveInput(contractPath, core.contract.canonical_inputs.scope_v1_to_v2_crosswalk);
  const sourceContract = readJson(sourceContractPath);
  const sourceRecords = parsePsv(sourceRecordsPath, sourceContract.row_schema, sourceContract.delimiter);
  const scopeCrosswalk = readJson(scopeCrosswalkPath);
  const eventSchemaPath = resolveInput(contractPath, core.marketFunnelMesh.event_contract.schema);
  return {
    ...core,
    sourceContract,
    sourceRecords,
    scopeCrosswalk,
    eventSchema: readJson(eventSchemaPath),
    sourceRecordsRepoPath: core.contract.canonical_inputs.bootstrap_source_records,
    sourceContractRepoPath: core.contract.canonical_inputs.bootstrap_source_contract,
    scopeCrosswalkRepoPath: core.contract.canonical_inputs.scope_v1_to_v2_crosswalk
  };
}

function isContextRecord(row) {
  return CONTEXT_CHANNEL_MARKERS.some(marker => row.channel_type.includes(marker));
}

function splitList(value) {
  return sortedUnique(value.split(";").map(item => item.trim()));
}

function mapCandidateRoles(originalRoles, canonicalRoles, contextOnly, contextAllowedRoles) {
  const mapped = new Set();
  const supplemental = [];
  const transformations = [];
  for (const role of originalRoles) {
    if (canonicalRoles.has(role)) mapped.add(role);
    else if (role === "AUCTION_PRIVATE_SALE") {
      mapped.add("SOLD_TRANSACTION");
      transformations.push({
        input_role: role,
        candidate_role: "SOLD_TRANSACTION",
        mapping_state: "CANDIDATE_SEMANTIC_BINDING_ONLY",
        terminal_transaction_asserted: false
      });
    } else if (role === "INDEPENDENT_VERIFICATION") {
      supplemental.push(role);
      transformations.push({
        input_role: role,
        candidate_role: null,
        mapping_state: "SUPPLEMENTAL_HINT_ONLY_NO_AUTOMATIC_CANONICAL_SUBSTITUTION"
      });
    } else {
      supplemental.push(role);
      transformations.push({ input_role: role, candidate_role: null, mapping_state: "UNMAPPED_SUPPLEMENTAL_HINT" });
    }
  }

  const excludedForContext = [];
  if (contextOnly) {
    for (const role of [...mapped]) {
      if (!contextAllowedRoles.has(role)) {
        mapped.delete(role);
        excludedForContext.push(role);
      }
    }
  }
  return {
    candidateRoles: [...mapped].sort(),
    supplementalRoles: supplemental.sort(),
    roleTransformations: transformations.sort((left, right) => left.input_role.localeCompare(right.input_role)),
    excludedForContext: excludedForContext.sort()
  };
}

export function validateGlobalPoolR1BootstrapInputs(inputs) {
  validateGlobalPoolR1Inputs(inputs);
  const {
    contract,
    sourceContract,
    sourceRecords,
    scopeCrosswalk,
    scopeRegistry,
    globalSourceUniverse,
    marketFunnelMesh,
    eventSchema
  } = inputs;
  const bootstrap = contract.bootstrap_capture ?? {};
  const canonicalScopeIds = new Set(scopeRegistry.scopes.map(scope => scope.scope_id));
  const canonicalRoles = new Set(globalSourceUniverse.required_source_roles.map(role => role.role));
  const crosswalkLegacyIds = new Set(scopeCrosswalk.records.map(record => record.legacy_scope_id));
  const crosswalkTargetIds = new Set(scopeCrosswalk.records.flatMap(record => record.target_scope_ids));
  const discoveryStage = marketFunnelMesh.asi_funnel.stages.find(stage => stage.stage_id === "F0_GLOBAL_MARKET_SENSING");
  const eventTypes = new Set(eventSchema.properties?.event_type?.enum ?? []);
  const discoveryChannel = globalSourceUniverse.discovery_channel_families.find(
    channel => channel.channel_id === bootstrap.discovery_channel_id
  );
  const bootstrapContext = bootstrap.museum_or_institutional_context ?? {};

  assert(sourceContract.targets?.candidate_count === 64, "Bootstrap contract must declare the 64 registered endpoint records in its PSV.");
  assert(sourceRecords.length === sourceContract.targets.candidate_count, "Bootstrap PSV row count does not match its source contract.");
  assert(new Set(sourceRecords.map(row => row.source_id)).size === sourceRecords.length, "Bootstrap source IDs must be unique after trimming.");
  assert(scopeCrosswalk.coverage_expectations?.legacy_records_covered === 32, "Scope crosswalk must cover all 32 legacy Scopes.");
  assert(scopeCrosswalk.coverage_expectations?.current_targets_covered === 32, "Scope crosswalk must cover all 32 current Scopes.");
  assert([...crosswalkTargetIds].every(scopeId => canonicalScopeIds.has(scopeId)), "Scope crosswalk emits a non-canonical target Scope.");
  assert(crosswalkTargetIds.size === canonicalScopeIds.size, "Scope crosswalk does not cover the complete current Scope registry.");
  assert(canonicalRoles.size === 7, "Bootstrap role mapping requires the canonical seven source roles.");
  assert(bootstrap.input_state === "REGISTERED_ENDPOINT_CANDIDATE_NOT_LIVE_VERIFIED", "Bootstrap endpoints must not be represented as live-verified.");
  assert(bootstrap.event_type === "SOURCE_DISCOVERY_REQUESTED", "Bootstrap must emit SOURCE_DISCOVERY_REQUESTED events.");
  assert(eventTypes.has(bootstrap.event_type), "ASI event schema does not accept SOURCE_DISCOVERY_REQUESTED.");
  assert(discoveryStage.engine_fleets.includes(bootstrap.processor_fleet_id), "Bootstrap target processor is not registered in F0.");
  assert(discoveryChannel, "Bootstrap discovery channel is not registered in the Global Source Universe.");
  assert(bootstrap.endpoint_url_rights_effect === "NONE", "Registered endpoint URLs must not clear rights.");
  assert(bootstrap.target_site_traversal_authorized === false, "Bootstrap target-site traversal must remain blocked.");
  assert(bootstrap.capture_state === "CANDIDATE_CAPTURE_PENDING", "Bootstrap candidates must begin capture-pending.");
  assert(bootstrap.source_pool_state === "NOT_ELIGIBLE", "Bootstrap candidates cannot enter the source pool.");
  assert(bootstrap.acquisition_authorized === false, "Bootstrap candidates cannot authorize acquisition.");
  assert(bootstrap.public_projection === false && bootstrap.production === "HOLD", "Bootstrap must remain SHADOW on Production HOLD.");
  assert(
    bootstrap.role_mapping?.AUCTION_PRIVATE_SALE === "SOLD_TRANSACTION_CANDIDATE_BINDING_ONLY_TERMINAL_EVENT_NOT_ASSERTED",
    "Auction/private-sale mapping must remain candidate-only and cannot assert a terminal transaction."
  );
  assert(
    bootstrap.role_mapping?.INDEPENDENT_VERIFICATION === "SUPPLEMENTAL_ROLE_HINT_ONLY_NO_AUTOMATIC_CANONICAL_ROLE_SUBSTITUTION",
    "Independent Verification must not be silently substituted for a canonical role."
  );
  assert(
    Array.isArray(bootstrapContext.allowed_candidate_roles) &&
      bootstrapContext.allowed_candidate_roles.every(role => canonicalRoles.has(role) && !MARKET_CORE_ROLES.has(role)),
    "Museum/institutional allowed roles must not contain a core market-event role."
  );
  assert(
    Array.isArray(bootstrapContext.forbidden_candidate_roles) &&
      bootstrapContext.forbidden_candidate_roles.length === MARKET_CORE_ROLES.size &&
      [...MARKET_CORE_ROLES].every(role => bootstrapContext.forbidden_candidate_roles.includes(role)),
    "Museum/institutional boundary must forbid every core market role."
  );
  assert(
    bootstrapContext.market_event_claim_authorized === false &&
      bootstrapContext.demand_or_liquidity_claim_authorized === false,
    "Museum/institutional context cannot authorize market-event, demand, or liquidity claims."
  );

  for (const [index, row] of sourceRecords.entries()) {
    assert(row.source_id.length > 0 && row.display_name.length > 0, `Bootstrap row ${index + 1} is missing identity fields.`);
    assert(normalizeRegisteredEndpoint(row.official_endpoint), `Bootstrap row ${row.source_id} has an invalid public HTTP(S) endpoint.`);
    assert(normalizeRegisteredEndpoint(row.official_documentation_url), `Bootstrap row ${row.source_id} has an invalid public HTTP(S) documentation URL.`);
    const scopes = splitList(row.collection_scope_ids);
    assert(scopes.length > 0 && scopes.every(scope => crosswalkLegacyIds.has(scope)), `${row.source_id}: unknown legacy Scope binding.`);
    assert(splitList(row.source_roles).length > 0, `${row.source_id}: missing candidate source role.`);
  }
}

function sourceRecordFingerprint(record) {
  const { record_fingerprint: ignored, ...unsigned } = record;
  return fingerprint(unsigned);
}

function siteFingerprint(record) {
  const { site_fingerprint: ignored, ...unsigned } = record;
  return fingerprint(unsigned);
}

function outputFingerprint(output) {
  const { bootstrap_fingerprint: ignored, ...unsigned } = output;
  return fingerprint(unsigned);
}

function eventForBinding(record, scopeId, role, inputs, snapshotRef) {
  const { contract, sourceRecordsRepoPath, scopeCrosswalkRepoPath } = inputs;
  const bootstrap = contract.bootstrap_capture;
  const tuple = `${record.source_record_id}|${record.site_id}|${scopeId}|${role}`;
  const sourceBindingTuple = [
    record.site_id,
    'DISCOVERY_METADATA_INDEX',
    bootstrap.discovery_channel_id,
    bootstrap.region_before_observation,
    bootstrap.language_before_observation,
    scopeId,
    role,
    record.canonical_host_hash,
  ].join('|');
  const sourceBindingId = hashId('source-binding',sourceBindingTuple,40);
  const reasonCodes = [
    "BOOTSTRAP_REGISTERED_ENDPOINT_NOT_LIVE_VERIFIED",
    "CANDIDATE_CAPTURE_PENDING",
    "DISCOVERY_CHANNEL_RIGHTS_UNKNOWN",
    "REGION_LANGUAGE_NOT_OBSERVED",
    "SCOPE_ROLE_BINDING_CANDIDATE_ONLY"
  ];
  if (record.context_only) reasonCodes.push("MUSEUM_OR_INSTITUTIONAL_CONTEXT_NOT_MARKET_EVENT");
  if (record.role_transformations.some(mapping => mapping.input_role === "AUCTION_PRIVATE_SALE")) {
    reasonCodes.push("AUCTION_PRIVATE_SALE_MAPPED_TO_SOLD_CANDIDATE_TERMINAL_EVENT_NOT_ASSERTED");
  }
  const payload = {
    source_id: sourceBindingId,
    purpose: "DISCOVERY_METADATA_INDEX",
    capture_state: bootstrap.capture_state,
    source_pool_state: bootstrap.source_pool_state,
    source_record_id: record.source_record_id,
    candidate_scope_id: scopeId,
    candidate_source_role: role,
    scope_role_binding_state: "CANDIDATE_PENDING_CLASSIFICATION",
    context_only: record.context_only,
    discovery_seed: {
      source_id: sourceBindingId,
      canonical_site_id: record.site_id,
      seed_ref: `repo:${sourceRecordsRepoPath}#${record.source_record_id}`,
      provenance_ref: `repo:${sourceRecordsRepoPath}#${record.source_record_id}`,
      crosswalk_ref: `repo:${scopeCrosswalkRepoPath}`,
      canonical_host: record.canonical_host,
      registered_endpoint_url: record.registered_endpoint_url,
      registered_documentation_url: record.registered_documentation_url,
      endpoint_registration_state: "REGISTERED_ENDPOINT_CANDIDATE_NOT_LIVE_VERIFIED",
      discovery_rights_state: "UNKNOWN",
      source_locator_rights_effect: "NONE",
      target_site_traversal_authorized: false,
      original_scope_ids: record.original_scope_ids,
      candidate_scope_ids: record.candidate_scope_ids,
      original_source_roles: record.original_source_roles,
      candidate_source_roles: record.candidate_source_roles,
      supplemental_role_hints: record.supplemental_role_hints,
      channel_type: record.channel_type,
      access_mode: record.access_mode,
      authority_basis: record.authority_basis,
      context_only: record.context_only,
      market_event_claim_authorized: false,
      acquisition_authorized: false,
      public_projection_authorized: false,
      production_authorized: false
    },
    acquisition_authorized: false,
    public_projection_authorized: false,
    production_authorized: false
  };
  const payloadHash = fingerprint(payload);
  const eventHash = sha256(`${tuple}|${payloadHash}|${snapshotRef}`);
  const suffix = eventHash.slice("sha256:".length, "sha256:".length + 32);
  return {
    event_id: `evt_${suffix}`,
    event_type: bootstrap.event_type,
    event_version: "1.0.0",
    occurred_at: inputs.bootstrapObservedAt,
    observed_at: inputs.bootstrapObservedAt,
    producer_engine: "GLOBAL_POOL_R1_BOOTSTRAP_CAPTURE_COMPILER",
    producer_version: "1.0.0",
    correlation_id: `corr_${record.site_id}`,
    causation_id: null,
    idempotency_key: `asi:global-pool-r1:${hashId("binding", tuple, 40)}`,
    partition: {
      channel: bootstrap.discovery_channel_id,
      region: bootstrap.region_before_observation,
      language: bootstrap.language_before_observation,
      scope_id: scopeId,
      source_role: role,
      canonical_host_hash: record.canonical_host_hash
    },
    input_snapshot_ref: snapshotRef,
    payload_hash: payloadHash,
    rights_state: "UNKNOWN",
    freshness_state: "UNKNOWN",
    assertion_purpose: "DISCOVERY_METADATA_INDEX",
    decision: "HOLD",
    reason_codes: reasonCodes.sort(),
    trace_refs: [
      `repo:${sourceRecordsRepoPath}#${record.source_record_id}`,
      `repo:${scopeCrosswalkRepoPath}`
    ].sort(),
    payload
  };
}

export function compileGlobalPoolR1BootstrapCapture(inputs = loadGlobalPoolR1BootstrapInputs()) {
  validateGlobalPoolR1BootstrapInputs(inputs);
  const {
    contract,
    sourceContract,
    sourceRecords,
    scopeCrosswalk,
    scopeRegistry,
    globalSourceUniverse,
    marketFunnelMesh,
    purposeAdmissionPolicy,
    sourcePoolReadiness,
    eventSchema
  } = inputs;
  const bootstrapObservedAt = new Date(sourceContract.effective_at).toISOString();
  inputs.bootstrapObservedAt = bootstrapObservedAt;
  const canonicalRoles = new Set(globalSourceUniverse.required_source_roles.map(role => role.role));
  const contextAllowedRoles = new Set(contract.bootstrap_capture.museum_or_institutional_context.allowed_candidate_roles);
  const crosswalkByLegacy = new Map(scopeCrosswalk.records.map(record => [record.legacy_scope_id, record]));
  const scopeById = new Map(scopeRegistry.scopes.map(scope => [scope.scope_id, scope]));
  const inputFingerprints = {
    frontier_contract: fingerprint(contract),
    bootstrap_source_contract: fingerprint(sourceContract),
    bootstrap_source_records: fingerprint(sourceRecords),
    scope_crosswalk: fingerprint(scopeCrosswalk),
    current_scope_registry: fingerprint(scopeRegistry),
    global_source_universe: fingerprint(globalSourceUniverse),
    market_funnel_mesh: fingerprint(marketFunnelMesh),
    purpose_admission_policy: fingerprint(purposeAdmissionPolicy),
    source_pool_readiness: fingerprint(sourcePoolReadiness),
    event_schema: fingerprint(eventSchema)
  };
  const inputSnapshotRef = fingerprint(inputFingerprints);

  const records = sourceRecords.map(row => {
    const normalized = normalizeRegisteredEndpoint(row.official_endpoint);
    const documentation = normalizeRegisteredEndpoint(row.official_documentation_url);
    const originalScopes = splitList(row.collection_scope_ids);
    const scopeMappings = originalScopes.map(legacyScopeId => {
      const mapping = crosswalkByLegacy.get(legacyScopeId);
      return {
        legacy_scope_id: legacyScopeId,
        migration_type: mapping.migration_type,
        candidate_scope_ids: [...mapping.target_scope_ids].sort()
      };
    });
    const candidateScopes = sortedUnique(scopeMappings.flatMap(mapping => mapping.candidate_scope_ids));
    assert(candidateScopes.every(scopeId => scopeById.has(scopeId)), `${row.source_id}: crosswalk emitted an unknown current Scope.`);
    const originalRoles = splitList(row.source_roles);
    const contextOnly = isContextRecord(row);
    const mappedRoles = mapCandidateRoles(originalRoles, canonicalRoles, contextOnly, contextAllowedRoles);
    assert(mappedRoles.candidateRoles.length > 0, `${row.source_id}: no canonical candidate role remains after fail-closed mapping.`);
    assert(
      !contextOnly || mappedRoles.candidateRoles.every(role => contextAllowedRoles.has(role) && !MARKET_CORE_ROLES.has(role)),
      `${row.source_id}: museum/institutional context escaped into a market role.`
    );
    const record = {
      source_record_id: row.source_id,
      display_name: row.display_name,
      site_id: hashId("site", normalized.canonical_host),
      canonical_host: normalized.canonical_host,
      canonical_host_hash: normalized.canonical_host_hash,
      registered_endpoint_url: normalized.registered_endpoint_url,
      registered_documentation_url: documentation.registered_endpoint_url,
      endpoint_registration_state: contract.bootstrap_capture.input_state,
      original_scope_ids: originalScopes,
      scope_mappings: scopeMappings,
      candidate_scope_ids: candidateScopes,
      scope_binding_state: "CANDIDATE_PENDING_CLASSIFICATION",
      original_source_roles: originalRoles,
      candidate_source_roles: mappedRoles.candidateRoles,
      supplemental_role_hints: mappedRoles.supplementalRoles,
      role_transformations: mappedRoles.roleTransformations,
      roles_excluded_by_context_boundary: mappedRoles.excludedForContext,
      role_binding_state: "CANDIDATE_PENDING_MARKET_SEMANTICS_CLASSIFICATION",
      core_domain_hint: row.core_domain,
      authority_basis: row.authority_basis,
      channel_type: row.channel_type,
      access_mode: row.access_mode,
      context_only: contextOnly,
      capture_state: contract.bootstrap_capture.capture_state,
      rights_state: "UNKNOWN",
      freshness_state: "UNKNOWN",
      source_pool_state: "NOT_ELIGIBLE",
      terminal_transaction_asserted: false,
      market_event_claim_authorized: false,
      acquisition_authorized: false,
      commercial_use_authorized: false,
      public_projection: false,
      production: "HOLD"
    };
    record.record_fingerprint = sourceRecordFingerprint(record);
    return record;
  }).sort((left, right) => left.source_record_id.localeCompare(right.source_record_id));

  const sitesByHost = new Map();
  for (const record of records) {
    const site = sitesByHost.get(record.canonical_host) ?? {
      site_id: record.site_id,
      canonical_host: record.canonical_host,
      canonical_host_hash: record.canonical_host_hash,
      registered_endpoint_urls: new Set(),
      registered_documentation_urls: new Set(),
      source_record_ids: new Set(),
      candidate_scope_ids: new Set(),
      candidate_source_roles: new Set(),
      has_context_records: false,
      has_non_context_records: false
    };
    site.registered_endpoint_urls.add(record.registered_endpoint_url);
    site.registered_documentation_urls.add(record.registered_documentation_url);
    site.source_record_ids.add(record.source_record_id);
    record.candidate_scope_ids.forEach(scopeId => site.candidate_scope_ids.add(scopeId));
    record.candidate_source_roles.forEach(role => site.candidate_source_roles.add(role));
    site.has_context_records ||= record.context_only;
    site.has_non_context_records ||= !record.context_only;
    sitesByHost.set(record.canonical_host, site);
  }

  const sites = [...sitesByHost.values()].map(value => {
    const site = {
      site_id: value.site_id,
      canonical_host: value.canonical_host,
      canonical_host_hash: value.canonical_host_hash,
      registered_endpoint_urls: [...value.registered_endpoint_urls].sort(),
      registered_documentation_urls: [...value.registered_documentation_urls].sort(),
      source_record_ids: [...value.source_record_ids].sort(),
      candidate_scope_ids: [...value.candidate_scope_ids].sort(),
      candidate_source_roles: [...value.candidate_source_roles].sort(),
      context_only: value.has_context_records && !value.has_non_context_records,
      endpoint_registration_state: contract.bootstrap_capture.input_state,
      capture_state: "CANDIDATE_CAPTURE_PENDING",
      live_verification_state: "NOT_EXECUTED",
      rights_state: "UNKNOWN",
      source_pool_state: "NOT_ELIGIBLE",
      acquisition_authorized: false,
      public_projection: false,
      production: "HOLD"
    };
    site.site_fingerprint = siteFingerprint(site);
    return site;
  }).sort((left, right) => left.canonical_host.localeCompare(right.canonical_host));

  const eventInputs = { ...inputs, bootstrapObservedAt };
  const queueSeedEvents = records.flatMap(record => record.candidate_scope_ids.flatMap(scopeId =>
    record.candidate_source_roles.map(role => eventForBinding(record, scopeId, role, eventInputs, inputSnapshotRef))
  )).sort((left, right) => left.idempotency_key.localeCompare(right.idempotency_key));

  const output = {
    id: "kidults-global-pool-r1-bootstrap-capture-v1",
    record_type: "global_source_pool_bootstrap_capture_queue_seed",
    version: "1.0.0",
    status: "CANDIDATE_CAPTURE_PENDING",
    generated_at: bootstrapObservedAt,
    contract_id: contract.id,
    input_fingerprints: inputFingerprints,
    input_snapshot_ref: inputSnapshotRef,
    bootstrap_set_is_not_a_global_pool_target_or_completion_claim: true,
    global_frontier_remains_open_ended: true,
    numeric_site_target: null,
    registered_endpoint_record_count: records.length,
    registered_canonical_host_count: sites.length,
    live_verified_site_count: null,
    rights_cleared_site_count: 0,
    source_pool_eligible_site_count: 0,
    queue_seed_event_type: contract.bootstrap_capture.event_type,
    queue_seed_discovery_channel_id: contract.bootstrap_capture.discovery_channel_id,
    queue_seed_processor_fleet_id: contract.bootstrap_capture.processor_fleet_id,
    queue_seed_event_count: queueSeedEvents.length,
    source_records: records,
    canonical_sites: sites,
    queue_seed_events: queueSeedEvents,
    acquisition_authorized: false,
    market_claims_created: 0,
    indexes_computed: 0,
    public_projection: false,
    production: "HOLD"
  };
  output.bootstrap_fingerprint = outputFingerprint(output);
  assertCompiledGlobalPoolR1BootstrapCapture(output, inputs);
  return output;
}

export function assertCompiledGlobalPoolR1BootstrapCapture(output, inputs = loadGlobalPoolR1BootstrapInputs()) {
  const { contract, sourceContract, globalSourceUniverse, eventSchema } = inputs;
  const canonicalRoles = new Set(globalSourceUniverse.required_source_roles.map(role => role.role));
  const contextAllowedRoles = new Set(contract.bootstrap_capture.museum_or_institutional_context.allowed_candidate_roles);
  const allowedEventKeys = new Set(Object.keys(eventSchema.properties));
  const requiredEventKeys = eventSchema.required;
  const requiredPartitionKeys = eventSchema.properties.partition.required;
  assert(output.status === "CANDIDATE_CAPTURE_PENDING", "Bootstrap output must remain CANDIDATE_CAPTURE_PENDING.");
  assert(output.registered_endpoint_record_count === sourceContract.targets.candidate_count, "Bootstrap endpoint record count mismatch.");
  assert(output.source_records.length === output.registered_endpoint_record_count, "Bootstrap source records are incomplete.");
  assert(output.canonical_sites.length === output.registered_canonical_host_count, "Bootstrap canonical site records are incomplete.");
  assert(output.registered_canonical_host_count <= output.registered_endpoint_record_count, "Canonical host deduplication increased the record count.");
  assert(output.bootstrap_set_is_not_a_global_pool_target_or_completion_claim === true, "Bootstrap set cannot become a global target.");
  assert(output.global_frontier_remains_open_ended === true && output.numeric_site_target === null, "Bootstrap must not close or cap the global frontier.");
  assert(output.live_verified_site_count === null, "Registered endpoints must not be reported as live-verified.");
  assert(output.rights_cleared_site_count === 0 && output.source_pool_eligible_site_count === 0, "Bootstrap URLs cannot clear rights or source-pool gates.");
  assert(output.queue_seed_events.length === output.queue_seed_event_count && output.queue_seed_event_count > 0, "Bootstrap queue seed events are missing.");
  assert(output.queue_seed_event_type === "SOURCE_DISCOVERY_REQUESTED", "Bootstrap queue seed event type mismatch.");
  assert(output.acquisition_authorized === false && output.market_claims_created === 0, "Bootstrap cannot authorize acquisition or create market claims.");
  assert(output.public_projection === false && output.production === "HOLD", "Bootstrap must remain non-public on Production HOLD.");
  assert(output.bootstrap_fingerprint === outputFingerprint(output), "Bootstrap output fingerprint mismatch.");

  const sourceIds = new Set();
  for (const record of output.source_records) {
    assert(!sourceIds.has(record.source_record_id), `Duplicate bootstrap source record: ${record.source_record_id}.`);
    sourceIds.add(record.source_record_id);
    assert(record.endpoint_registration_state === "REGISTERED_ENDPOINT_CANDIDATE_NOT_LIVE_VERIFIED", `${record.source_record_id}: endpoint was promoted to live-verified.`);
    assert(record.capture_state === "CANDIDATE_CAPTURE_PENDING", `${record.source_record_id}: capture state advanced prematurely.`);
    assert(record.candidate_scope_ids.length > 0, `${record.source_record_id}: missing current Scope mapping.`);
    assert(record.candidate_source_roles.length > 0, `${record.source_record_id}: missing canonical role mapping.`);
    assert(record.candidate_source_roles.every(role => canonicalRoles.has(role)), `${record.source_record_id}: non-canonical source role emitted.`);
    assert(record.rights_state === "UNKNOWN", `${record.source_record_id}: endpoint URL improperly cleared rights.`);
    assert(record.source_pool_state === "NOT_ELIGIBLE", `${record.source_record_id}: source-pool gate bypassed.`);
    assert(record.terminal_transaction_asserted === false, `${record.source_record_id}: candidate role was misrepresented as a terminal transaction.`);
    assert(record.market_event_claim_authorized === false, `${record.source_record_id}: candidate authorized a market event.`);
    assert(record.acquisition_authorized === false && record.public_projection === false && record.production === "HOLD", `${record.source_record_id}: SHADOW/HOLD boundary failed.`);
    if (record.context_only) {
      assert(record.candidate_source_roles.every(role => contextAllowedRoles.has(role)), `${record.source_record_id}: context source escaped its allowed roles.`);
      assert(record.candidate_source_roles.every(role => !MARKET_CORE_ROLES.has(role)), `${record.source_record_id}: museum/institutional source entered a market role.`);
    }
    assert(record.record_fingerprint === sourceRecordFingerprint(record), `${record.source_record_id}: source-record fingerprint mismatch.`);
  }

  const siteIds = new Set();
  const hosts = new Set();
  for (const site of output.canonical_sites) {
    assert(!siteIds.has(site.site_id) && !hosts.has(site.canonical_host), `Canonical site deduplication failed for ${site.canonical_host}.`);
    siteIds.add(site.site_id);
    hosts.add(site.canonical_host);
    assert(site.capture_state === "CANDIDATE_CAPTURE_PENDING" && site.live_verification_state === "NOT_EXECUTED", `${site.canonical_host}: site state advanced prematurely.`);
    assert(site.rights_state === "UNKNOWN" && site.source_pool_state === "NOT_ELIGIBLE", `${site.canonical_host}: URL improperly cleared admission gates.`);
    assert(site.acquisition_authorized === false && site.public_projection === false && site.production === "HOLD", `${site.canonical_host}: site escaped SHADOW/HOLD boundary.`);
    assert(site.site_fingerprint === siteFingerprint(site), `${site.canonical_host}: site fingerprint mismatch.`);
  }

  const eventIds = new Set();
  const idempotencyKeys = new Set();
  for (const event of output.queue_seed_events) {
    assert(!eventIds.has(event.event_id), `Duplicate queue seed event ID: ${event.event_id}.`);
    assert(!idempotencyKeys.has(event.idempotency_key), `Duplicate queue seed idempotency key: ${event.idempotency_key}.`);
    eventIds.add(event.event_id);
    idempotencyKeys.add(event.idempotency_key);
    assert(requiredEventKeys.every(key => Object.hasOwn(event, key)), `${event.event_id}: event schema required field missing.`);
    assert(Object.keys(event).every(key => allowedEventKeys.has(key)), `${event.event_id}: event schema additional property emitted.`);
    assert(
      Object.keys(event.partition).length === requiredPartitionKeys.length &&
        requiredPartitionKeys.every(key => typeof event.partition[key] === "string" && event.partition[key].length > 0),
      `${event.event_id}: event partition is not schema-compatible.`
    );
    assert(event.event_type === "SOURCE_DISCOVERY_REQUESTED", `${event.event_id}: wrong event type.`);
    assert(event.event_version === "1.0.0", `${event.event_id}: wrong event version.`);
    assert(Number.isFinite(Date.parse(event.occurred_at)) && Number.isFinite(Date.parse(event.observed_at)), `${event.event_id}: invalid event time.`);
    assert(/^sha256:[a-f0-9]{64}$/.test(event.payload_hash), `${event.event_id}: invalid payload hash format.`);
    assert(new Set(event.reason_codes).size === event.reason_codes.length, `${event.event_id}: duplicate reason codes.`);
    assert(new Set(event.trace_refs).size === event.trace_refs.length, `${event.event_id}: duplicate trace references.`);
    assert(event.partition.channel === contract.bootstrap_capture.discovery_channel_id, `${event.event_id}: wrong discovery channel.`);
    assert(event.partition.region === "GLOBAL_UNRESOLVED" && event.partition.language === "und", `${event.event_id}: unobserved region/language was inferred.`);
    assert(canonicalRoles.has(event.partition.source_role), `${event.event_id}: non-canonical role in partition.`);
    if (event.payload.context_only) {
      assert(!MARKET_CORE_ROLES.has(event.partition.source_role), `${event.event_id}: context event entered a market role.`);
    }
    assert(event.rights_state === "UNKNOWN" && event.freshness_state === "UNKNOWN", `${event.event_id}: rights/freshness inferred before capture.`);
    assert(event.decision === "HOLD", `${event.event_id}: bootstrap event must HOLD.`);
    assert(event.payload.capture_state === "CANDIDATE_CAPTURE_PENDING", `${event.event_id}: payload capture state advanced.`);
    assert(!Object.hasOwn(event.payload, "target_fleet"), `${event.event_id}: explicit fleet routing is forbidden.`);
    assert(event.partition.scope_id === event.payload.candidate_scope_id, `${event.event_id}: Scope partition/payload mismatch.`);
    assert(event.partition.source_role === event.payload.candidate_source_role, `${event.event_id}: role partition/payload mismatch.`);
    assert(event.payload.source_id === event.payload.discovery_seed.source_id, `${event.event_id}: source lineage mismatch.`);
    assert(event.partition.canonical_host_hash === sha256(event.payload.discovery_seed.canonical_host), `${event.event_id}: canonical host hash mismatch.`);
    assert(event.payload.discovery_seed.discovery_rights_state === "UNKNOWN", `${event.event_id}: seed rights improperly cleared.`);
    assert(event.payload.discovery_seed.target_site_traversal_authorized === false, `${event.event_id}: target traversal improperly authorized.`);
    assert(event.payload.discovery_seed.market_event_claim_authorized === false, `${event.event_id}: market event improperly authorized.`);
    assert(event.payload.acquisition_authorized === false && event.payload.public_projection_authorized === false, `${event.event_id}: side effect improperly authorized.`);
    assert(event.payload_hash === fingerprint(event.payload), `${event.event_id}: payload hash mismatch.`);
    assert(new TextEncoder().encode(JSON.stringify(event)).byteLength <= 120 * 1024, `${event.event_id}: event exceeds the Queue task size boundary.`);
  }
}

function parseArgs(argv) {
  const config = { contract: defaultContractPath, output: null };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--contract") config.contract = path.resolve(argv[++index]);
    else if (argv[index] === "--output") config.output = path.resolve(argv[++index]);
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  return config;
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  const output = compileGlobalPoolR1BootstrapCapture(loadGlobalPoolR1BootstrapInputs(config.contract));
  if (config.output) {
    fs.mkdirSync(path.dirname(config.output), { recursive: true });
    fs.writeFileSync(config.output, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  }
  console.log(`KIDULTS Global Pool R1 bootstrap capture: ${output.status}`);
  console.log(
    `Registered endpoint records / canonical hosts / queue seed events: ${output.registered_endpoint_record_count} / ${output.registered_canonical_host_count} / ${output.queue_seed_event_count}`
  );
  console.log("Bootstrap records are real registered endpoints, not live verification or rights clearance.");
  console.log("Museums/institutions: context roles only; market-event claims: 0.");
  console.log("Acquisition: BLOCKED; public projection: BLOCKED; Production: HOLD.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
