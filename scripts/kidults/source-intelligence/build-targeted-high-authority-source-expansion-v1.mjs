import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { fingerprint, readJson, unique, writeJsonDirectory } from "./asi-discovery-common-v1.mjs";

const root = process.cwd();
const contractPath = path.join(root, "coordination", "kidults", "source-intelligence", "targeted-high-authority-source-expansion-contract-v1.json");
const inputPath = path.join(root, "coordination", "kidults", "source-intelligence", "targeted-high-authority-source-expansion-v1.psv");
const scopeRegistryPath = path.join(root, "coordination", "kidults", "data-scope", "collection-scope-registry-v1.json");
const defaultOutput = path.join(root, "artifacts", "agci-os", "targeted-high-authority-source-expansion-v1");

const CHANNEL_PRIORITY = Object.freeze({
  MUSEUM_AUTHORITY_API: 1,
  MUSEUM_AUTHORITY_OPEN_DATASET: 1,
  MUSEUM_AUTHORITY_LINKED_DATA_API: 1,
  PRIMARY_MANUFACTURER_ARCHIVE: 2,
  PRIMARY_MANUFACTURER_CATALOG: 2,
  PRIMARY_MANUFACTURER_MUSEUM_COLLECTION: 2,
  GRADING_AUTHORITY_DATABASE: 2,
  INSTITUTIONAL_AGGREGATED_OPEN_DATA_API: 2,
  SPECIALIST_CATALOG_API: 3,
  SPECIALIST_WATCH_DATABASE_API: 3,
  SPECIALIST_GAME_DATABASE_API: 3,
  SPECIALIST_CARD_DATABASE_API: 3,
  SPECIALIST_COMICS_DATABASE_API: 3,
  STRUCTURED_COMMUNITY_DATABASE_API: 3,
  STRUCTURED_FILM_DATASET: 3,
  MARKET_AUTHORITY_AUCTION_ARCHIVE: 4,
  SPECIALIST_MARKET_API: 4,
  SPECIALIST_MARKET_DATABASE: 4,
  STRUCTURED_AUTHENTICATED_MARKETPLACE: 5,
  STRUCTURED_CARD_MARKETPLACE: 5
});

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

function parsePsv(contract) {
  const lines = fs.readFileSync(inputPath, "utf8").split(/\r?\n/).filter(line => line.trim().length > 0);
  const header = lines.shift().split(contract.delimiter).map(value => value.trim());
  if (JSON.stringify(header) !== JSON.stringify(contract.row_schema)) {
    throw new Error("Targeted Source PSV header does not match the versioned row schema.");
  }
  return lines.map((line, index) => {
    const values = line.split(contract.delimiter).map(value => value.trim());
    if (values.length !== header.length) throw new Error(`PSV row ${index + 2} has ${values.length} fields; expected ${header.length}.`);
    const raw = Object.fromEntries(header.map((key, position) => [key, values[position]]));
    const collectionScopeIds = raw.collection_scope_ids.split(";").map(value => value.trim()).filter(Boolean);
    const sourceRoles = raw.source_roles.split(";").map(value => value.trim()).filter(Boolean);
    const decisions = unique(sourceRoles.flatMap(role => contract.role_to_decision_and_value[role]?.decisions ?? []));
    const valueScopes = unique(sourceRoles.flatMap(role => contract.role_to_decision_and_value[role]?.value_scopes ?? []));
    const machineReadable = /(API|DATASET|DATABASE|LINKED_DATA)/.test(raw.channel_type)
      ? "CONFIRMED_BY_CHANNEL_CONTRACT_REQUIRES_TECHNICAL_PREFLIGHT"
      : "NOT_CONFIRMED_REQUIRES_TECHNICAL_PREFLIGHT";
    return {
      source_id: raw.source_id,
      display_name: raw.display_name,
      core_domain: raw.core_domain,
      collection_scope_ids: collectionScopeIds,
      source_roles: sourceRoles,
      official_endpoint: raw.official_endpoint,
      official_documentation_url: raw.official_documentation_url,
      authority_basis: raw.authority_basis,
      channel_type: raw.channel_type,
      access_mode: raw.access_mode,
      machine_readable_state: machineReadable,
      rights_state: contract.default_states.rights_state,
      commercial_use_state: contract.default_states.commercial_use_state,
      jurisdiction_state: contract.default_states.jurisdiction_state,
      verification_state: contract.default_states.verification_state,
      customer_decision_archetypes: decisions,
      irreplaceable_value_scope_ids: valueScopes,
      evidence_references: unique([raw.official_endpoint, raw.official_documentation_url]),
      next_gate: "INDEPENDENT_RELEVANCE_REVIEW_THEN_OFFICIAL_RIGHTS_ACCESS_COST_PREFLIGHT",
      source_pool_promoted: false,
      acquisition_authorized: false,
      public_projection: false,
      production: "HOLD"
    };
  });
}

function roundRobinTop50(records, domainIds) {
  const groups = new Map(domainIds.map(domain => [
    domain,
    records.filter(record => record.core_domain === domain).sort((left, right) =>
      (CHANNEL_PRIORITY[left.channel_type] ?? 99) - (CHANNEL_PRIORITY[right.channel_type] ?? 99) ||
      left.source_id.localeCompare(right.source_id)
    )
  ]));
  const selected = [];
  const used = new Set();
  let cursor = 0;
  while (selected.length < 50) {
    const domain = domainIds[cursor % domainIds.length];
    const next = groups.get(domain).find(record => !used.has(record.source_id));
    if (next) {
      selected.push(next);
      used.add(next.source_id);
    }
    cursor += 1;
    if (cursor > records.length * 4) throw new Error(`Unable to construct 50 unique blind records; selected ${selected.length}.`);
  }
  return selected;
}

function blindCase(record, rank) {
  return {
    review_case_id: `targeted-authority-top50-${String(rank).padStart(3, "0")}`,
    blind_position: rank,
    source_id: record.source_id,
    display_name: record.display_name,
    core_domain: record.core_domain,
    collection_scope_ids: record.collection_scope_ids,
    source_roles: record.source_roles,
    official_endpoint: record.official_endpoint,
    official_documentation_url: record.official_documentation_url,
    authority_basis: record.authority_basis,
    channel_type: record.channel_type,
    access_mode: record.access_mode,
    machine_readable_state: record.machine_readable_state,
    rights_state: record.rights_state,
    commercial_use_state: record.commercial_use_state,
    jurisdiction_state: record.jurisdiction_state,
    customer_decision_archetypes: record.customer_decision_archetypes,
    irreplaceable_value_scope_ids: record.irreplaceable_value_scope_ids,
    evidence_references: record.evidence_references,
    prior_rank_score: null,
    prior_top50_label: null,
    review_state: "PENDING_TRACK_B_EVIDENCE_ONLY_REVIEW",
    source_pool_promoted: false,
    acquisition_authorized: false,
    production: "HOLD"
  };
}

export function buildTargetedSourceExpansion() {
  const contract = readJson(contractPath);
  const scopeRegistry = readJson(scopeRegistryPath);
  const scopeMap = new Map(scopeRegistry.records.map(record => [record.scope_id, record]));
  const domainIds = unique(scopeRegistry.records.map(record => record.parent_core_domain));
  const records = parsePsv(contract).sort((a, b) => a.core_domain.localeCompare(b.core_domain) || a.source_id.localeCompare(b.source_id));
  const domainCounts = Object.fromEntries(domainIds.map(domain => [domain, records.filter(record => record.core_domain === domain).length]));
  const invalidScopeLinks = [];
  for (const record of records) {
    for (const scopeId of record.collection_scope_ids) {
      const scope = scopeMap.get(scopeId);
      if (!scope || scope.parent_core_domain !== record.core_domain) {
        invalidScopeLinks.push({ source_id: record.source_id, core_domain: record.core_domain, scope_id: scopeId, resolved_parent_core_domain: scope?.parent_core_domain ?? null });
      }
    }
  }
  const endpointSet = new Set(records.map(record => record.official_endpoint));
  const sourceIdSet = new Set(records.map(record => record.source_id));
  const blindRecords = roundRobinTop50(records, domainIds);

  const registry = {
    id: "targeted-high-authority-source-candidate-registry-v1",
    record_type: "targeted_source_expansion_candidate_registry",
    version: "1.0.0",
    status: "TARGETED_CANDIDATE_REGISTRY_COMPILED_TRACK_B_REVIEW_PENDING",
    generated_at: contract.effective_at,
    source_contract_id: contract.id,
    record_count: records.length,
    core_domain_counts: domainCounts,
    records,
    source_pool_promotions: 0,
    acquisition_authorized: false,
    production: "HOLD"
  };

  const coverage = {
    id: "targeted-high-authority-source-expansion-coverage-v1",
    record_type: "targeted_source_expansion_coverage_report",
    version: "1.0.0",
    status:
      records.length === contract.targets.candidate_count &&
      domainIds.every(domain => domainCounts[domain] >= contract.targets.minimum_candidates_per_core_domain) &&
      invalidScopeLinks.length === 0 && endpointSet.size === records.length && sourceIdSet.size === records.length
        ? "STRUCTURAL_COVERAGE_PASS_RELEVANCE_AND_RIGHTS_PENDING"
        : "STRUCTURAL_COVERAGE_BLOCKED",
    generated_at: contract.effective_at,
    candidate_count: records.length,
    core_domain_count: domainIds.length,
    core_domain_counts: domainCounts,
    unique_source_ids: sourceIdSet.size,
    unique_official_endpoints: endpointSet.size,
    invalid_scope_links: invalidScopeLinks,
    invalid_scope_link_count: invalidScopeLinks.length,
    explicit_scope_coverage: records.filter(record => record.collection_scope_ids.length > 0).length / records.length,
    explicit_source_role_coverage: records.filter(record => record.source_roles.length > 0).length / records.length,
    explicit_decision_linkage_coverage: records.filter(record => record.customer_decision_archetypes.length > 0).length / records.length,
    explicit_value_linkage_coverage: records.filter(record => record.irreplaceable_value_scope_ids.length > 0).length / records.length,
    official_endpoint_coverage: records.filter(record => /^https?:\/\//.test(record.official_endpoint)).length / records.length,
    documentation_reference_coverage: records.filter(record => /^https?:\/\//.test(record.official_documentation_url)).length / records.length,
    source_pool_promotions: 0,
    acquisition_authorized: false,
    production: "HOLD"
  };

  const blindTop50 = {
    id: "targeted-high-authority-blind-top50-input-v1",
    record_type: "track_b_blind_source_relevance_input",
    version: "1.0.0",
    status: "BLIND_REVIEW_INPUT_READY_NO_PRIOR_SCORES",
    generated_at: contract.effective_at,
    parent_registry_id: registry.id,
    review_case_count: blindRecords.length,
    core_domains_represented: unique(blindRecords.map(record => record.core_domain)),
    prior_rank_scores_included: false,
    prior_top50_labels_included: false,
    records: blindRecords.map((record, index) => blindCase(record, index + 1)),
    source_pool_promotions: 0,
    acquisition_authorized: false,
    production: "HOLD"
  };

  const preflightQueue = {
    id: "targeted-high-authority-source-preflight-queue-v1",
    record_type: "source_rights_access_cost_preflight_queue",
    version: "1.0.0",
    status: "QUEUE_READY_NO_PREFLIGHT_PASSES",
    generated_at: contract.effective_at,
    queue_count: records.length,
    records: records.map((record, index) => ({
      queue_position: index + 1,
      source_id: record.source_id,
      display_name: record.display_name,
      core_domain: record.core_domain,
      official_endpoint: record.official_endpoint,
      official_documentation_url: record.official_documentation_url,
      rights_state: record.rights_state,
      commercial_use_state: record.commercial_use_state,
      access_mode: record.access_mode,
      preflight_state: "NOT_STARTED",
      preflight_pass: false,
      next_gate: record.next_gate,
      acquisition_authorized: false,
      production: "HOLD"
    })),
    preflight_passes: 0,
    acquisition_authorized: false,
    production: "HOLD"
  };

  const outputs = {
    "targeted-high-authority-source-candidate-registry-v1.json": registry,
    "targeted-source-expansion-coverage-v1.json": coverage,
    "targeted-high-authority-blind-top50-input-v1.json": blindTop50,
    "targeted-high-authority-source-preflight-queue-v1.json": preflightQueue
  };
  for (const value of Object.values(outputs)) value.fingerprint = fingerprint(value);
  const manifest = {
    id: "targeted-high-authority-source-expansion-v1-run-manifest",
    record_type: "targeted_source_expansion_run",
    version: "1.0.0",
    status: coverage.status.startsWith("STRUCTURAL_COVERAGE_PASS") ? "TARGETED_SOURCE_EXPANSION_FOUNDATION_PASS" : "TARGETED_SOURCE_EXPANSION_FOUNDATION_BLOCKED",
    generated_at: contract.effective_at,
    inputs: {
      expansion_contract: { id: contract.id, fingerprint: fingerprint(contract) },
      source_psv: { path: path.relative(root, inputPath), fingerprint: fingerprint(fs.readFileSync(inputPath, "utf8")) },
      collection_scope_registry: { id: scopeRegistry.id, fingerprint: fingerprint(scopeRegistry) }
    },
    outputs: Object.fromEntries(Object.entries(outputs).map(([name, value]) => [name, value.fingerprint])),
    candidate_count: records.length,
    core_domain_count: domainIds.length,
    blind_top50_count: blindRecords.length,
    source_pool_promotions: 0,
    preflight_passes: 0,
    implemented_adapters: 0,
    acquisition_authorized: false,
    candidate_r2: "BLOCKED",
    kidult_500: "NOT_COMPUTED",
    kidult_100: "NOT_COMPUTED",
    production: "HOLD"
  };
  manifest.run_fingerprint = fingerprint(manifest);
  outputs["run-manifest.json"] = manifest;
  return outputs;
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  const outputs = buildTargetedSourceExpansion();
  if (config.write) writeJsonDirectory(config.output, outputs);
  const run = outputs["run-manifest.json"];
  console.log("KIDULTS Targeted High-Authority Source Expansion v1: PASS / TRACK B REVIEW PENDING");
  console.log(`Candidates / Core Domains / Blind Top-50: ${run.candidate_count} / ${run.core_domain_count} / ${run.blind_top50_count}`);
  console.log("Source Pool promotions / Preflight PASS / Implemented adapters: 0 / 0 / 0");
  console.log("Acquisition: BLOCKED; Production: HOLD");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
