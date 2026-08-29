#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const paths = {
  met: ".github/workflows/kidults-autonomous-met-sample.yml",
  candidate: ".github/workflows/kidults-agci-os-candidate-r2-preflight.yml",
  crossSource: ".github/workflows/kidults-autonomous-fashion-cross-source.yml",
  assurance: ".github/workflows/kidults-platform-continuous-assurance-v1.yml",
  collector: "scripts/kidults/autonomous/collect-met-open-access-sample.mjs",
  validator: "scripts/kidults/autonomous/validate-met-open-access-sample.mjs",
  offlineTest: "scripts/kidults/engine-v2/test-met-vam-candidate-r2-live-pathway-v1.mjs",
  contract: "coordination/kidults/autonomous/source-discovery/contracts/met-costume-open-access-r1.json",
  legacyAdmission: "scripts/kidults/source-intelligence/run-met-real-source-admission-r1.mjs",
  legacyEntityResolution: "scripts/kidults/entity-resolution/assemble-real-world-er-dataset-r1.mjs",
  legacyOpenChannel: "scripts/kidults/scope/run-self-collected-open-channel-expansion-v1.mjs",
  legacyOpenChannelValidator: "scripts/kidults/scope/validate-self-collected-open-channel-expansion-v1.mjs",
  legacyRuntimeWrapper: "scripts/kidults/runtime/run-real-source-runtime-control-baseline-r1.mjs"
};
const sourceLock = "group: kidults-met-public-source-read";
const collectorCommand = "node scripts/kidults/autonomous/collect-met-open-access-sample.mjs";
const requiredWatch = "- 'KIDULTS Autonomous Met Open Access Sample'";
const allowedCollectorWorkflows = [paths.crossSource, paths.met].sort();
const allowedEndpointFiles = [paths.collector, paths.offlineTest].sort();
const expectedLegacyInvokerJobCount = 24;

function filesUnder(root, pattern) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...filesUnder(file, pattern));
    else if (pattern.test(entry.name)) files.push(file);
  }
  return files;
}

function exactList(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function workflowInventory() {
  const workflowFiles = filesUnder(".github/workflows", /\.ya?ml$/);
  const callers = workflowFiles
    .filter(file => fs.readFileSync(file, "utf8").includes(collectorCommand))
    .sort();
  const scheduledCallers = callers.filter(file => /^\s*schedule:\s*$/m.test(fs.readFileSync(file, "utf8"))).sort();
  return { callers, scheduledCallers };
}

function endpointInventory() {
  return [".github/workflows", "scripts/kidults"]
    .flatMap(root => filesUnder(root, /\.(?:mjs|js|ya?ml)$/))
    .filter(file => file !== "scripts/kidults/redteam/validate-met-acquisition-assurance-v1.mjs")
    .filter(file => fs.readFileSync(file, "utf8").includes("collectionapi.metmuseum.org"))
    .sort();
}

function legacyWorkflowInventory() {
  const commands = Object.values({
    ADMISSION: paths.legacyAdmission,
    ENTITY_RESOLUTION: paths.legacyEntityResolution,
    OPEN_CHANNEL: paths.legacyOpenChannel
  }).map(file => `node ${file}`);
  const invocations = [];
  for (const file of filesUnder(".github/workflows", /\.ya?ml$/)) {
    const content = fs.readFileSync(file, "utf8");
    const lines = content.split("\n");
    const jobsIndex = lines.findIndex(line => /^jobs:\s*$/.test(line));
    if (jobsIndex < 0) continue;
    const jobBlocks = [];
    let currentJob = null;
    for (const line of lines.slice(jobsIndex + 1)) {
      const jobMatch = line.match(/^ {2}([A-Za-z0-9_-]+):\s*(?:#.*)?$/);
      if (jobMatch) {
        if (currentJob) jobBlocks.push(currentJob);
        currentJob = { id: jobMatch[1], lines: [line] };
      } else if (currentJob) {
        currentJob.lines.push(line);
      }
    }
    if (currentJob) jobBlocks.push(currentJob);
    for (const job of jobBlocks) {
      const jobContent = job.lines.join("\n");
      for (const line of job.lines) {
        const command = commands.find(value => line.includes(value));
        if (command) invocations.push({ file, job: job.id, line: line.trim(), content, jobContent, command });
      }
    }
  }
  return invocations;
}

function validate(input) {
  const failures = [];
  for (const [name, workflow] of [["STANDALONE", input.met], ["CROSS_SOURCE", input.crossSource]]) {
    if (!workflow.includes(sourceLock) || !/^\s*cancel-in-progress:\s*false\s*$/m.test(workflow)) {
      failures.push(`MET_PROVIDER_WIDE_SERIALIZATION_MISSING_${name}`);
    }
  }
  if (!input.assurance.includes(requiredWatch)) failures.push("MET_ASSURANCE_WATCH_MISSING");
  if (!input.met.includes('- cron: "30 22 * * *"')) failures.push("MET_SCHEDULE_MISSING");
  if (!input.met.includes("Verify exact current main before public-source read") ||
      !input.crossSource.includes("Verify exact current main before public-source read") ||
      !input.crossSource.includes("if: github.ref == 'refs/heads/main'")) {
    failures.push("MET_EXACT_MAIN_READBACK_MISSING");
  }
  if (input.candidate.includes(collectorCommand) || input.candidate.includes("--met-dir") ||
      !input.candidate.includes("met_call_performed_by_this_workflow: false")) {
    failures.push("MET_CANDIDATE_DEAD_PRODUCER_OR_FALSE_CONSUMER_CLAIM");
  }
  if (!exactList(input.collectorWorkflowCallers, allowedCollectorWorkflows)) {
    failures.push(`MET_UNGOVERNED_COLLECTOR_WORKFLOW:${input.collectorWorkflowCallers.join("+")}`);
  }
  if (!exactList(input.scheduledCollectorWorkflowCallers, [paths.met])) {
    failures.push(`MET_SINGLE_SCHEDULED_OWNER_VIOLATION:${input.scheduledCollectorWorkflowCallers.join("+")}`);
  }
  if (!exactList(input.endpointReferences, allowedEndpointFiles)) {
    failures.push(`MET_RUNTIME_ENDPOINT_REFERENCE_PRESENT:${input.endpointReferences.join("+")}`);
  }
  if (!input.collector.includes('redirect: "error"') ||
      !input.collector.includes("ensureAllowedUrl(response.url || url)") ||
      !input.collector.includes("provider_call_attempted: true") ||
      !input.collector.includes("requestLog.push(logEntry)") ||
      !input.collector.includes("provider_call_count: requestLog.length") ||
      !input.collector.includes("writeProviderReadFailure") ||
      !input.collector.includes('status: "FAILED_PROVIDER_READ"') ||
      !input.collector.includes("payload.objectID !== requestedObjectId") ||
      !input.collector.includes('payload.department !== "The Costume Institute"') ||
      !input.collector.includes("payload?.accessionNumber") ||
      !input.collector.includes("payload?.title") ||
      !input.collector.includes("payload?.objectName") ||
      !input.collector.includes("payload?.objectURL") ||
      !input.collector.includes('objectUrl.hostname !== "www.metmuseum.org"') ||
      !input.collector.includes("response_accepted = false")) {
    failures.push("MET_OBJECT_LINEAGE_SCHEMA_OR_ATTEMPT_CONTROL_MISSING");
  }
  if (!input.validator.includes("manifest?.runtime_lineage?.git_sha === process.env.GITHUB_SHA") ||
      !input.validator.includes("manifest?.runtime_lineage?.github_run_id === Number(process.env.GITHUB_RUN_ID)") ||
      !input.validator.includes("manifest?.runtime_lineage?.github_run_attempt === Number(process.env.GITHUB_RUN_ATTEMPT)") ||
      !input.validator.includes('record.department === "The Costume Institute"') ||
      !input.validator.includes("record.evidence_id === `met:${record.source_object_id}`") ||
      !input.validator.includes("item.metadata?.objectID") ||
      !input.validator.includes("item.source_url?.endsWith(`/objects/${item.source_object_id}`)")) {
    failures.push("MET_VALIDATOR_EXACT_RUN_OBJECT_BINDING_MISSING");
  }
  if (!input.offlineTest.includes("MET_OBJECT_ID_MISMATCH") ||
      !input.offlineTest.includes("MET_OBJECT_DEPARTMENT_NOT_ALLOWED") ||
      !input.offlineTest.includes("MET_OBJECT_RESPONSE_SCHEMA_INVALID") ||
      !input.offlineTest.includes("assertInvalidMetObjectFailsClosed")) {
    failures.push("MET_OBJECT_MUTATION_TESTS_MISSING");
  }
  for (const [name, legacy] of Object.entries(input.legacy)) {
    if (legacy.includes("fetch(") || legacy.includes("collectionapi") || legacy.includes("/public/collection/v1") ||
        !legacy.includes("HOLD_GOVERNED_MET_OWNER_ONLY") || !legacy.includes("provider_call_count") ||
        !legacy.includes("requests_executed") || !legacy.includes("process.exitCode = 3")) {
      failures.push(`MET_LEGACY_PATH_NOT_HARD_HOLD_${name}`);
    }
  }
  const legacyCommands = new Set(input.legacyWorkflowInvocations.map(item => item.command));
  for (const expected of [paths.legacyAdmission, paths.legacyEntityResolution, paths.legacyOpenChannel].map(file => `node ${file}`)) {
    if (!legacyCommands.has(expected)) failures.push(`MET_LEGACY_WORKFLOW_INVENTORY_MISSING:${expected}`);
  }
  if (input.legacyWorkflowInvocations.length !== expectedLegacyInvokerJobCount) {
    failures.push(`MET_LEGACY_WORKFLOW_INVENTORY_COUNT:${input.legacyWorkflowInvocations.length}`);
  }
  for (const invocation of input.legacyWorkflowInvocations) {
    if (/\|\||&&\s*true|;\s*true/.test(invocation.line) || /continue-on-error:\s*true/.test(invocation.content)) {
      failures.push(`MET_LEGACY_HOLD_EXIT_MASKED:${invocation.file}`);
    }
    if (!/^ {4}if: \$\{\{ false \}\}\s*$/m.test(invocation.jobContent)) {
      failures.push(`MET_LEGACY_INVOKER_JOB_NOT_LITERAL_FALSE:${invocation.file}:${invocation.job}`);
    }
    if (!/^ {4}# HOLD: retired legacy invoker;/m.test(invocation.jobContent)) {
      failures.push(`MET_LEGACY_INVOKER_JOB_HOLD_COMMENT_MISSING:${invocation.file}:${invocation.job}`);
    }
  }
  if (!input.legacyRuntimeWrapper.includes("r.status !== 0") ||
      !input.legacyRuntimeWrapper.includes("run-met-real-source-admission-r1.mjs")) {
    failures.push("MET_LEGACY_RUNTIME_WRAPPER_NONZERO_NOT_FAIL_CLOSED");
  }
  if (!input.legacyOpenChannelValidator.includes("HOLD_VERIFIED") ||
      !input.legacyOpenChannelValidator.includes("process.exitCode = 3") ||
      input.legacyOpenChannelValidator.includes('status:"PASS"') ||
      input.legacyOpenChannelValidator.includes('status: "PASS"')) {
    failures.push("MET_LEGACY_DOWNSTREAM_FALSE_PASS_OPEN");
  }
  const scheduled = input.contract.scheduled_activation;
  const objectBinding = input.contract.object_response_binding;
  if (input.contract.status !== "APPROVED_FOR_GOVERNED_SCHEDULED_REFERENCE_DISCOVERY" ||
      input.contract.admission_class !== "REFERENCE_DISCOVERY_ONLY" || input.contract.current_sold_eligible !== false ||
      scheduled?.owner_workflow !== paths.met || scheduled?.cadence !== "30 22 * * *" ||
      scheduled?.single_scheduled_live_producer !== true || scheduled?.candidate_workflow_provider_call_count !== 0 ||
      scheduled?.candidate_r2_runtime_state !== "NOT_ACTIVATED_VAM_EXTERNAL_VERIFIER_HARD_HOLD" ||
      scheduled?.provider_wide_concurrency_group !== "kidults-met-public-source-read" ||
      scheduled?.cancel_in_progress !== false ||
      objectBinding?.requested_object_id_must_equal_payload_object_id !== true ||
      objectBinding?.required_department !== "The Costume Institute" ||
      !["objectID", "accessionNumber", "title", "objectName", "department", "objectURL", "isPublicDomain"]
        .every(field => objectBinding?.required_fields?.includes(field)) ||
      input.contract.bounded_limits?.maximum_logical_requests_per_run !== 51 ||
      input.contract.bounded_limits?.maximum_http_attempts_per_run !== 153) {
    failures.push("MET_REFERENCE_DISCOVERY_CONTRACT_INVALID");
  }
  if (failures.length) throw new Error(failures.join(","));
}

const inventory = workflowInventory();
const input = {
  met: fs.readFileSync(paths.met, "utf8"),
  candidate: fs.readFileSync(paths.candidate, "utf8"),
  crossSource: fs.readFileSync(paths.crossSource, "utf8"),
  assurance: fs.readFileSync(paths.assurance, "utf8"),
  collector: fs.readFileSync(paths.collector, "utf8"),
  validator: fs.readFileSync(paths.validator, "utf8"),
  offlineTest: fs.readFileSync(paths.offlineTest, "utf8"),
  contract: JSON.parse(fs.readFileSync(paths.contract, "utf8")),
  collectorWorkflowCallers: inventory.callers,
  scheduledCollectorWorkflowCallers: inventory.scheduledCallers,
  endpointReferences: endpointInventory(),
  legacy: {
    ADMISSION: fs.readFileSync(paths.legacyAdmission, "utf8"),
    ENTITY_RESOLUTION: fs.readFileSync(paths.legacyEntityResolution, "utf8"),
    OPEN_CHANNEL: fs.readFileSync(paths.legacyOpenChannel, "utf8")
  },
  legacyOpenChannelValidator: fs.readFileSync(paths.legacyOpenChannelValidator, "utf8"),
  legacyRuntimeWrapper: fs.readFileSync(paths.legacyRuntimeWrapper, "utf8"),
  legacyWorkflowInvocations: legacyWorkflowInventory()
};
validate(input);

const mutations = [
  { id: "RUN_ID_CONCURRENCY", patch: value => ({ ...value, met: value.met.replace(sourceLock, "group: kidults-met-${{ github.run_id }}") }) },
  { id: "REDIRECT_FOLLOW", patch: value => ({ ...value, collector: value.collector.replace('redirect: "error"', 'redirect: "follow"') }) },
  { id: "OBJECT_ID_BINDING_REMOVED", patch: value => ({ ...value, collector: value.collector.replace("payload.objectID !== requestedObjectId", "false") }) },
  { id: "DEPARTMENT_ALLOWLIST_REMOVED", patch: value => ({ ...value, collector: value.collector.replace('payload.department !== "The Costume Institute"', "false") }) },
  { id: "REQUIRED_SCHEMA_REMOVED", patch: value => ({ ...value, collector: value.collector.replace("payload?.accessionNumber", "payload?.optionalAccession") }) },
  { id: "CANDIDATE_COLLECTOR_REINTRODUCED", patch: value => ({ ...value, candidate: `${value.candidate}\n# ${collectorCommand}\n` }) },
  { id: "SECOND_SCHEDULED_OWNER", patch: value => ({ ...value, scheduledCollectorWorkflowCallers: [paths.candidate, paths.met].sort() }) },
  { id: "LEGACY_ENDPOINT_REINTRODUCED", patch: value => ({ ...value, endpointReferences: [...value.endpointReferences, paths.legacyAdmission].sort() }) },
  { id: "LEGACY_HOLD_EXIT_MASKED", patch: value => ({ ...value, legacyWorkflowInvocations: value.legacyWorkflowInvocations.map((item, index) => index === 0 ? { ...item, line: `${item.line} || true` } : item) }) },
  { id: "LEGACY_INVOKER_JOB_REENABLED", patch: value => ({ ...value, legacyWorkflowInvocations: value.legacyWorkflowInvocations.map((item, index) => index === 0 ? { ...item, jobContent: item.jobContent.replace("if: ${{ false }}", "if: ${{ true }}") } : item) }) },
  { id: "EXACT_RUN_LINEAGE_WEAKENED", patch: value => ({ ...value, validator: value.validator.replace("manifest?.runtime_lineage?.git_sha === process.env.GITHUB_SHA", "/^[a-f0-9]{40}$/.test(manifest?.runtime_lineage?.git_sha ?? '')") }) }
];
const rejected = [];
for (const mutation of mutations) {
  try {
    validate(mutation.patch(input));
  } catch {
    rejected.push(mutation.id);
  }
}
if (rejected.length !== mutations.length) {
  throw new Error(`MUTATION_NOT_REJECTED:${mutations.filter(item => !rejected.includes(item.id)).map(item => item.id).join(",")}`);
}

console.log(JSON.stringify({
  schema_version: "1.3.0",
  receipt_type: "KIDULTS_MET_ACQUISITION_ASSURANCE_INVARIANT",
  state: "VERIFIED_PASS",
  scheduled_live_producer_count: 1,
  scheduled_live_producer: paths.met,
  governed_collector_workflow_count: allowedCollectorWorkflows.length,
  legacy_direct_provider_call_count: 0,
  legacy_workflow_invocations_literal_false: input.legacyWorkflowInvocations.length,
  source_lock: "ALL_REACHABLE_GOVERNED_CALLERS_SERIALIZED_NO_CANCEL",
  object_binding: "REQUEST_ID_PAYLOAD_ID_DEPARTMENT_SCHEMA_EXACT",
  runtime_lineage: "EXACT_SHA_RUN_ID_RUN_ATTEMPT",
  protected_boundary: "REFERENCE_DISCOVERY_NOT_CANDIDATE",
  mutations_total: mutations.length,
  mutations_rejected: rejected.length,
  rejected
}, null, 2));
