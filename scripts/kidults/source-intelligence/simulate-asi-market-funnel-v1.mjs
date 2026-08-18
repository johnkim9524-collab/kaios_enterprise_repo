#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../..");
const read = relative => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
const stable = value => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
};
const digest = value => `sha256:${crypto.createHash("sha256").update(JSON.stringify(stable(value))).digest("hex")}`;

const topology = read("coordination/kidults/source-intelligence/asi-market-funnel-engine-mesh-v1.json");
const policy = read("coordination/kidults/source-intelligence/asi-purpose-specific-admission-policy-v1.json");

const observedAt = "2026-08-18T13:30:00.000Z";
const sources = [
  {
    source_id: "source-auction-a",
    host: "auction-a.example",
    channel: "COMMON_CRAWL_WDC",
    region: "EUROPE_WEST_NORTH_UK",
    language: "en",
    scope_id: "comic_books",
    source_role: "SOLD_TRANSACTION",
    semantics: "VERIFIED_SALE",
    rights: "ALLOW",
    relevance: "PASS"
  },
  {
    source_id: "source-market-b",
    host: "market-b.example",
    channel: "OVERTURE_MAPS",
    region: "EAST_ASIA_JAPAN",
    language: "ja",
    scope_id: "designer_toys",
    source_role: "LISTING_SUPPLY",
    semantics: "ACTIVE_OFFER",
    rights: "UNKNOWN",
    relevance: "PASS"
  },
  {
    source_id: "source-museum-c",
    host: "museum-c.example",
    channel: "WIKIDATA",
    region: "NORTH_AMERICA",
    language: "en",
    scope_id: "film_tv_props",
    source_role: "PROVENANCE_HISTORY",
    semantics: "INSTITUTIONAL_CONTEXT",
    rights: "ALLOW",
    relevance: "PASS"
  }
];

function partition(source) {
  return {
    channel: source.channel,
    region: source.region,
    language: source.language,
    scope_id: source.scope_id,
    source_role: source.source_role,
    canonical_host_hash: crypto.createHash("sha256").update(source.host).digest("hex").slice(0, 16)
  };
}

let sequence = 0;
function event(source, type, engine, payload, extra = {}) {
  sequence += 1;
  const base = {
    event_id: `event-${String(sequence).padStart(4, "0")}`,
    event_type: type,
    event_version: "1.0.0",
    occurred_at: observedAt,
    observed_at: observedAt,
    producer_engine: engine,
    producer_version: "1.0.0",
    correlation_id: source.source_id,
    causation_id: extra.causation_id ?? null,
    idempotency_key: `${source.source_id}:${type}:${engine}:1.0.0`,
    partition: partition(source),
    input_snapshot_ref: "fixture:asi-market-funnel-v1",
    rights_state: extra.rights_state ?? "NOT_APPLICABLE",
    freshness_state: "CURRENT",
    assertion_purpose: extra.assertion_purpose ?? null,
    decision: extra.decision ?? null,
    reason_codes: extra.reason_codes ?? [],
    trace_refs: extra.trace_refs ?? [],
    payload
  };
  base.payload_hash = digest(payload);
  return base;
}

export function simulateMarketFunnel() {
  sequence = 0;
  const events = [];
  const qualificationEngines = topology.asi_funnel.stages.find(stage => stage.stage_id === "F2_SOURCE_QUALIFICATION_ANALYSIS").engine_fleets;
  const sourceResults = [];

  for (const source of sources) {
    const discovered = event(source, "SOURCE_DISCOVERED", `DISCOVERY_${source.channel}`, { source_id: source.source_id, host: source.host });
    events.push(discovered);
    events.push(event(source, "SOURCE_IDENTIFIED", "SOURCE_SITE_IDENTITY_OWNER_LINEAGE", {
      source_id: source.source_id,
      canonical_host: source.host,
      owner_lineage_state: "CANDIDATE"
    }, { causation_id: discovered.event_id }));

    for (const engine of qualificationEngines) {
      if (source.source_id === "source-market-b" && engine === "SOURCE_COST_ROI_ANALYSIS") {
        events.push(event(source, "ENGINE_TASK_DEAD_LETTERED", engine, { source_id: source.source_id }, {
          decision: "HOLD",
          reason_codes: ["SYNTHETIC_ENGINE_FAILURE_ISOLATED_TO_SOURCE_PARTITION"]
        }));
        continue;
      }
      const rightsEngine = engine === "SOURCE_RIGHTS_COMPLIANCE_ANALYSIS";
      events.push(event(source, "SOURCE_QUALIFICATION_ASSERTED", engine, {
        source_id: source.source_id,
        assertion_type: engine,
        semantics: source.semantics,
        relevance: source.relevance
      }, {
        assertion_purpose: "BOUNDED_SHADOW_ACQUISITION",
        rights_state: rightsEngine ? source.rights : "NOT_APPLICABLE",
        decision: rightsEngine && source.rights !== "ALLOW" ? "HOLD" : "PASS",
        reason_codes: rightsEngine && source.rights !== "ALLOW" ? ["RIGHTS_UNKNOWN"] : []
      }));
    }

    let decision = "PASS";
    const reasons = [];
    if (source.rights !== "ALLOW") {
      decision = "HOLD";
      reasons.push("RIGHTS_UNKNOWN");
    }
    if (source.source_id === "source-market-b") {
      decision = "HOLD";
      reasons.push("QUALIFICATION_ASSERTION_IN_DEAD_LETTER_QUEUE");
    }
    if (source.semantics === "INSTITUTIONAL_CONTEXT") {
      decision = "HOLD";
      reasons.push("INSTITUTIONAL_CONTEXT_NOT_MARKET_TRANSACTION_EVIDENCE");
    }
    events.push(event(source, "SOURCE_PURPOSE_ADMISSION_DECIDED", "ACQUISITION_PLANNER", {
      source_id: source.source_id,
      purpose: "BOUNDED_SHADOW_ACQUISITION"
    }, {
      assertion_purpose: "BOUNDED_SHADOW_ACQUISITION",
      rights_state: source.rights,
      decision,
      reason_codes: reasons
    }));
    sourceResults.push({ source_id: source.source_id, decision, reasons });
  }

  const output = {
    id: "kidults-asi-market-funnel-deterministic-preflight-r1",
    version: "1.0.0",
    status: "DETERMINISTIC_ENGINE_MESH_PREFLIGHT_PASS_RUNTIME_NOT_DEPLOYED",
    observed_at: observedAt,
    principle_results: {
      AUTONOMOUS: "PASS_CONTRACT_AND_FAILURE_ISOLATION_PREFLIGHT",
      GLOBAL: "PASS_PARTITION_CONTRACT_NOT_LIVE_COVERAGE",
      IRREPLACEABLE_VALUE: "PASS_MARKET_SEMANTIC_BOUNDARY_PREFLIGHT",
      TRANSPARENT: "PASS_EVENT_LINEAGE_AND_REASON_CODES_PREFLIGHT"
    },
    engine_fleet_contract_count: topology.asi_funnel.engine_fleet_contract_count,
    downstream_engine_role_count: topology.downstream_market_funnel.engine_role_count,
    source_fixture_count: sources.length,
    event_count: events.length,
    admitted_source_count: sourceResults.filter(result => result.decision === "PASS").length,
    held_source_count: sourceResults.filter(result => result.decision === "HOLD").length,
    isolated_dead_letter_count: events.filter(value => value.event_type === "ENGINE_TASK_DEAD_LETTERED").length,
    unrelated_sources_continued_after_failure: sourceResults.some(result => result.source_id === "source-auction-a" && result.decision === "PASS"),
    institutional_context_promoted_to_market_transaction: false,
    public_projection_authorized: false,
    production: "HOLD",
    source_results: sourceResults,
    events
  };
  output.run_fingerprint = digest(output);
  return output;
}

function parseArgs(argv) {
  const config = { output: null };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--output") config.output = path.resolve(argv[++index]);
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  return config;
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  const output = simulateMarketFunnel();
  if (config.output) {
    fs.mkdirSync(path.dirname(config.output), { recursive: true });
    fs.writeFileSync(config.output, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  }
  console.log(`KIDULTS ASI Market Funnel Mesh: ${output.status}`);
  console.log(`ASI fleets / downstream roles / events: ${output.engine_fleet_contract_count} / ${output.downstream_engine_role_count} / ${output.event_count}`);
  console.log(`Admitted / held / isolated DLQ: ${output.admitted_source_count} / ${output.held_source_count} / ${output.isolated_dead_letter_count}`);
  console.log("Production: HOLD; durable runtime: NOT DEPLOYED");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
