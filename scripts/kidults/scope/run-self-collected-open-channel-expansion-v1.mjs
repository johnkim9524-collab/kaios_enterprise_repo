#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const selectionPath = process.argv[2] ?? "coordination/kidults/scope-data/scope-poc-anchor-selection-v1.json";
const topologyPath = process.argv[3] ?? "coordination/kidults/scope-data/self-collected-open-channel-topology-v1.json";
const outputDirectory = process.argv[4] ?? "scope-open-wave1-out";

const selection = JSON.parse(fs.readFileSync(selectionPath, "utf8"));
const topology = JSON.parse(fs.readFileSync(topologyPath, "utf8"));
const channels = Array.isArray(topology.channels) ? topology.channels.map(item => item.channel_id) : [];

const receipt = {
  id: "kidults-self-collected-open-channel-expansion-wave1",
  version: "1.1.0",
  status: "HOLD_GOVERNED_MET_OWNER_ONLY",
  reason: "LEGACY_MULTI_PROVIDER_COLLECTOR_DISABLED_SINGLE_GOVERNED_MET_OWNER_REQUIRED",
  scope_count: Array.isArray(selection.records)
    ? new Set(selection.records.map(item => item.target_scope_id)).size
    : 0,
  product_count: Array.isArray(selection.records) ? selection.records.length : 0,
  channels_configured_not_called: channels,
  provider_call_counts: {
    MET_OPEN_ACCESS: 0,
    LOC_JSON_API: 0,
    MUSICBRAINZ_CORE: 0
  },
  provider_call_count: 0,
  requests_executed: 0,
  candidate_count: 0,
  candidates: [],
  evidence_record_count: 0,
  immutable_candidate_evidence_pair_created: false,
  track_b_submission_count: 0,
  track_b_assessment_count: 0,
  current_sold_transaction_count: 0,
  admission_performed: false,
  provider_contact_authorized: false,
  publication: "HOLD",
  production: "HOLD",
  g5: "HOLD",
  release_condition: "USE_ONLY_THE_GOVERNED_MET_SCHEDULE_OWNER_AND_ITS_RIGHTS_TIME_LINEAGE_BOUND_ARTIFACT",
  governed_met_owner_workflow: ".github/workflows/kidults-autonomous-met-sample.yml"
};

fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(
  path.join(outputDirectory, "open-channel-expansion-wave1.json"),
  `${JSON.stringify(receipt, null, 2)}\n`
);

console.error(JSON.stringify({
  status: receipt.status,
  provider_call_count: 0,
  candidate_count: 0,
  production: "HOLD"
}, null, 2));
process.exitCode = 3;
