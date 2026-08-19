import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../../..");
const defaultContractPath = path.join(
  repositoryRoot,
  "coordination/kidults/source-intelligence/global-pool-r1-frontier-seed-channel-contract-v1.json"
);

const MARKET_EVENT_ROLES = new Set(["LISTING_SUPPLY", "SOLD_TRANSACTION"]);
const MARKET_CORE_ROLES = new Set(["LISTING_SUPPLY", "SOLD_TRANSACTION", "AUTHENTICATION_CONDITION"]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
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

export function fingerprint(value) {
  return `sha256:${crypto.createHash("sha256").update(stableJson(value)).digest("hex")}`;
}

function hashId(prefix, value) {
  return `${prefix}-${crypto.createHash("sha256").update(value).digest("hex").slice(0, 32)}`;
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

function sameMembers(left, right) {
  return stableJson(sortedUnique(left)) === stableJson(sortedUnique(right));
}

function resolveContractInput(contractFile, inputPath) {
  const fromRepositoryRoot = path.resolve(repositoryRoot, inputPath);
  if (fs.existsSync(fromRepositoryRoot)) return fromRepositoryRoot;
  return path.resolve(path.dirname(contractFile), inputPath);
}

export function loadGlobalPoolR1Inputs(contractFile = defaultContractPath) {
  const contract = readJson(contractFile);
  const load = key => readJson(resolveContractInput(contractFile, contract.canonical_inputs[key]));
  return {
    contract,
    scopeRegistry: load("scope_registry"),
    globalSourceUniverse: load("global_source_universe"),
    marketFunnelMesh: load("market_funnel_mesh"),
    purposeAdmissionPolicy: load("purpose_admission_policy"),
    sourcePoolReadiness: load("source_pool_readiness")
  };
}

export function validateGlobalPoolR1Inputs(inputs) {
  const {
    contract,
    scopeRegistry,
    globalSourceUniverse,
    marketFunnelMesh,
    purposeAdmissionPolicy,
    sourcePoolReadiness
  } = inputs;
  const scopes = scopeRegistry.scopes ?? [];
  const roles = globalSourceUniverse.required_source_roles ?? [];
  const regions = globalSourceUniverse.geographic_regions ?? [];
  const canonicalChannels = globalSourceUniverse.discovery_channel_families ?? [];
  const channelTaxonomy = contract.seed_channel_taxonomy ?? [];
  const discoveryStage = marketFunnelMesh.asi_funnel?.stages?.find(stage => stage.stage_id === "F0_GLOBAL_MARKET_SENSING");
  const admissionPurpose = purposeAdmissionPolicy.purposes?.find(purpose => purpose.purpose === "DISCOVERY_METADATA_INDEX");
  const museumBoundary = contract.source_family_semantic_boundaries?.find(
    boundary => boundary.source_family === "MUSEUM_OR_INSTITUTIONAL_CONTEXT"
  );

  assert(contract.status === "ACTIVE_SHADOW_FRONTIER_FOUNDATION", "Global Pool R1 must remain an active SHADOW foundation.");
  assert(contract.frontier_semantics?.open_ended === true, "Global Pool R1 frontier must be open-ended.");
  assert(contract.frontier_semantics?.numeric_site_target === null, "Numeric site targets are prohibited.");
  assert(
    contract.frontier_semantics?.candidate_capture_state === "CANDIDATE_CAPTURE_PENDING",
    "Initial frontier state must be CANDIDATE_CAPTURE_PENDING."
  );
  assert(contract.frontier_semantics?.one_candidate_is_one_site === false, "A frontier candidate must not be counted as a site.");
  assert(
    contract.frontier_semantics?.one_candidate_is_one_rights_cleared_source === false,
    "A frontier candidate must not be treated as a rights-cleared source."
  );
  assert(contract.frontier_semantics?.completion_claim_allowed === false, "A changing global source universe cannot be declared complete.");
  assert(contract.seed_record_contract?.url_observation_rights_effect === "NONE", "A URL must not clear source rights.");
  assert(contract.seed_record_contract?.url_observation_collection_effect === "NONE", "A URL must not authorize collection.");
  assert(contract.seed_record_contract?.query_or_keyword_match_relevance_effect === "CANDIDATE_ONLY", "Query matches must stay candidate-only.");

  assert(scopes.length === 32, `Expected 32 canonical current Scopes; observed ${scopes.length}.`);
  assert(new Set(scopes.map(scope => scope.scope_id)).size === 32, "Scope IDs must be unique.");
  assert(roles.length === 7, `Expected seven required source roles; observed ${roles.length}.`);
  assert(new Set(roles.map(role => role.role)).size === 7, "Required source roles must be unique.");
  assert(regions.length === 12, `Expected 12 global regions; observed ${regions.length}.`);
  assert(new Set(regions.map(region => region.region_id)).size === 12, "Region IDs must be unique.");
  assert(
    regions.every(region => Array.isArray(region.language_codes) && region.language_codes.length > 0 &&
      new Set(region.language_codes).size === region.language_codes.length),
    "Every region must have a non-empty, duplicate-free language frontier."
  );
  assert(
    regions.reduce((count, region) => count + region.language_codes.length, 0) === 48,
    "Canonical region-language frontier must contain 48 region-language pairs."
  );
  assert(
    sameMembers(roles.map(role => role.role), sourcePoolReadiness.required_roles_per_scope ?? []),
    "Global universe roles must match required Scope source-pool roles."
  );
  assert(
    sameMembers(roles.map(role => role.role), Object.keys(contract.role_market_semantics ?? {})),
    "Every required role must have exactly one market-semantic boundary."
  );
  assert(admissionPurpose, "DISCOVERY_METADATA_INDEX admission purpose is required.");
  assert(admissionPurpose.unknown_rights_decision === "HOLD", "Unknown discovery-metadata rights must HOLD.");
  assert(admissionPurpose.authorizes_content_collection === false, "Discovery metadata admission cannot authorize collection.");
  assert(admissionPurpose.authorizes_commercial_projection === false, "Discovery metadata admission cannot authorize projection.");
  assert(globalSourceUniverse.promotion_boundaries?.unknown_rights_authorizes_adapter === false, "Unknown rights must not authorize adapters.");
  assert(globalSourceUniverse.promotion_boundaries?.discovery_authorizes_content_collection === false, "Discovery must not authorize collection.");
  assert(globalSourceUniverse.promotion_boundaries?.discovery_authorizes_market_claim === false, "Discovery must not authorize market claims.");

  assert(discoveryStage, "F0 global market sensing stage is required.");
  assert(discoveryStage.mode === "PARALLEL_FAN_OUT_BY_CHANNEL_REGION_LANGUAGE_SCOPE_ROLE", "F0 fan-out grain mismatch.");
  assert(discoveryStage.engine_fleets.length === 12, "F0 must expose 12 independent discovery fleets.");
  assert(channelTaxonomy.length === canonicalChannels.length, "Seed channel taxonomy must cover every canonical discovery channel once.");
  assert(new Set(channelTaxonomy.map(channel => channel.channel_id)).size === channelTaxonomy.length, "Seed channel IDs must be unique.");
  assert(new Set(channelTaxonomy.map(channel => channel.processor_fleet_id)).size === channelTaxonomy.length, "Each seed channel must map to an independent discovery fleet.");
  assert(
    sameMembers(channelTaxonomy.map(channel => channel.channel_id), canonicalChannels.map(channel => channel.channel_id)),
    "Seed channel taxonomy must match the canonical Global Source Universe."
  );
  assert(
    sameMembers(channelTaxonomy.map(channel => channel.processor_fleet_id), discoveryStage.engine_fleets),
    "Seed channel processors must match the F0 discovery fleets."
  );
  assert(
    channelTaxonomy.every(channel => channel.candidate_capture_only === true && channel.target_site_traversal_authorized === false),
    "Every seed channel must remain capture-only with target-site traversal blocked."
  );
  const optionalChannel = channelTaxonomy.find(channel => channel.channel_id === "OPTIONAL_LICENSED_SEARCH_OR_DATA_PROVIDER");
  assert(optionalChannel?.provider_is_optional === true, "Licensed provider discovery must remain optional.");
  assert(
    optionalChannel?.activation_gate === "PROVIDER_NECESSITY_AND_CONTRACT_RIGHTS_GATE_PASS",
    "Optional provider activation requires necessity and contractual-rights gates."
  );

  for (const role of roles.map(value => value.role)) {
    assert(
      canonicalChannels.some(channel => channel.role_bias.includes(role)),
      `Source role ${role} has no canonical discovery channel.`
    );
  }

  assert(museumBoundary, "Museum/institutional context boundary is required.");
  assert(museumBoundary.context_only === true, "Museum/institutional sources must remain context-only.");
  assert(museumBoundary.market_event_claim_authorized === false, "Museum/institutional context cannot authorize market events.");
  assert(museumBoundary.demand_or_liquidity_claim_authorized === false, "Museum/institutional context cannot authorize demand or liquidity.");
  assert(
    MARKET_CORE_ROLES.size === museumBoundary.forbidden_market_event_roles.length &&
      sameMembers([...MARKET_CORE_ROLES], museumBoundary.forbidden_market_event_roles),
    "Museum/institutional context must exclude all core market-event roles."
  );
  assert(
    museumBoundary.allowed_candidate_roles.every(role => !MARKET_CORE_ROLES.has(role)),
    "Museum/institutional allowed roles must not contain a core market-event role."
  );

  const admission = contract.admission_boundary ?? {};
  assert(admission.initial_purpose === "DISCOVERY_METADATA_INDEX", "Global Pool R1 must begin at discovery-metadata purpose.");
  assert(admission.initial_rights_state === "UNKNOWN", "Frontier candidates must begin with UNKNOWN rights.");
  assert(admission.initial_freshness_state === "UNKNOWN", "Frontier candidates must begin with UNKNOWN freshness.");
  assert(admission.source_pool_state === "NOT_ELIGIBLE", "Frontier candidates must not be source-pool eligible.");
  assert(admission.acquisition_authorized === false, "Frontier candidates cannot authorize acquisition.");
  assert(admission.commercial_use_authorized === false, "Frontier candidates cannot authorize commercial use.");
  assert(admission.market_claim_authorized === false, "Frontier candidates cannot authorize market claims.");
  assert(admission.public_projection === false, "Frontier candidates cannot authorize public projection.");
  assert(admission.production === "HOLD", "Global Pool R1 must remain on Production HOLD.");
}

function channelsForRole(role, globalSourceUniverse, channelById) {
  return globalSourceUniverse.discovery_channel_families
    .filter(channel => channel.role_bias.includes(role))
    .map(channel => {
      const taxonomy = channelById.get(channel.channel_id);
      return {
        channel_id: taxonomy.channel_id,
        processor_fleet_id: taxonomy.processor_fleet_id,
        activation_gate: taxonomy.activation_gate ?? "CHANNEL_METADATA_ACCESS_POLICY_PASS"
      };
    })
    .sort((left, right) => left.channel_id.localeCompare(right.channel_id));
}

function candidateFingerprint(candidate) {
  const { candidate_fingerprint: ignored, ...unsigned } = candidate;
  return fingerprint(unsigned);
}

function universeFingerprint(output) {
  const { universe_fingerprint: ignored, ...unsigned } = output;
  return fingerprint(unsigned);
}

export function compileGlobalPoolR1Frontier(inputs = loadGlobalPoolR1Inputs()) {
  validateGlobalPoolR1Inputs(inputs);
  const {
    contract,
    scopeRegistry,
    globalSourceUniverse,
    marketFunnelMesh,
    purposeAdmissionPolicy,
    sourcePoolReadiness
  } = inputs;
  const scopes = [...scopeRegistry.scopes].sort((left, right) => left.scope_id.localeCompare(right.scope_id));
  const roles = globalSourceUniverse.required_source_roles.map(value => value.role).sort();
  const regions = [...globalSourceUniverse.geographic_regions].sort((left, right) => left.region_id.localeCompare(right.region_id));
  const channelById = new Map(contract.seed_channel_taxonomy.map(channel => [channel.channel_id, channel]));
  const inputFingerprints = {
    frontier_contract: fingerprint(contract),
    scope_registry: fingerprint(scopeRegistry),
    global_source_universe: fingerprint(globalSourceUniverse),
    market_funnel_mesh: fingerprint(marketFunnelMesh),
    purpose_admission_policy: fingerprint(purposeAdmissionPolicy),
    source_pool_readiness: fingerprint(sourcePoolReadiness)
  };
  const inputSnapshotRef = fingerprint(inputFingerprints);
  const candidates = [];

  for (const scope of scopes) {
    for (const sourceRole of roles) {
      const channels = channelsForRole(sourceRole, globalSourceUniverse, channelById);
      for (const region of regions) {
        for (const languageCode of [...region.language_codes].sort()) {
          const tuple = `${scope.scope_id}|${sourceRole}|${region.region_id}|${languageCode}`;
          const candidate = {
            frontier_candidate_id: hashId("frontier", tuple),
            candidate_type: "DISCOVERY_FRONTIER_CANDIDATE",
            task_kind: contract.dispatch_contract.task_kind,
            stage_id: contract.dispatch_contract.stage_id,
            capture_state: contract.frontier_semantics.candidate_capture_state,
            scope_id: scope.scope_id,
            scope_name: scope.name,
            core_domain_id: scope.domain,
            source_role: sourceRole,
            role_market_semantics: contract.role_market_semantics[sourceRole],
            market_event_role: MARKET_EVENT_ROLES.has(sourceRole),
            region_id: region.region_id,
            region_name: region.name,
            language_code: languageCode,
            candidate_channels: channels,
            channel_dispatch_state: "PENDING_CHANNEL_POLICY_GATE",
            partition_seed: {
              region: region.region_id,
              language: languageCode,
              scope_id: scope.scope_id,
              source_role: sourceRole,
              channel: "SELECT_AT_DISPATCH",
              canonical_host_hash_state: "UNRESOLVED_UNTIL_SOURCE_OBSERVATION"
            },
            input_snapshot_ref: inputSnapshotRef,
            canonical_site_host: null,
            canonical_host_hash: null,
            discovered_unique_site_count: null,
            direct_relevance_state: "NOT_OBSERVED",
            owner_and_source_family_state: "NOT_OBSERVED",
            rights_state: contract.admission_boundary.initial_rights_state,
            freshness_state: contract.admission_boundary.initial_freshness_state,
            source_pool_state: contract.admission_boundary.source_pool_state,
            acquisition_authorized: contract.admission_boundary.acquisition_authorized,
            commercial_use_authorized: contract.admission_boundary.commercial_use_authorized,
            market_claim_authorized: contract.admission_boundary.market_claim_authorized,
            public_projection: contract.admission_boundary.public_projection,
            production: contract.admission_boundary.production
          };
          candidate.candidate_fingerprint = candidateFingerprint(candidate);
          candidates.push(candidate);
        }
      }
    }
  }

  const regionLanguagePairCount = regions.reduce((count, region) => count + region.language_codes.length, 0);
  const output = {
    id: "kidults-global-pool-r1-scope-role-region-language-frontier-v1",
    record_type: "global_source_pool_discovery_frontier",
    version: "1.0.0",
    status: "CANDIDATE_CAPTURE_PENDING",
    generated_at: contract.created_at,
    contract_id: contract.id,
    input_fingerprints: inputFingerprints,
    input_snapshot_ref: inputSnapshotRef,
    frontier_unit: contract.frontier_semantics.unit,
    scope_count: scopes.length,
    source_role_count: roles.length,
    region_count: regions.length,
    region_language_pair_count: regionLanguagePairCount,
    frontier_candidate_count: candidates.length,
    frontier_candidate_count_is_a_derived_coverage_intersection_not_a_site_target: true,
    expected_frontier_candidate_count_expression: "scope_count * source_role_count * region_language_pair_count",
    unique_site_count: null,
    directly_relevant_site_count: null,
    legally_admitted_site_count: null,
    source_pool_eligible_site_count: 0,
    numeric_site_target: null,
    open_ended: true,
    discovery_mode: "CONTINUOUS_GLOBAL_OPEN_MARKET_ENUMERATION",
    candidates,
    acquisition_authorized: false,
    commercial_use_authorized: false,
    market_claim_authorized: false,
    indexes_computed: 0,
    public_projection: false,
    production: "HOLD"
  };
  output.universe_fingerprint = universeFingerprint(output);
  assertCompiledGlobalPoolR1Frontier(output, inputs);
  return output;
}

export function assertCompiledGlobalPoolR1Frontier(output, inputs = loadGlobalPoolR1Inputs()) {
  const { contract, scopeRegistry, globalSourceUniverse } = inputs;
  const expectedRegionLanguagePairs = globalSourceUniverse.geographic_regions.reduce(
    (count, region) => count + region.language_codes.length,
    0
  );
  const expectedCount = scopeRegistry.scopes.length * globalSourceUniverse.required_source_roles.length * expectedRegionLanguagePairs;
  const requiredRoleSet = new Set(globalSourceUniverse.required_source_roles.map(role => role.role));
  const expectedTuples = new Set();
  for (const scope of scopeRegistry.scopes) {
    for (const sourceRole of requiredRoleSet) {
      for (const region of globalSourceUniverse.geographic_regions) {
        for (const languageCode of region.language_codes) {
          expectedTuples.add(`${scope.scope_id}|${sourceRole}|${region.region_id}|${languageCode}`);
        }
      }
    }
  }
  const museumBoundary = contract.source_family_semantic_boundaries.find(
    boundary => boundary.source_family === "MUSEUM_OR_INSTITUTIONAL_CONTEXT"
  );

  assert(output.status === "CANDIDATE_CAPTURE_PENDING", "Compiled frontier status must remain CANDIDATE_CAPTURE_PENDING.");
  assert(output.frontier_candidate_count === expectedCount, "Compiled frontier candidate count does not match the canonical cross-product.");
  assert(output.candidates.length === expectedCount, "Compiled frontier records are incomplete.");
  assert(output.region_language_pair_count === expectedRegionLanguagePairs, "Compiled region-language count is inconsistent.");
  assert(output.frontier_candidate_count_is_a_derived_coverage_intersection_not_a_site_target === true, "Derived frontier count must not become a site target.");
  assert(output.numeric_site_target === null && output.open_ended === true, "Compiled frontier must remain open-ended and quota-free.");
  assert(output.unique_site_count === null, "Unique site count is unknown before capture and must remain null.");
  assert(output.directly_relevant_site_count === null, "Direct relevance must remain unobserved before capture.");
  assert(output.legally_admitted_site_count === null, "Legal admission must remain unobserved before capture.");
  assert(output.source_pool_eligible_site_count === 0, "No source-pool eligibility may be inferred from frontier generation.");
  assert(output.acquisition_authorized === false, "Frontier generation cannot authorize acquisition.");
  assert(output.commercial_use_authorized === false, "Frontier generation cannot authorize commercial use.");
  assert(output.market_claim_authorized === false, "Frontier generation cannot authorize market claims.");
  assert(output.public_projection === false && output.production === "HOLD", "Frontier generation must remain non-public on Production HOLD.");
  assert(output.universe_fingerprint === universeFingerprint(output), "Compiled frontier universe fingerprint mismatch.");

  const candidateIds = new Set();
  const tuples = new Set();
  for (const candidate of output.candidates) {
    const tuple = `${candidate.scope_id}|${candidate.source_role}|${candidate.region_id}|${candidate.language_code}`;
    assert(!candidateIds.has(candidate.frontier_candidate_id), `Duplicate frontier candidate ID: ${candidate.frontier_candidate_id}.`);
    assert(!tuples.has(tuple), `Duplicate frontier tuple: ${tuple}.`);
    assert(expectedTuples.has(tuple), `${tuple}: tuple is outside the canonical Scope x role x region x language frontier.`);
    candidateIds.add(candidate.frontier_candidate_id);
    tuples.add(tuple);
    assert(candidate.capture_state === "CANDIDATE_CAPTURE_PENDING", `${tuple}: candidate was prematurely advanced.`);
    assert(requiredRoleSet.has(candidate.source_role), `${tuple}: unknown source role.`);
    assert(candidate.canonical_site_host === null && candidate.canonical_host_hash === null, `${tuple}: host identity cannot exist before capture.`);
    assert(candidate.discovered_unique_site_count === null, `${tuple}: missing site observation must remain null, not zero.`);
    assert(candidate.direct_relevance_state === "NOT_OBSERVED", `${tuple}: relevance cannot be inferred from a frontier tuple.`);
    assert(candidate.rights_state === "UNKNOWN", `${tuple}: URL/frontier presence cannot clear rights.`);
    assert(candidate.freshness_state === "UNKNOWN", `${tuple}: freshness cannot be inferred before observation.`);
    assert(candidate.source_pool_state === "NOT_ELIGIBLE", `${tuple}: frontier candidate is not source-pool eligible.`);
    assert(candidate.acquisition_authorized === false, `${tuple}: acquisition cannot be authorized.`);
    assert(candidate.commercial_use_authorized === false, `${tuple}: commercial use cannot be authorized.`);
    assert(candidate.market_claim_authorized === false, `${tuple}: market claims cannot be authorized.`);
    assert(candidate.public_projection === false && candidate.production === "HOLD", `${tuple}: candidate escaped SHADOW/HOLD boundary.`);
    assert(candidate.candidate_channels.length > 0, `${tuple}: no discovery channel is available.`);
    assert(candidate.candidate_fingerprint === candidateFingerprint(candidate), `${tuple}: candidate fingerprint mismatch.`);
    if (museumBoundary.allowed_candidate_roles.includes(candidate.source_role)) {
      assert(!MARKET_CORE_ROLES.has(candidate.source_role), `${tuple}: museum/context role crossed into a core market role.`);
    }
  }
  assert(
    candidateIds.size === expectedCount && tuples.size === expectedCount &&
      [...expectedTuples].every(tuple => tuples.has(tuple)),
    "Compiled frontier is not a complete unique canonical cross-product."
  );
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
  const output = compileGlobalPoolR1Frontier(loadGlobalPoolR1Inputs(config.contract));
  if (config.output) {
    fs.mkdirSync(path.dirname(config.output), { recursive: true });
    fs.writeFileSync(config.output, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  }
  console.log(`KIDULTS Global Pool R1 frontier: ${output.status}`);
  console.log(
    `Scopes / roles / regions / region-language pairs / derived frontier candidates: ${output.scope_count} / ${output.source_role_count} / ${output.region_count} / ${output.region_language_pair_count} / ${output.frontier_candidate_count}`
  );
  console.log("Frontier candidates are capture work, not sites or rights-cleared sources.");
  console.log("Numeric site target: null; unique sites: NOT OBSERVED; source-pool eligible: 0.");
  console.log("Acquisition: BLOCKED; public projection: BLOCKED; Production: HOLD.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
