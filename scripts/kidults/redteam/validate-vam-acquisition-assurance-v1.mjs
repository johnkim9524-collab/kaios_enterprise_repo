#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const paths = {
  producer: ".github/workflows/kidults-autonomous-vam-fashion-sample.yml",
  assurance: ".github/workflows/kidults-platform-continuous-assurance-v1.yml",
  candidate: ".github/workflows/kidults-agci-os-candidate-r2-preflight.yml",
  crossSource: ".github/workflows/kidults-autonomous-fashion-cross-source.yml",
  legacyWorkflow: ".github/workflows/kidults-self-collected-open-channel-expansion-wave2.yml",
  collector: "scripts/kidults/autonomous/collect-vam-fashion-sample.mjs",
  validator: "scripts/kidults/autonomous/validate-vam-fashion-sample.mjs",
  legacyCollector: "scripts/kidults/scope/run-self-collected-open-channel-expansion-v2.mjs",
  contract: "coordination/kidults/autonomous/source-discovery/contracts/vam-fashion-collections-r1.json"
};
const exactGroup = "group: kidults-vam-public-source-read-hold";
const requiredWatch = "- 'KIDULTS Autonomous V&A Fashion Sample'";
const forbiddenEndpoint = "https://api." + "vam.ac.uk";
const receiptSecret = "KIDULTS_VAM_RIGHTS_SCOPE_RECEIPT_B64";

function runtimeSourceFiles(root) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...runtimeSourceFiles(file));
    else if (/\.(?:mjs|js|ya?ml)$/.test(entry.name)) files.push(file);
  }
  return files;
}

function repoEndpointReferences() {
  return [".github/workflows", "scripts/kidults"]
    .flatMap(runtimeSourceFiles)
    .filter(file => fs.readFileSync(file, "utf8").includes(forbiddenEndpoint));
}

function validate(input) {
  const failures = [];
  if (!input.producer.includes(exactGroup) || !/^\s*cancel-in-progress:\s*false\s*$/m.test(input.producer)) {
    failures.push("VAM_HOLD_WORKFLOW_SERIALIZATION_MISSING");
  }
  if (!input.assurance.includes(requiredWatch)) failures.push("VAM_ASSURANCE_WATCH_MISSING");
  if (/^\s*schedule:\s*$/m.test(input.producer)) failures.push("VAM_UNGATED_STANDALONE_SCHEDULE_PRESENT");
  if (!input.candidate.includes('- cron: "5 0 * * 3,6"')) failures.push("VAM_GOVERNED_SCHEDULE_MISSING");
  if ([input.producer, input.candidate].some(value => value.includes(receiptSecret) || value.includes("KIDULTS_VAM_RIGHTS_SCOPE:"))) {
    failures.push("VAM_UNVERIFIED_RECEIPT_OR_SCOPE_BOUND_TO_WORKFLOW");
  }
  if (!input.candidate.includes("provider call count remains zero and Candidate R2 remains HOLD") ||
      !input.candidate.includes("receipt_fingerprint") || !input.candidate.includes("runtime_lineage: vam.runtime_lineage") ||
      !input.candidate.includes("vam.runtime_lineage?.git_sha !== process.env.GITHUB_SHA") ||
      !input.candidate.includes("vam.runtime_lineage?.github_run_id !== Number(process.env.GITHUB_RUN_ID)") ||
      !input.candidate.includes("vam.runtime_lineage?.github_run_attempt !== Number(process.env.GITHUB_RUN_ATTEMPT)")) {
    failures.push("VAM_CANDIDATE_HARD_HOLD_RECEIPT_INCOMPLETE");
  }
  if (!input.validator.includes("manifest?.runtime_lineage?.git_sha === process.env.GITHUB_SHA") ||
      !input.validator.includes("manifest?.runtime_lineage?.github_run_id === Number(process.env.GITHUB_RUN_ID)") ||
      !input.validator.includes("manifest?.runtime_lineage?.github_run_attempt === Number(process.env.GITHUB_RUN_ATTEMPT)")) {
    failures.push("VAM_VALIDATOR_EXACT_RUNTIME_LINEAGE_MISSING");
  }
  if (!input.collector.includes('status: "HOLD_EXTERNAL_RIGHTS_VERIFIER_NOT_IMPLEMENTED"') ||
      !input.collector.includes('reason: "EXTERNAL_RIGHTS_VERIFIER_NOT_IMPLEMENTED"') ||
      !/^\s*authorized:\s*false,\s*$/m.test(input.collector) ||
      !input.collector.includes("provider_call_count: 0") ||
      !input.collector.includes("license_provenance_created: false") ||
      input.collector.includes("fetch(") || input.collector.includes(forbiddenEndpoint) ||
      input.collector.includes("buildLicenseProvenance") || input.collector.includes('status: "COMPLETED"')) {
    failures.push("VAM_COLLECTOR_NOT_UNREACHABLE_HARD_HOLD");
  }
  if (input.legacyCollector.includes(forbiddenEndpoint) ||
      !input.legacyCollector.includes("VAM_COLLECTIONS_API: 0") ||
      !input.legacyCollector.includes('state: "HOLD_EXTERNAL_RIGHTS_VERIFIER_NOT_IMPLEMENTED"') ||
      !input.legacyCollector.includes("vam_license_provenance_created: false")) {
    failures.push("VAM_LEGACY_WAVE2_PROVIDER_PATH_OPEN");
  }
  if (!input.legacyWorkflow.includes("retention-days: 28")) failures.push("VAM_LEGACY_RETENTION_BOUNDARY_INVALID");
  if (!input.crossSource.includes("if: github.ref == 'refs/heads/main'") ||
      !input.crossSource.includes("Verify exact current main before public-source read") ||
      !input.crossSource.includes("retention-days: 28")) {
    failures.push("VAM_CROSS_SOURCE_ARBITRARY_REF_PATH_OPEN");
  }
  if (input.endpointReferences.length) failures.push(`VAM_RUNTIME_ENDPOINT_REFERENCE_PRESENT:${input.endpointReferences.join("+")}`);
  if (input.contract.status !== "IMPLEMENTED_SCHEDULED_READ_CAPABLE_RIGHTS_SCOPE_HOLD" ||
      input.contract.admission_class !== "REFERENCE_DISCOVERY_ONLY" || input.contract.current_sold_eligible !== false ||
      input.contract.scheduled_activation?.runtime_activation !== "HOLD_EXTERNAL_RIGHTS_VERIFIER_NOT_IMPLEMENTED" ||
      input.contract.scheduled_activation?.workflow_receipt_secret_binding !== "NONE_EXTERNAL_RIGHTS_VERIFIER_NOT_IMPLEMENTED" ||
      input.contract.scheduled_activation?.runtime_receipt_evaluation !== "DISABLED_UNTIL_EXTERNAL_VERIFIER_IMPLEMENTED" ||
      input.contract.scheduled_activation?.license_provenance_creation !== "BLOCKED_UNTIL_EXTERNAL_VERIFIER_IMPLEMENTED" ||
      input.contract.scheduled_activation?.provider_call_count_while_blocked !== 0 ||
      input.contract.rights_provenance?.cache_retention_days_max !== 28) {
    failures.push("VAM_RIGHTS_HARD_HOLD_CONTRACT_INVALID");
  }
  if (failures.length) throw new Error(failures.join(","));
}

const input = {
  producer: fs.readFileSync(paths.producer, "utf8"),
  assurance: fs.readFileSync(paths.assurance, "utf8"),
  candidate: fs.readFileSync(paths.candidate, "utf8"),
  crossSource: fs.readFileSync(paths.crossSource, "utf8"),
  legacyWorkflow: fs.readFileSync(paths.legacyWorkflow, "utf8"),
  collector: fs.readFileSync(paths.collector, "utf8"),
  validator: fs.readFileSync(paths.validator, "utf8"),
  legacyCollector: fs.readFileSync(paths.legacyCollector, "utf8"),
  contract: JSON.parse(fs.readFileSync(paths.contract, "utf8")),
  endpointReferences: repoEndpointReferences()
};
validate(input);

const mutations = [
  { id: "HARD_HOLD_AUTHORIZED", patch: value => ({ ...value, collector: value.collector.replace(/^\s*authorized:\s*false,\s*$/m, "    authorized: true,") }) },
  { id: "VAM_ENDPOINT_REINTRODUCED", patch: value => ({ ...value, collector: `${value.collector}\n// ${forbiddenEndpoint}/v2/objects/search\n` }) },
  { id: "SECRET_BOUND", patch: value => ({ ...value, candidate: `${value.candidate}\n# secrets.${receiptSecret}\n` }) },
  { id: "LEGACY_CALL_REINTRODUCED", patch: value => ({ ...value, legacyCollector: `${value.legacyCollector}\n// ${forbiddenEndpoint}\n` }) },
  { id: "CROSS_SOURCE_EXACT_MAIN_REMOVED", patch: value => ({ ...value, crossSource: value.crossSource.replace("if: github.ref == 'refs/heads/main'", "if: always()") }) },
  { id: "LEGACY_RETENTION_90", patch: value => ({ ...value, legacyWorkflow: value.legacyWorkflow.replace("retention-days: 28", "retention-days: 90") }) },
  { id: "EXACT_RUN_LINEAGE_WEAKENED", patch: value => ({ ...value, validator: value.validator.replace("manifest?.runtime_lineage?.git_sha === process.env.GITHUB_SHA", "/^[a-f0-9]{40}$/.test(manifest?.runtime_lineage?.git_sha ?? '')") }) },
  { id: "CANDIDATE_HOLD_LINEAGE_REMOVED", patch: value => ({ ...value, candidate: value.candidate.replace("vam.runtime_lineage?.git_sha !== process.env.GITHUB_SHA", "false") }) }
];
const rejected = [];
for (const mutation of mutations) {
  try {
    const changed = mutation.patch(input);
    if (mutation.id.includes("ENDPOINT") || mutation.id.includes("LEGACY_CALL")) changed.endpointReferences = ["MUTATION"];
    validate(changed);
  } catch {
    rejected.push(mutation.id);
  }
}
if (rejected.length !== mutations.length) {
  throw new Error(`MUTATION_NOT_REJECTED:${mutations.filter(item => !rejected.includes(item.id)).map(item => item.id).join(",")}`);
}

console.log(JSON.stringify({
  schema_version: "1.1.0",
  receipt_type: "KIDULTS_VAM_ACQUISITION_ASSURANCE_INVARIANT",
  state: "VERIFIED_PASS",
  rights_boundary: "PROVIDER_CALLS_ZERO_REPO_WIDE_EXTERNAL_VERIFIER_HOLD",
  protected_boundary: "NO_LICENSE_PROVENANCE_NO_EVIDENCE_NO_CANDIDATE",
  runtime_endpoint_references: 0,
  mutations_total: mutations.length,
  mutations_rejected: rejected.length,
  rejected
}, null, 2));
