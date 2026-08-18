import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const contractPath = path.join(root, "coordination", "kidults", "source-intelligence", "asi-global-source-universe-v1.json");
const crosswalkPath = path.join(root, "coordination", "kidults", "source-intelligence", "scope-registry-v1-to-v2-crosswalk-v1.json");
const currentMatrixPath = path.join(root, "coordination", "kidults", "scope-data", "collection-scope-data-requirement-matrix-v1.1.json");
const questionMatrixPath = path.join(root, "coordination", "kidults", "scope-data", "collection-scope-data-requirement-matrix-v1.json");
const legacyRegistryPath = path.join(root, "coordination", "kidults", "data-scope", "collection-scope-registry-v1.json");
const defaultOutput = path.join(root, "artifacts", "agci-os", "asi-global-source-universe-v1");

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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function unique(values) {
  return [...new Set(values)].sort();
}

function attachFingerprint(value, field) {
  value[field] = fingerprint(value);
  return value;
}

function channelsForRole(contract, role) {
  const marketCore = new Set(["LISTING_SUPPLY", "SOLD_TRANSACTION", "AUTHENTICATION_CONDITION"]);
  return contract.discovery_channel_families
    .filter(channel => channel.role_bias.includes(role) ||
      (marketCore.has(role) && channel.channel_id === "OPTIONAL_LICENSED_SEARCH_OR_DATA_PROVIDER"))
    .map(channel => channel.channel_id)
    .sort();
}

export function loadGlobalSourceUniverseInputs() {
  return {
    contract: readJson(contractPath),
    crosswalk: readJson(crosswalkPath),
    currentMatrix: readJson(currentMatrixPath),
    questionMatrix: readJson(questionMatrixPath),
    legacyRegistry: readJson(legacyRegistryPath)
  };
}

export function buildGlobalSourceUniverse(inputs = loadGlobalSourceUniverseInputs()) {
  const { contract, crosswalk, currentMatrix, questionMatrix, legacyRegistry } = inputs;
  const currentScopes = currentMatrix.scopes ?? [];
  const questionScopes = questionMatrix.scopes ?? [];
  const legacyScopes = legacyRegistry.records ?? [];
  const roles = contract.required_source_roles ?? [];
  const regions = contract.geographic_regions ?? [];

  assert(contract.universe_boundary?.open_ended === true, "Global Source Universe must be open-ended.");
  assert(contract.universe_boundary?.numeric_site_target === null, "Numeric site targets are prohibited.");
  assert(contract.universe_boundary?.discovery_mode === "CONTINUOUS_GLOBAL_OPEN_MARKET_ENUMERATION",
    "Global Source Universe discovery mode mismatch.");
  assert(contract.promotion_boundaries?.unknown_rights_authorizes_adapter === false,
    "Unknown rights must never authorize an adapter.");
  assert(contract.promotion_boundaries?.discovery_authorizes_content_collection === false,
    "Discovery must not authorize content collection.");
  assert(currentScopes.length === 32, `Expected 32 current Scopes; observed ${currentScopes.length}.`);
  assert(questionScopes.length === 32, `Expected 32 Scope questions; observed ${questionScopes.length}.`);
  assert(legacyScopes.length === 32, `Expected 32 legacy Scopes; observed ${legacyScopes.length}.`);
  assert(roles.length === 7, `Expected seven required roles; observed ${roles.length}.`);
  assert(regions.length === 12, `Expected 12 global regions; observed ${regions.length}.`);
  assert(new Set(roles.map(role => role.role)).size === roles.length, "Required Source Roles must be unique.");
  assert(new Set(regions.map(region => region.region_id)).size === regions.length, "Global regions must be unique.");
  assert(contract.universe_boundary.coverage_cell_count === currentScopes.length * roles.length * regions.length,
    "Declared coverage cell count must equal Scope x role x region.");
  assert(roles.find(role => role.role === "LISTING_SUPPLY")?.market_universe_priority === "CORE_OPEN_MARKET",
    "Listing Supply must remain a core open-market role.");
  assert(roles.find(role => role.role === "SOLD_TRANSACTION")?.market_universe_priority === "CORE_OPEN_MARKET",
    "Sold Transaction must remain a core open-market role.");

  const currentIds = unique(currentScopes.map(scope => scope.scope_id));
  const questionIds = unique(questionScopes.map(scope => scope.id));
  const legacyIds = unique(legacyScopes.map(scope => scope.scope_id));
  const crosswalkLegacyIds = unique(crosswalk.records.map(record => record.legacy_scope_id));
  const crosswalkTargetIds = unique(crosswalk.records.flatMap(record => record.target_scope_ids));
  assert(JSON.stringify(currentIds) === JSON.stringify(questionIds), "Current Scope definition and question registries diverge.");
  assert(JSON.stringify(legacyIds) === JSON.stringify(crosswalkLegacyIds), "Legacy Scope registry is not fully covered by the crosswalk.");
  assert(JSON.stringify(currentIds) === JSON.stringify(crosswalkTargetIds), "Current Scope registry is not fully covered by the crosswalk.");

  const questionById = new Map(questionScopes.map(scope => [scope.id, scope]));
  const legacyByTarget = new Map();
  for (const record of crosswalk.records) {
    for (const target of record.target_scope_ids) {
      const values = legacyByTarget.get(target) ?? [];
      values.push({ legacy_scope_id: record.legacy_scope_id, migration_type: record.migration_type });
      legacyByTarget.set(target, values);
    }
  }

  const canonicalScopes = currentScopes.map(scope => {
    const question = questionById.get(scope.scope_id);
    return {
      scope_id: scope.scope_id,
      name: scope.name,
      core_domain_id: scope.domain,
      archetype: scope.archetype,
      irreplaceable_customer_question: question.question,
      identity_extensions: scope.identity_extensions,
      collectible_qualification_extensions: scope.collectible_qualification_extensions,
      market_cell_extensions: scope.market_cell_extensions,
      irreplaceable_metrics: scope.irreplaceable_metrics,
      legacy_mappings: (legacyByTarget.get(scope.scope_id) ?? []).sort((a, b) => a.legacy_scope_id.localeCompare(b.legacy_scope_id)),
      required_region_ids: regions.map(region => region.region_id),
      required_source_roles: roles.map(role => role.role),
      discovery_mode: "CONTINUOUS_OPEN_ENDED_GLOBAL_OPEN_MARKET_ENUMERATION",
      source_pool_state: "DISCOVERY_AND_REVIEW_NOT_EXECUTED",
      market_rank_state: "NOT_RANKABLE",
      production: "HOLD"
    };
  }).sort((a, b) => a.scope_id.localeCompare(b.scope_id));

  const cells = [];
  for (const scope of canonicalScopes) {
    for (const role of roles) {
      for (const region of regions) {
        cells.push({
          cell_id: `${scope.scope_id}:${role.role}:${region.region_id}`,
          scope_id: scope.scope_id,
          core_domain_id: scope.core_domain_id,
          source_role: role.role,
          market_universe_priority: role.market_universe_priority,
          region_id: region.region_id,
          language_codes: region.language_codes,
          discovery_channel_ids: channelsForRole(contract, role.role),
          numeric_site_quota: null,
          discovery_mode: "CONTINUOUS_FRONTIER_EXPANSION",
          discovered_unique_sites: null,
          directly_relevant_sites: null,
          legally_preflighted_sites: null,
          source_pool_eligible_sites: null,
          discovery_state: "NOT_EXECUTED",
          review_state: "NOT_EXECUTED",
          gap_state: "NOT_OBSERVED",
          acquisition_authorized: false,
          market_claim_authorized: false,
          production: "HOLD"
        });
      }
    }
  }
  cells.sort((a, b) => a.cell_id.localeCompare(b.cell_id));

  const canonicalRegistry = attachFingerprint({
    id: "canonical-collection-scope-registry-v2",
    record_type: "canonical_collection_scope_registry",
    version: "2.0.0",
    status: "ACTIVE_FOR_GLOBAL_SOURCE_DISCOVERY",
    generated_at: contract.created_at,
    contract_id: contract.id,
    scope_count: canonicalScopes.length,
    records: canonicalScopes,
    legacy_ids_are_not_canonical: true,
    production: "HOLD"
  }, "registry_fingerprint");

  const crosswalkAudit = attachFingerprint({
    id: "scope-registry-crosswalk-audit-v1",
    record_type: "scope_registry_crosswalk_audit",
    version: "1.0.0",
    status: "PASS_COMPLETE_WITH_EXPLICIT_SPLITS_RETIREMENT_AND_SEMANTIC_WARNING",
    generated_at: contract.created_at,
    crosswalk_id: crosswalk.id,
    legacy_scope_count: legacyIds.length,
    current_scope_count: currentIds.length,
    legacy_scopes_covered: crosswalkLegacyIds.length,
    current_scopes_covered: crosswalkTargetIds.length,
    split_records: crosswalk.records.filter(record => record.migration_type.startsWith("SPLIT")).map(record => record.legacy_scope_id),
    retired_records: crosswalk.records.filter(record => record.migration_type.startsWith("RETIRED")).map(record => record.legacy_scope_id),
    semantic_review_records: crosswalk.records.filter(record => record.migration_type.includes("SEMANTIC_REVIEW")).map(record => record.legacy_scope_id),
    implicit_migrations_allowed: false,
    production: "HOLD"
  }, "audit_fingerprint");

  const coverage = attachFingerprint({
    id: "global-open-market-scope-role-region-frontier-v1",
    record_type: "global_open_market_discovery_frontier",
    version: "1.0.0",
    status: "FRONTIER_READY_DISCOVERY_AND_REVIEW_NOT_EXECUTED",
    generated_at: contract.created_at,
    contract_id: contract.id,
    scope_count: canonicalScopes.length,
    source_role_count: roles.length,
    region_count: regions.length,
    coverage_cell_count: cells.length,
    numeric_site_target: contract.universe_boundary.numeric_site_target,
    discovery_is_open_ended: true,
    cells,
    completed_cells: 0,
    source_pools_ready: 0,
    market_claim_authorized: false,
    public_projection: false,
    production: "HOLD"
  }, "frontier_fingerprint");

  const legalAdmission = attachFingerprint({
    id: "global-open-market-legal-source-admission-v1",
    record_type: "legal_source_admission_contract",
    version: "1.0.0",
    status: "ACTIVE_FAIL_CLOSED",
    generated_at: contract.created_at,
    site_identity_fields: ["canonical_site_host", "source_family_id", "owner", "jurisdiction", "region_ids", "language_codes"],
    required_direct_relevance_fields: ["scope_ids", "source_roles", "claim_locator", "reviewed_at", "reviewer", "relevance_decision"],
    required_legal_fields: ["terms_url", "terms_version_or_observed_hash", "terms_observed_at", "robots_url", "robots_observed_at", "collect_state", "store_state", "transform_state", "derive_state", "display_state", "redistribute_state", "sell_state", "retention_state", "attribution_requirements", "territory", "review_due_at"],
    required_market_semantic_fields: ["listing_state", "terminal_sale_state", "price_type", "event_time_state", "object_or_lot_identity_state", "failed_sale_state", "relist_state"],
    unknown_rights_admission: false,
    missing_direct_relevance_admission: false,
    query_match_only_admission: false,
    museum_or_institution_presence_as_market_evidence: false,
    listing_as_sold: false,
    acquisition_authorized: false,
    production: "HOLD"
  }, "admission_fingerprint");

  const outputs = {
    "canonical-collection-scope-registry-v2.json": canonicalRegistry,
    "scope-registry-crosswalk-audit-v1.json": crosswalkAudit,
    "global-open-market-scope-role-region-frontier-v1.json": coverage,
    "global-open-market-legal-source-admission-v1.json": legalAdmission
  };
  const manifest = {
    id: "asi-global-source-universe-run-v1",
    record_type: "asi_global_source_universe_run",
    version: "1.0.0",
    status: "ENGINE_AND_GLOBAL_REVIEW_FRONTIER_READY_LIVE_DISCOVERY_NOT_PROVEN",
    generated_at: contract.created_at,
    inputs: {
      contract: fingerprint(contract),
      crosswalk: fingerprint(crosswalk),
      current_matrix: fingerprint(currentMatrix),
      question_matrix: fingerprint(questionMatrix),
      legacy_registry: fingerprint(legacyRegistry)
    },
    outputs: Object.fromEntries(Object.entries(outputs).map(([name, value]) => [name, value.registry_fingerprint ?? value.audit_fingerprint ?? value.frontier_fingerprint ?? value.admission_fingerprint])),
    canonical_scope_count: canonicalScopes.length,
    source_role_count: roles.length,
    geographic_region_count: regions.length,
    coverage_cell_count: cells.length,
    numeric_site_target: contract.universe_boundary.numeric_site_target,
    discovery_mode: contract.universe_boundary.discovery_mode,
    discovered_unique_sites: null,
    reviewed_unique_sites: null,
    legally_admitted_unique_sites: null,
    source_pools_ready: 0,
    acquisition_authorized: false,
    market_claims_created: 0,
    indexes_computed: 0,
    public_projection: false,
    production: "HOLD"
  };
  manifest.run_fingerprint = fingerprint(manifest);
  outputs["run-manifest.json"] = manifest;
  return outputs;
}

function parseArgs(argv) {
  const config = { output: defaultOutput, write: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--output") config.output = path.resolve(argv[++index]);
    else if (argv[index] === "--write") config.write = true;
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  return config;
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  const outputs = buildGlobalSourceUniverse();
  if (config.write) {
    fs.mkdirSync(config.output, { recursive: true });
    for (const [name, value] of Object.entries(outputs)) {
      fs.writeFileSync(path.join(config.output, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
    }
  }
  const manifest = outputs["run-manifest.json"];
  console.log(`KIDULTS ASI Global Source Universe: ${manifest.status}`);
  console.log(`Scopes / roles / regions / coverage cells: ${manifest.canonical_scope_count} / ${manifest.source_role_count} / ${manifest.geographic_region_count} / ${manifest.coverage_cell_count}`);
  console.log(`Discovery mode: ${manifest.discovery_mode}`);
  console.log("Numeric site target: null — continuous global open-market enumeration");
  console.log("Discovery / review / legal admission: NOT EXECUTED");
  console.log("Acquisition: BLOCKED; Production: HOLD");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
