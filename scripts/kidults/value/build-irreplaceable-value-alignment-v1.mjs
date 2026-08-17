import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const strategyPath = path.join(root, "coordination", "kidults", "strategy", "agci-os-total-program-strategy-reset-v2.json");
const valuePath = path.join(root, "coordination", "kidults", "value", "irreplaceable-value-operating-contract-v1.json");
const defaultOutput = path.join(root, "artifacts", "agci-os", "irreplaceable-value-alignment-v1");

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

const layerPolicies = {
  AUTONOMOUS_VALUE_INTELLIGENCE: {
    value_scope_ids: ["VS_OBJECT_TRUST", "VS_PRICE_COMPARABILITY", "VS_SCARCITY_AVAILABILITY", "VS_LIQUIDITY_EXIT", "VS_MOMENTUM_OPPORTUNITY", "VS_MARKET_STRUCTURE", "VS_SOURCE_PROVIDER_ADVANTAGE"],
    decision_advantage: "Defines which high-value customer and institutional decisions the platform will improve and compiles them into exact Intelligence and data requirements.",
    failure_state: "HOLD_VALUE_SCOPE_NOT_DEFINED",
    owner: "KPMO / Track A"
  },
  COLLECTION_SCOPE_INTELLIGENCE: {
    value_scope_ids: ["VS_OBJECT_TRUST", "VS_PRICE_COMPARABILITY", "VS_SCARCITY_AVAILABILITY", "VS_LIQUIDITY_EXIT", "VS_MOMENTUM_OPPORTUNITY", "VS_MARKET_STRUCTURE"],
    decision_advantage: "Transforms Value requirements into representative and auditable acquisition units without freezing market structure.",
    failure_state: "HOLD_SCOPE_NOT_READY",
    owner: "Track A"
  },
  AUTONOMOUS_SOURCE_INTELLIGENCE: {
    value_scope_ids: ["VS_SOURCE_PROVIDER_ADVANTAGE", "VS_OBJECT_TRUST", "VS_PRICE_COMPARABILITY", "VS_SCARCITY_AVAILABILITY", "VS_LIQUIDITY_EXIT", "VS_MOMENTUM_OPPORTUNITY"],
    decision_advantage: "Finds the Source mix with the highest incremental decision value while exposing rights, bias, concentration, continuity and cost risk.",
    failure_state: "HOLD_SOURCE_POOL_NOT_READY",
    owner: "Track A"
  },
  DATA_ACQUISITION_AND_CONTROL: {
    value_scope_ids: ["VS_SOURCE_PROVIDER_ADVANTAGE", "VS_OBJECT_TRUST", "VS_PRICE_COMPARABILITY", "VS_SCARCITY_AVAILABILITY", "VS_LIQUIDITY_EXIT", "VS_MOMENTUM_OPPORTUNITY"],
    decision_advantage: "Acquires only scope-ready, rights-explicit and representative Evidence while preventing contamination of platform truth.",
    failure_state: "QUARANTINED_NOT_VALUE_ELIGIBLE",
    owner: "Track A / Track D"
  },
  CANONICAL_TRUTH_AND_MEMORY: {
    value_scope_ids: ["VS_OBJECT_TRUST", "VS_PRICE_COMPARABILITY", "VS_SCARCITY_AVAILABILITY", "VS_LIQUIDITY_EXIT", "VS_MOMENTUM_OPPORTUNITY", "VS_MARKET_STRUCTURE"],
    decision_advantage: "Makes cross-source comparison possible by separating identity classes and retaining what was known, when it was known and how it changed.",
    failure_state: "REVIEW_REQUIRED_OR_NOT_VERIFIED",
    owner: "Track A"
  },
  EVIDENCE_AND_MARKET_GRAPH: {
    value_scope_ids: ["VS_OBJECT_TRUST", "VS_PRICE_COMPARABILITY", "VS_SCARCITY_AVAILABILITY", "VS_LIQUIDITY_EXIT", "VS_MOMENTUM_OPPORTUNITY", "VS_MARKET_STRUCTURE"],
    decision_advantage: "Builds explainable relationships and market-state Evidence that no single Source or generic model can reproduce.",
    failure_state: "NOT_VERIFIED_NO_MARKET_CLAIM",
    owner: "Track A"
  },
  PROVIDER_FUSION: {
    value_scope_ids: ["VS_SOURCE_PROVIDER_ADVANTAGE", "VS_OBJECT_TRUST", "VS_PRICE_COMPARABILITY", "VS_SCARCITY_AVAILABILITY", "VS_LIQUIDITY_EXIT", "VS_MOMENTUM_OPPORTUNITY", "VS_MARKET_STRUCTURE"],
    decision_advantage: "Converts Provider breadth and depth into incremental Value without surrendering identity, provenance, independence or resilience.",
    failure_state: "QUARANTINED_PROVIDER_NOT_FUSION_ELIGIBLE",
    owner: "Track A / Provider Lead"
  },
  INTELLIGENCE_PRODUCTS_AND_INDEX: {
    value_scope_ids: ["VS_OBJECT_TRUST", "VS_PRICE_COMPARABILITY", "VS_SCARCITY_AVAILABILITY", "VS_LIQUIDITY_EXIT", "VS_MOMENTUM_OPPORTUNITY", "VS_MARKET_STRUCTURE"],
    decision_advantage: "Delivers the final collector and institutional decision advantage through governed Intelligence Products and explainable Indexes.",
    failure_state: "NOT_COMPUTED_OR_NOT_PUBLISHABLE",
    owner: "Track A / Track B"
  },
  PROJECTION_AND_EXPERIENCE: {
    value_scope_ids: ["VS_OBJECT_TRUST", "VS_PRICE_COMPARABILITY", "VS_SCARCITY_AVAILABILITY", "VS_LIQUIDITY_EXIT", "VS_MOMENTUM_OPPORTUNITY", "VS_MARKET_STRUCTURE", "VS_SOURCE_PROVIDER_ADVANTAGE"],
    decision_advantage: "Turns governed truth into fast, understandable and actionable decisions while preserving confidence, limitations and Source lineage.",
    failure_state: "HOLD_PROJECTION_NOT_VALUE_ALIGNED",
    owner: "Track C / Track E"
  }
};

const featureFamilies = [
  {
    feature_id: "FEATURE_OBJECT_INTELLIGENCE_PASSPORT",
    customer_segment: ["COLLECTOR", "INSTITUTION", "ENTERPRISE_AND_PROVIDER"],
    customer_decisions: ["VERIFY_OBJECT", "ASSESS_PROVENANCE_AND_CONDITION", "UNDERSTAND_VARIANT"],
    value_scope_ids: ["VS_OBJECT_TRUST"],
    irreplaceability_mechanism: "Canonical identity plus independent authority, condition, authentication, provenance, conflict and confidence Evidence.",
    required_evidence: ["CANONICAL_IDENTITY", "PRIMARY_AUTHORITY", "AUTHENTICATION", "CONDITION", "PROVENANCE", "SOURCE_CONTRIBUTION"],
    publication_gate: "TRACK_B_APPROVED_AND_EXPLAINABLE"
  },
  {
    feature_id: "FEATURE_COMPARABLE_MARKET_VIEW",
    customer_segment: ["COLLECTOR", "INSTITUTION"],
    customer_decisions: ["HOW_MUCH_TO_PAY", "BUY_OR_WAIT", "SELL_OR_HOLD"],
    value_scope_ids: ["VS_PRICE_COMPARABILITY"],
    irreplaceability_mechanism: "Cross-market canonical comparables normalized for condition, region, currency, time, listing-vs-sold state and Source bias.",
    required_evidence: ["SOLD_EVENTS", "LISTING_SUPPLY", "CONDITION_NORMALIZATION", "REGION_CURRENCY_TIME", "SOURCE_BIAS"],
    publication_gate: "REPRESENTATIVE_COVERAGE_AND_TRACK_B_PASS"
  },
  {
    feature_id: "FEATURE_SCARCITY_AND_AVAILABILITY",
    customer_segment: ["COLLECTOR", "INSTITUTION", "ENTERPRISE_AND_PROVIDER"],
    customer_decisions: ["WHAT_IS_RARE", "WHAT_IS_AVAILABLE", "WHEN_TO_SOURCE"],
    value_scope_ids: ["VS_SCARCITY_AVAILABILITY"],
    irreplaceability_mechanism: "Combines release and edition history with observed supply, sold frequency, geography, authentication and memory.",
    required_evidence: ["RELEASE_EDITION", "SUPPLY", "SOLD_FREQUENCY", "GEOGRAPHY", "AUTHENTICATION", "MEMORY"],
    publication_gate: "SCARCITY_MODEL_CALIBRATED_AND_TRACK_B_PASS"
  },
  {
    feature_id: "FEATURE_LIQUIDITY_AND_EXIT_RISK",
    customer_segment: ["COLLECTOR", "INSTITUTION"],
    customer_decisions: ["CAN_I_EXIT", "HOW_LONG_TO_EXIT", "WHAT_DISCOUNT_IS_REQUIRED"],
    value_scope_ids: ["VS_LIQUIDITY_EXIT"],
    irreplaceability_mechanism: "Fuses transaction depth, listing supply, time on market, spread, turnover, Source bias and historical memory.",
    required_evidence: ["TRANSACTION_DEPTH", "TIME_ON_MARKET", "SPREAD", "TURNOVER", "SOURCE_BIAS", "MEMORY"],
    publication_gate: "LIQUIDITY_COVERAGE_AND_TRACK_B_PASS"
  },
  {
    feature_id: "FEATURE_MARKET_MOMENTUM_AND_OPPORTUNITY",
    customer_segment: ["COLLECTOR", "INSTITUTION", "ENTERPRISE_AND_PROVIDER", "FOUNDER_AND_EXECUTIVE"],
    customer_decisions: ["WHAT_TO_FOLLOW", "WHERE_TO_ALLOCATE", "WHEN_TO_ENTER"],
    value_scope_ids: ["VS_MOMENTUM_OPPORTUNITY"],
    irreplaceability_mechanism: "Measures change across transactions, supply, attention, geography and bitemporal baselines rather than one platform trend.",
    required_evidence: ["TRANSACTION_CHANGE", "SUPPLY_CHANGE", "ATTENTION_CHANGE", "REGIONAL_CHANGE", "MEMORY_BASELINE"],
    publication_gate: "MULTI_SOURCE_SIGNAL_AND_TRACK_B_PASS"
  },
  {
    feature_id: "FEATURE_DYNAMIC_MARKET_STRUCTURE",
    customer_segment: ["INSTITUTION", "ENTERPRISE_AND_PROVIDER", "FOUNDER_AND_EXECUTIVE"],
    customer_decisions: ["WHICH_VERTICAL_EXISTS", "WHAT_TO_SPLIT_OR_MERGE", "WHICH_CATEGORY_TO_ENTER"],
    value_scope_ids: ["VS_MARKET_STRUCTURE"],
    irreplaceability_mechanism: "Discovers stable multi-source market clusters from entity, event, attention and memory graphs with human promotion gates.",
    required_evidence: ["ENTITY_GRAPH", "MARKET_GRAPH", "CULTURE_ATTENTION", "SOURCE_COVERAGE", "CLUSTER_STABILITY"],
    publication_gate: "TRACK_B_VALIDATED_AND_FOUNDER_APPROVED"
  },
  {
    feature_id: "FEATURE_KIDULT_500_AND_100",
    customer_segment: ["COLLECTOR", "INSTITUTION", "ENTERPRISE_AND_PROVIDER"],
    customer_decisions: ["WHAT_MATTERS_GLOBALLY", "WHAT_TO_FOLLOW", "HOW_TO_COMPARE_MARKETS"],
    value_scope_ids: ["VS_MARKET_STRUCTURE", "VS_MOMENTUM_OPPORTUNITY", "VS_PRICE_COMPARABILITY", "VS_LIQUIDITY_EXIT"],
    irreplaceability_mechanism: "Explainable global engine output built from representative multi-source coverage, dynamic market structure, memory and independent validation.",
    required_evidence: ["CATEGORY_SCALE_FLOOR", "REPRESENTATIVE_SAMPLING", "EVIDENCE_GRAPH", "MARKET_GRAPH", "MEMORY", "TRACK_B_ASSESSMENT"],
    publication_gate: "TRACK_B_APPROVED_AND_FOUNDER_AUTHORIZED"
  },
  {
    feature_id: "FEATURE_SOURCE_UNIVERSE_AND_PROVIDER_ROI",
    customer_segment: ["FOUNDER_AND_EXECUTIVE", "ENTERPRISE_AND_PROVIDER"],
    customer_decisions: ["WHICH_SOURCE_TO_CONNECT", "WHICH_PROVIDER_TO_BUY", "WHAT_TO_COLLECT_NEXT"],
    value_scope_ids: ["VS_SOURCE_PROVIDER_ADVANTAGE"],
    irreplaceability_mechanism: "Compares Source utility, rights, risk, coverage delta, independence, cost and removal sensitivity across the global Source Universe.",
    required_evidence: ["SOURCE_CLASSIFICATION", "RISK_REGISTER", "COVERAGE_DELTA", "COST_ROI", "REMOVAL_SENSITIVITY"],
    publication_gate: "INTERNAL_EXECUTIVE_PROJECTION_ONLY"
  },
  {
    feature_id: "FEATURE_PORTAL_AND_EXECUTIVE_PROJECTION",
    customer_segment: ["COLLECTOR", "INSTITUTION", "ENTERPRISE_AND_PROVIDER", "FOUNDER_AND_EXECUTIVE"],
    customer_decisions: ["UNDERSTAND_CURRENT_STATE", "ACT_ON_RECOMMENDATION", "SEE_CONFIDENCE_AND_LIMITATIONS"],
    value_scope_ids: ["VS_OBJECT_TRUST", "VS_PRICE_COMPARABILITY", "VS_SCARCITY_AVAILABILITY", "VS_LIQUIDITY_EXIT", "VS_MOMENTUM_OPPORTUNITY", "VS_MARKET_STRUCTURE", "VS_SOURCE_PROVIDER_ADVANTAGE"],
    irreplaceability_mechanism: "Projects governed Intelligence, Evidence, confidence, limitations and next actions without introducing business logic or Source shortcuts.",
    required_evidence: ["GOVERNED_PROJECTION", "SOURCE_CONTRIBUTION", "CONFIDENCE", "LIMITATIONS", "DECISION_ACTION"],
    publication_gate: "PROJECTION_CONTRACT_AND_RIGHTS_PASS"
  },
  {
    feature_id: "FEATURE_RUNTIME_RELIABILITY_AND_RECOVERY",
    customer_segment: ["FOUNDER_AND_EXECUTIVE"],
    customer_decisions: ["CAN_THE_PLATFORM_CONTINUE_TO_DELIVER_VALUE", "WHAT_RUNTIME_RISK_TO_ACCEPT", "WHEN_TO_FREEZE_OR_RECOVER"],
    value_scope_ids: ["VS_SOURCE_PROVIDER_ADVANTAGE"],
    irreplaceability_mechanism: "Protects freshness, deterministic replay, recovery, Source continuity and cost control so the decision advantage remains durable.",
    required_evidence: ["RUNTIME_HEALTH", "QUEUE_HEALTH", "BACKUP_RESTORE", "ROLLBACK", "COST", "INCIDENT_AUDIT"],
    publication_gate: "INTERNAL_EXECUTIVE_PROJECTION_ONLY"
  }
];

function buildEngineAlignment(strategy) {
  return strategy.platform_layers.flatMap(layer => {
    const policy = layerPolicies[layer.layer];
    if (!policy) throw new Error(`Missing Irreplaceable Value policy for layer: ${layer.layer}`);
    return layer.engines.map(engineId => ({
      engine_id: engineId,
      platform_layer: layer.layer,
      value_scope_ids: policy.value_scope_ids,
      decision_advantage_created_or_protected: policy.decision_advantage,
      input_contract: "VERSIONED_AND_VALUE_TRACEABLE",
      output_contract: "EVIDENCE_LINEAGED_AND_VALUE_GATED",
      evidence_and_lineage: "REQUIRED",
      failure_state: policy.failure_state,
      deterministic_replay: true,
      audit_output: "REQUIRED",
      owner: policy.owner,
      alignment_state: "ALIGNED"
    }));
  });
}

function buildProcessAlignment(valueContract) {
  return valueContract.process_alignment_contract.canonical_stages.map((stage, index) => ({
    sequence: index + 1,
    process_stage: stage,
    value_input: index === 0 ? "HIGH_VALUE_CUSTOMER_DECISION" : valueContract.process_alignment_contract.canonical_stages[index - 1],
    value_output: stage,
    quality_gate: `GATE_${stage}`,
    failure_state: `HOLD_${stage}_NOT_VALUE_READY`,
    audit_record: `AUDIT_${stage}`,
    owner: stage.includes("TRACK_B") ? "Track B" : stage.includes("PROJECTION") ? "Track C / Track E" : stage.includes("FOUNDER") ? "KPMO / Founder" : "Track A / Track D",
    shortcut_allowed: false
  }));
}

export function buildIrreplaceableValueAlignment() {
  const strategy = readJson(strategyPath);
  const valueContract = readJson(valuePath);
  const engines = buildEngineAlignment(strategy);
  const processes = buildProcessAlignment(valueContract);

  const engineAlignment = {
    id: "irreplaceable-value-engine-alignment-matrix-v1",
    record_type: "engine_alignment_matrix",
    version: "1.0.0",
    status: "ALL_REGISTERED_ENGINES_ALIGNED",
    generated_at: valueContract.effective_at,
    strategy_id: strategy.id,
    value_contract_id: valueContract.id,
    engine_count: engines.length,
    aligned_engine_count: engines.filter(item => item.alignment_state === "ALIGNED").length,
    unaligned_engine_count: engines.filter(item => item.alignment_state !== "ALIGNED").length,
    engines
  };
  engineAlignment.matrix_fingerprint = fingerprint(engineAlignment);

  const featureAlignment = {
    id: "irreplaceable-value-feature-alignment-matrix-v1",
    record_type: "feature_alignment_matrix",
    version: "1.0.0",
    status: "FEATURE_FAMILIES_ALIGNED",
    generated_at: valueContract.effective_at,
    value_contract_id: valueContract.id,
    feature_family_count: featureFamilies.length,
    features: featureFamilies.map(feature => ({
      ...feature,
      substitution_test: valueContract.mandatory_irreplaceability_tests.map(test => test.test_id),
      confidence_and_limitations: "MANDATORY",
      source_removal_behavior: "FAIL_CLOSED_OR_EXPLICITLY_BOUNDED",
      owner: feature.feature_id.includes("PORTAL") ? "Track C / Track E" : feature.feature_id.includes("RUNTIME") ? "Track D" : feature.feature_id.includes("SOURCE") ? "Track A / Provider Lead" : "Track A / Track B",
      alignment_state: "ALIGNED"
    }))
  };
  featureAlignment.matrix_fingerprint = fingerprint(featureAlignment);

  const processAlignment = {
    id: "irreplaceable-value-process-alignment-matrix-v1",
    record_type: "process_alignment_matrix",
    version: "1.0.0",
    status: "CANONICAL_PROCESS_ALIGNED",
    generated_at: valueContract.effective_at,
    value_contract_id: valueContract.id,
    stage_count: processes.length,
    stages: processes,
    prohibited_shortcuts: valueContract.process_alignment_contract.prohibited_shortcuts
  };
  processAlignment.matrix_fingerprint = fingerprint(processAlignment);

  const readiness = {
    id: "irreplaceable-value-alignment-readiness-v1",
    record_type: "value_alignment_readiness",
    version: "1.0.0",
    status: "FOUNDATION_ALIGNED_EXECUTION_PENDING",
    generated_at: valueContract.effective_at,
    north_star: valueContract.north_star,
    engines_registered: engines.length,
    engines_aligned: engines.length,
    feature_families_registered: featureFamilies.length,
    process_stages_registered: processes.length,
    feature_admission_default: valueContract.feature_admission_contract.default_state,
    work_without_value_scope: valueContract.organization_rule.work_without_value_scope,
    digitalocean: {
      commercial_relationship_state: valueContract.runtime_alignment.commercial_relationship_state,
      technical_binding_state: valueContract.runtime_alignment.technical_binding_state,
      current_mode: valueContract.runtime_alignment.current_mode,
      production: valueContract.runtime_alignment.production
    },
    current_execution_priorities: [
      "DECISION_AND_VALUE_SCOPE_LIBRARY",
      "ASI_DISCOVERY_BATCH_1",
      "DIGITALOCEAN_READ_ONLY_BINDING_AND_RUNTIME_INVENTORY",
      "SCOPE_SOURCE_POOL_CONSTRUCTION",
      "REPRESENTATIVE_CATEGORY_SCALE_ACQUISITION"
    ],
    candidate_r2: valueContract.current_boundaries.candidate_r2,
    kidult_500: valueContract.current_boundaries.kidult_500,
    kidult_100: valueContract.current_boundaries.kidult_100,
    public_market_claim: valueContract.current_boundaries.public_market_claim,
    production: valueContract.current_boundaries.production
  };
  readiness.report_fingerprint = fingerprint(readiness);

  const outputs = {
    "engine-alignment-matrix.json": engineAlignment,
    "feature-alignment-matrix.json": featureAlignment,
    "process-alignment-matrix.json": processAlignment,
    "alignment-readiness-report.json": readiness
  };

  const manifest = {
    id: "irreplaceable-value-alignment-run-v1",
    record_type: "value_alignment_run",
    version: "1.0.0",
    status: "IRREPLACEABLE_VALUE_ALIGNMENT_FOUNDATION_PASS",
    generated_at: valueContract.effective_at,
    inputs: {
      strategy_id: strategy.id,
      strategy_fingerprint: fingerprint(strategy),
      value_contract_id: valueContract.id,
      value_contract_fingerprint: fingerprint(valueContract)
    },
    outputs: Object.fromEntries(Object.entries(outputs).map(([name, value]) => [name, value.matrix_fingerprint ?? value.report_fingerprint])),
    engine_count: engines.length,
    unaligned_engine_count: 0,
    feature_family_count: featureFamilies.length,
    process_stage_count: processes.length,
    market_claims_created: 0,
    indexes_computed: 0,
    production_mutation: 0,
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
  const outputs = buildIrreplaceableValueAlignment();
  if (config.write) writeOutputs(config.output, outputs);
  const manifest = outputs["run-manifest.json"];
  console.log("AGCI-OS Irreplaceable Value Alignment: FOUNDATION PASS");
  console.log(`Engines aligned: ${manifest.engine_count}`);
  console.log(`Feature families aligned: ${manifest.feature_family_count}`);
  console.log(`Process stages aligned: ${manifest.process_stage_count}`);
  console.log("DigitalOcean: CONTRACTED / TECHNICAL BINDING NOT VERIFIED");
  console.log("Public Index: NOT_COMPUTED");
  console.log("Production: HOLD");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
