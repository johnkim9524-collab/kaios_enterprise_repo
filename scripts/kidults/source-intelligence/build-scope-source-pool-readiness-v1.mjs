import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const coordinationRoot = path.join(root, "coordination", "kidults");
const scopeRegistryPath = path.join(coordinationRoot, "data-scope", "collection-scope-registry-v1.json");
const scaleContractPath = path.join(coordinationRoot, "data-scope", "category-1000-scale-contract-v1.json");
const asiProgramPath = path.join(coordinationRoot, "source-intelligence", "autonomous-source-intelligence-program-v1.json");
const readinessContractPath = path.join(coordinationRoot, "source-intelligence", "scope-source-pool-readiness-contract-v1.json");
const trustedSourceRoot = path.join(coordinationRoot, "registry", "trusted-source");
const trustedSourceIndexPath = path.join(trustedSourceRoot, "index.json");
const adapterContractRoot = path.join(coordinationRoot, "autonomous", "source-discovery", "contracts");
const defaultOutput = path.join(root, "artifacts", "agci-os", "scope-source-pool-foundation-v1");

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

function fingerprint(value) {
  return `sha256:${crypto.createHash("sha256").update(stableJson(value)).digest("hex")}`;
}

function parseArgs(argv) {
  const config = { output: defaultOutput, write: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output") config.output = path.resolve(argv[++index]);
    else if (argument === "--write") config.write = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return config;
}

function allocate(total, count) {
  const base = Math.floor(total / count);
  const remainder = total % count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

const ROLE_ALIASES = Object.freeze({
  "identity-canon": "PRIMARY_AUTHORITY",
  "release-history": "CATALOG_REFERENCE",
  "edition-resolution": "CATALOG_REFERENCE",
  "reference-resolution": "CATALOG_REFERENCE",
  "market-observation": "LISTING_SUPPLY",
  "valuation-comparable": "SOLD_TRANSACTION",
  "sold-transaction-pricing": "SOLD_TRANSACTION",
  "auction-private-sale": "AUCTION_PRIVATE_SALE",
  "authentication-condition": "AUTHENTICATION_CONDITION",
  "provenance-event-history": "PROVENANCE_HISTORY",
  "culture-attention": "CULTURE_ATTENTION",
  "macro-context": "MACRO_CONTEXT",
  "independent-verification": "INDEPENDENT_VERIFICATION"
});

const ROLE_PRIORITY = Object.freeze({
  PRIMARY_AUTHORITY: 1,
  SOLD_TRANSACTION: 2,
  AUTHENTICATION_CONDITION: 3,
  LISTING_SUPPLY: 4,
  PROVENANCE_HISTORY: 5,
  CATALOG_REFERENCE: 6,
  CULTURE_ATTENTION: 7,
  AUCTION_PRIVATE_SALE: 8,
  INDEPENDENT_VERIFICATION: 9,
  MACRO_CONTEXT: 10
});

const ROLE_QUERY_TERMS = Object.freeze({
  PRIMARY_AUTHORITY: "official manufacturer creator museum institutional archive",
  CATALOG_REFERENCE: "reference catalog database model edition variant release history",
  LISTING_SUPPLY: "marketplace dealer inventory listing supply availability",
  SOLD_TRANSACTION: "sold results transaction price realized sale database",
  AUTHENTICATION_CONDITION: "authentication grading condition certification registry",
  PROVENANCE_HISTORY: "provenance ownership exhibition history archive",
  CULTURE_ATTENTION: "collector community search trend media attention forum",
  AUCTION_PRIVATE_SALE: "auction results private sale lot archive",
  MACRO_CONTEXT: "market report regulation insurance currency macro context",
  INDEPENDENT_VERIFICATION: "independent verification research dataset cross reference"
});

function normalizedRoles(candidate) {
  const roles = new Set();
  for (const rawRole of candidate.primary_roles ?? []) {
    const canonical = ROLE_ALIASES[String(rawRole).toLowerCase()];
    if (canonical) roles.add(canonical);
  }

  const sourceClass = String(candidate.source_class ?? "").toUpperCase();
  if (/MANUFACTURER|CREATOR|MUSEUM|INSTITUTION|OFFICIAL_ARCHIVE/.test(sourceClass)) roles.add("PRIMARY_AUTHORITY");
  if (/CATALOG|REFERENCE|DATABASE/.test(sourceClass)) roles.add("CATALOG_REFERENCE");
  if (/MARKETPLACE|DEALER|LISTING/.test(sourceClass)) roles.add("LISTING_SUPPLY");
  if (/AUCTION/.test(sourceClass)) {
    roles.add("AUCTION_PRIVATE_SALE");
    roles.add("SOLD_TRANSACTION");
  }
  if (/MARKET_DATA|PRICE|TRANSACTION/.test(sourceClass)) roles.add("SOLD_TRANSACTION");
  if (/AUTHENTICATION|GRADING|CONDITION/.test(sourceClass)) roles.add("AUTHENTICATION_CONDITION");
  if (/PROVENANCE|OWNERSHIP/.test(sourceClass)) roles.add("PROVENANCE_HISTORY");
  if (/COMMUNITY|MEDIA|SEARCH|ATTENTION/.test(sourceClass)) roles.add("CULTURE_ATTENTION");

  return [...roles].sort((left, right) =>
    (ROLE_PRIORITY[left] ?? 99) - (ROLE_PRIORITY[right] ?? 99) || left.localeCompare(right));
}

function queryTemplates(scope, role) {
  const identity = (scope.identity_fields ?? []).slice(0, 4).join(" ");
  const inclusion = (scope.include ?? []).slice(0, 2).join(" ");
  const roleTerms = ROLE_QUERY_TERMS[role] ?? role.toLowerCase().replaceAll("_", " ");
  return [
    `${scope.name} ${roleTerms} official API dataset`,
    `${scope.name} ${roleTerms} ${identity} global`,
    `\"${scope.name}\" ${roleTerms} ${inclusion} archive`
  ];
}

function adapterContracts() {
  if (!fs.existsSync(adapterContractRoot)) return [];
  return fs.readdirSync(adapterContractRoot)
    .filter(name => name.endsWith(".json"))
    .sort()
    .map(name => {
      const contract = readJson(path.join(adapterContractRoot, name));
      return {
        file: name,
        contract_id: contract.contract_id ?? contract.id ?? null,
        source_id: contract.source_id ?? null,
        status: contract.status ?? "UNKNOWN"
      };
    });
}

function trustedSourceRecords() {
  const index = readJson(trustedSourceIndexPath);
  const records = index.records.map(reference => readJson(path.join(trustedSourceRoot, reference.path)));
  return { index, records };
}

export function loadScopeSourcePoolInputs() {
  return {
    scopeRegistry: readJson(scopeRegistryPath),
    scaleContract: readJson(scaleContractPath),
    asiProgram: readJson(asiProgramPath),
    readinessContract: readJson(readinessContractPath),
    trustedSources: trustedSourceRecords(),
    adapterContracts: adapterContracts()
  };
}

export function buildScopeSourcePoolReadiness(inputs = loadScopeSourcePoolInputs()) {
  const { scopeRegistry, scaleContract, asiProgram, readinessContract, trustedSources, adapterContracts: adapters } = inputs;
  const generatedAt = readinessContract.created_at;
  const requiredRoles = readinessContract.required_roles_per_scope;
  const scopesByDomain = new Map();
  for (const scope of scopeRegistry.records) {
    const values = scopesByDomain.get(scope.parent_core_domain) ?? [];
    values.push(scope);
    scopesByDomain.set(scope.parent_core_domain, values);
  }

  const trustedByDomain = new Map(trustedSources.records.map(record => [record.vertical_id, record]));
  const categoryDiscoveryAllocation = allocate(readinessContract.global_funnel_targets.source_channels_discovered, scaleContract.scale_definition.category_count);
  const categoryDeepAllocation = allocate(readinessContract.global_funnel_targets.deep_assessments, scaleContract.scale_definition.category_count);
  const categoryPreflightAllocation = allocate(readinessContract.global_funnel_targets.rights_access_preflights, scaleContract.scale_definition.category_count);
  const categoryAdapterAllocation = allocate(readinessContract.global_funnel_targets.bounded_live_adapters, scaleContract.scale_definition.category_count);

  const scopeRecords = [];
  const roleGapItems = [];
  const discoveryQueue = [];
  const categoryRecords = [];

  for (let categoryIndex = 0; categoryIndex < scaleContract.core_domains.length; categoryIndex += 1) {
    const category = scaleContract.core_domains[categoryIndex];
    const scopes = [...(scopesByDomain.get(category.id) ?? [])].sort((a, b) => a.scope_id.localeCompare(b.scope_id));
    const trustedRecord = trustedByDomain.get(category.id) ?? { source_candidates: [] };
    const seedCandidates = (trustedRecord.source_candidates ?? []).map(candidate => ({
      source_id: candidate.source_id,
      display_name: candidate.display_name,
      source_tier: candidate.source_tier,
      source_class: candidate.source_class,
      role_hints: normalizedRoles(candidate),
      rights_state: candidate.rights_state,
      commercial_use_state: candidate.commercial_use_state,
      access_mode: candidate.access_mode,
      api_state: candidate.api_state,
      risk_level: candidate.risk_level,
      trust_score_provisional: candidate.trust_score_provisional,
      score_status: candidate.score_status,
      state: "CORE_DOMAIN_SEED_SCOPE_RELEVANCE_UNASSESSED"
    }));

    const discoveryAllocation = allocate(categoryDiscoveryAllocation[categoryIndex], scopes.length);
    const deepAllocation = allocate(categoryDeepAllocation[categoryIndex], scopes.length);
    const preflightAllocation = allocate(categoryPreflightAllocation[categoryIndex], scopes.length);
    const adapterAllocation = allocate(categoryAdapterAllocation[categoryIndex], scopes.length);

    for (let scopeIndex = 0; scopeIndex < scopes.length; scopeIndex += 1) {
      const scope = scopes[scopeIndex];
      const roleHintSet = new Set(seedCandidates.flatMap(candidate => candidate.role_hints));
      const roleChannelAllocation = allocate(discoveryAllocation[scopeIndex], requiredRoles.length);
      const scopeRoleItems = [];

      for (let roleIndex = 0; roleIndex < requiredRoles.length; roleIndex += 1) {
        const role = requiredRoles[roleIndex];
        const hintSources = seedCandidates
          .filter(candidate => candidate.role_hints.includes(role))
          .map(candidate => candidate.source_id)
          .sort();
        const item = {
          work_item_id: `discover:${scope.scope_id}:${role.toLowerCase()}`,
          scope_id: scope.scope_id,
          parent_core_domain: category.id,
          source_role: role,
          role_priority: ROLE_PRIORITY[role] ?? 99,
          target_discovered_channels: roleChannelAllocation[roleIndex],
          known_domain_seed_hints: hintSources,
          scope_validated_sources: [],
          scope_validated_source_count: 0,
          gap_state: "MISSING_SCOPE_VALIDATED_ROLE_COVERAGE",
          query_templates: queryTemplates(scope, role),
          discovery_state: "NOT_STARTED",
          acquisition_authorized: false
        };
        scopeRoleItems.push(item);
        roleGapItems.push(item);
        discoveryQueue.push({
          queue_id: item.work_item_id,
          priority: item.role_priority,
          scope_id: scope.scope_id,
          parent_core_domain: category.id,
          source_role: role,
          target_discovered_channels: item.target_discovered_channels,
          query_templates: item.query_templates,
          seed_hints_available: hintSources.length,
          required_next_gate: "SOURCE_DISCOVERY_AND_SCOPE_RELEVANCE_ASSESSMENT",
          queue_state: "DISCOVERY_ONLY",
          acquisition_authorized: false,
          production_eligible: false
        });
      }

      const scopeRecord = {
        scope_id: scope.scope_id,
        name: scope.name,
        parent_core_domain: category.id,
        status: "HOLD_SOURCE_POOL_NOT_READY",
        planning_object_target: scope.planning_object_target,
        current_qualified_objects: null,
        current_qualified_objects_status: "NOT_MEASURED",
        customer_value_products: scopeRegistry.common_contract.value_products,
        identity_fields: scope.identity_fields,
        known_biases: scope.known_biases,
        source_pool_targets: {
          curated_candidates: readinessContract.minimums.source_candidates_discovered_per_scope,
          deep_assessed: readinessContract.minimums.source_candidates_deep_assessed_per_scope,
          rights_access_preflight: readinessContract.minimums.rights_access_preflights_per_scope,
          bounded_live_adapters: readinessContract.minimums.bounded_live_adapters_per_scope,
          scope_ready_candidates: readinessContract.minimums.scope_ready_candidates_per_scope,
          required_roles: readinessContract.minimums.required_source_roles_per_scope
        },
        global_discovery_funnel_allocation: {
          discovered: discoveryAllocation[scopeIndex],
          deep_assessed: deepAllocation[scopeIndex],
          rights_access_preflight: preflightAllocation[scopeIndex],
          bounded_live_adapters: adapterAllocation[scopeIndex]
        },
        known_core_domain_seed_candidates: seedCandidates,
        known_core_domain_seed_count: seedCandidates.length,
        seed_role_hints: [...roleHintSet].sort(),
        scope_relevance_assessed_candidate_count: 0,
        deep_assessed_candidate_count: 0,
        rights_access_preflight_count: 0,
        bounded_live_adapter_count: 0,
        scope_ready_candidate_count: 0,
        validated_source_roles: [],
        required_role_gap_count: requiredRoles.length,
        role_discovery_items: scopeRoleItems,
        representative_sampling_run: false,
        bias_report: "NOT_EXECUTED",
        acquisition_budget: "NOT_DEFINED",
        fallback_coverage: "NOT_ASSESSED",
        acquisition_authorized: false,
        index_eligible: false,
        public_projection: false,
        production_eligible: false
      };
      scopeRecords.push(scopeRecord);
    }

    categoryRecords.push({
      core_domain_id: category.id,
      name: category.name,
      qualified_object_target: category.qualified_object_target,
      current_qualified_objects: null,
      current_qualified_objects_status: "NOT_MEASURED",
      collection_scope_count: scopes.length,
      known_core_domain_seed_candidate_count: seedCandidates.length,
      scope_ready_source_pool_count: 0,
      market_data_poc_ready_scope_count: 0,
      curated_source_candidate_target: scopes.length * readinessContract.minimums.source_candidates_discovered_per_scope,
      global_source_discovery_allocation: categoryDiscoveryAllocation[categoryIndex],
      deep_assessment_allocation: categoryDeepAllocation[categoryIndex],
      rights_access_preflight_allocation: categoryPreflightAllocation[categoryIndex],
      bounded_live_adapter_allocation: categoryAdapterAllocation[categoryIndex],
      readiness_state: "HOLD_CATEGORY_SCALE_NOT_READY"
    });
  }

  discoveryQueue.sort((a, b) =>
    a.priority - b.priority || a.parent_core_domain.localeCompare(b.parent_core_domain) ||
    a.scope_id.localeCompare(b.scope_id) || a.source_role.localeCompare(b.source_role));
  roleGapItems.sort((a, b) =>
    a.parent_core_domain.localeCompare(b.parent_core_domain) || a.scope_id.localeCompare(b.scope_id) ||
    a.role_priority - b.role_priority || a.source_role.localeCompare(b.source_role));
  scopeRecords.sort((a, b) => a.parent_core_domain.localeCompare(b.parent_core_domain) || a.scope_id.localeCompare(b.scope_id));

  const uniqueSeedSources = new Set(trustedSources.records.flatMap(record =>
    (record.source_candidates ?? []).map(candidate => candidate.source_id)));

  const sourceDiscoveryFunnel = {
    id: "global-source-discovery-funnel-v1",
    record_type: "global_source_discovery_funnel",
    version: "1.0.0",
    status: "PLAN_READY_DISCOVERY_NOT_REBASELINED",
    generated_at: generatedAt,
    contract_id: readinessContract.id,
    targets: readinessContract.global_funnel_targets,
    known_seed_channel_candidates: uniqueSeedSources.size,
    known_seed_status: "CORE_DOMAIN_DISCOVERY_CANDIDATES_NOT_SCOPE_VALIDATED",
    contracted_adapter_count: adapters.length,
    contracted_adapters: adapters,
    official_rebased_counts: {
      source_channels_discovered: null,
      deep_assessments: null,
      rights_access_preflights: null,
      bounded_live_adapters: null,
      status: "NOT_MEASURED_AFTER_PROGRAM_RESET"
    },
    scope_discovery_allocation_total: scopeRecords.reduce((sum, scope) => sum + scope.global_discovery_funnel_allocation.discovered, 0),
    scope_deep_assessment_allocation_total: scopeRecords.reduce((sum, scope) => sum + scope.global_discovery_funnel_allocation.deep_assessed, 0),
    scope_rights_preflight_allocation_total: scopeRecords.reduce((sum, scope) => sum + scope.global_discovery_funnel_allocation.rights_access_preflight, 0),
    scope_adapter_allocation_total: scopeRecords.reduce((sum, scope) => sum + scope.global_discovery_funnel_allocation.bounded_live_adapters, 0),
    discovery_work_item_count: discoveryQueue.length,
    discovery_authorizes_acquisition: false,
    bulk_collection_authorized: false,
    public_projection: false,
    production: "HOLD"
  };
  sourceDiscoveryFunnel.plan_fingerprint = fingerprint(sourceDiscoveryFunnel);

  const scopeReadiness = {
    id: "scope-source-pool-readiness-v1",
    record_type: "scope_source_pool_readiness",
    version: "1.0.0",
    status: "FOUNDATION_READY_ALL_SCOPES_HOLD",
    generated_at: generatedAt,
    contract_id: readinessContract.id,
    collection_scope_registry_id: scopeRegistry.id,
    category_scale_contract_id: scaleContract.id,
    category_count: categoryRecords.length,
    scope_count: scopeRecords.length,
    categories: categoryRecords,
    scopes: scopeRecords,
    source_pools_ready: 0,
    market_data_poc_ready_scopes: 0,
    representative_sampling_runs: 0,
    current_qualified_object_count: null,
    current_qualified_object_status: "NOT_MEASURED",
    kidult_500: "NOT_COMPUTED",
    kidult_100: "NOT_COMPUTED",
    production: "HOLD"
  };
  scopeReadiness.report_fingerprint = fingerprint(scopeReadiness);

  const roleGapMatrix = {
    id: "scope-source-role-gap-matrix-v1",
    record_type: "source_role_gap_matrix",
    version: "1.0.0",
    status: "ALL_SCOPE_ROLES_REQUIRE_VALIDATION",
    generated_at: generatedAt,
    required_role_count_per_scope: requiredRoles.length,
    scope_count: scopeRecords.length,
    required_role_slot_count: scopeRecords.length * requiredRoles.length,
    validated_role_slot_count: 0,
    missing_role_slot_count: roleGapItems.length,
    items: roleGapItems,
    market_claim_authorized: false,
    production: "HOLD"
  };
  roleGapMatrix.report_fingerprint = fingerprint(roleGapMatrix);

  const acquisitionPriorityQueue = {
    id: "asi-acquisition-priority-queue-v1",
    record_type: "source_discovery_priority_queue",
    version: "1.0.0",
    status: "DISCOVERY_QUEUE_READY_ACQUISITION_BLOCKED",
    generated_at: generatedAt,
    first_value: asiProgram.first_value,
    governing_value: scaleContract.governing_value,
    work_item_count: discoveryQueue.length,
    items: discoveryQueue,
    execution_sequence: [
      "DISCOVER",
      "DEDUPLICATE_ENDPOINT",
      "CLASSIFY_SOURCE_AND_ROLE",
      "ASSESS_SCOPE_RELEVANCE",
      "SCORE_UTILITY_AND_VALUE",
      "SCORE_RIGHTS_ACCESS_TECHNICAL_AND_BIAS_RISK",
      "ASSESS_INDEPENDENCE_AND_REDUNDANCY",
      "PREFLIGHT_TERMS_ACCESS_AND_COST",
      "BUILD_BOUNDED_ADAPTER",
      "RUN_SAMPLING_AND_BIAS_GATE",
      "AUTHORIZE_ACQUISITION"
    ],
    acquisition_authorized: false,
    public_projection: false,
    production: "HOLD"
  };
  acquisitionPriorityQueue.queue_fingerprint = fingerprint(acquisitionPriorityQueue);

  const outputs = {
    "global-source-discovery-funnel.json": sourceDiscoveryFunnel,
    "scope-source-pool-readiness.json": scopeReadiness,
    "source-role-gap-matrix.json": roleGapMatrix,
    "acquisition-priority-queue.json": acquisitionPriorityQueue
  };

  const manifest = {
    id: "scope-source-pool-foundation-run-v1",
    record_type: "source_intelligence_foundation_run",
    version: "1.0.0",
    status: "SOURCE_POOL_FOUNDATION_READY_COLLECTION_BLOCKED",
    generated_at: generatedAt,
    inputs: {
      scope_registry: { id: scopeRegistry.id, fingerprint: fingerprint(scopeRegistry) },
      category_scale: { id: scaleContract.id, fingerprint: fingerprint(scaleContract) },
      asi_program: { id: asiProgram.id, fingerprint: fingerprint(asiProgram) },
      readiness_contract: { id: readinessContract.id, fingerprint: fingerprint(readinessContract) },
      trusted_source_registry: { id: trustedSources.index.registry_id, fingerprint: fingerprint(trustedSources.index) }
    },
    outputs: Object.fromEntries(Object.entries(outputs).map(([name, value]) =>
      [name, value.plan_fingerprint ?? value.report_fingerprint ?? value.queue_fingerprint])),
    category_count: categoryRecords.length,
    collection_scope_count: scopeRecords.length,
    known_seed_channel_candidates: uniqueSeedSources.size,
    discovery_work_item_count: discoveryQueue.length,
    required_source_role_slots: roleGapMatrix.required_role_slot_count,
    validated_source_role_slots: roleGapMatrix.validated_role_slot_count,
    source_pools_ready: 0,
    market_data_poc_ready_scopes: 0,
    source_universe_target: readinessContract.global_funnel_targets.source_channels_discovered,
    category_qualified_object_target: scaleContract.scale_definition.qualified_object_candidates_per_category,
    total_qualified_object_target: scaleContract.scale_definition.total_qualified_object_candidates,
    current_qualified_objects: null,
    current_qualified_objects_status: "NOT_MEASURED",
    acquisition_authorized: false,
    candidate_r2_created: false,
    indexes_computed: 0,
    public_projection: false,
    production: "HOLD"
  };
  manifest.run_fingerprint = fingerprint(manifest);
  outputs["run-manifest.json"] = manifest;
  return outputs;
}

function writeOutputs(directory, outputs) {
  fs.mkdirSync(directory, { recursive: true });
  for (const [name, value] of Object.entries(outputs)) {
    fs.writeFileSync(path.join(directory, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
  }
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  const outputs = buildScopeSourcePoolReadiness();
  if (config.write) writeOutputs(config.output, outputs);
  const run = outputs["run-manifest.json"];
  console.log("AGCI-OS Scope Source Pool Foundation: READY / COLLECTION BLOCKED");
  console.log(`Categories / scopes: ${run.category_count} / ${run.collection_scope_count}`);
  console.log(`Known domain seed channels: ${run.known_seed_channel_candidates}`);
  console.log(`Discovery work items: ${run.discovery_work_item_count}`);
  console.log(`Required / validated Source Role slots: ${run.required_source_role_slots} / ${run.validated_source_role_slots}`);
  console.log(`Global Source target: ${run.source_universe_target}`);
  console.log(`Category scale target: ${run.category_qualified_object_target} each / ${run.total_qualified_object_target} total`);
  console.log("Scope Source Pools ready: 0; acquisition: BLOCKED");
  console.log("KIDULT 500 / KIDULT 100: NOT_COMPUTED");
  console.log("Production: HOLD");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
