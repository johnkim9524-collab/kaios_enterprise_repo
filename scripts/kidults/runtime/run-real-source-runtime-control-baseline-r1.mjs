import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { validateRetiredMetInvokerReceipt } from "./validate-retired-met-hold-receipt-v1.mjs";

const repo = process.cwd();
const output = process.argv[2] || "/tmp/kidults-runtime-control-baseline-r1.json";
const metOutput = "/tmp/met-real-source-admission-r1.json";
const governedOwnerWorkflow = ".github/workflows/kidults-autonomous-met-sample.yml";
const governedContract = "coordination/kidults/autonomous/source-discovery/contracts/met-costume-open-access-r1.json";
const legacyMetRunner = "scripts/kidults/source-intelligence/run-met-real-source-admission-r1.mjs";
const gettyRunner = "scripts/kidults/source-intelligence/run-getty-historical-sale-r1.mjs";
const gettyOutput = "/tmp/getty-historical-sale-r1.json";
const bridgeOutput = "/tmp/asi-real-source-processor-bridge-r1.json";
const queueOutput = "/tmp/asi-real-source-queue-injection-r1.json";
const failureOutput = "/tmp/asi-real-source-retry-dlq-quarantine-r1.json";

const report = {
  id: "kidults-runtime-control-baseline-r1",
  schema_version: "2.0.0",
  environment_class: "CI_CONTROL",
  workload_class: "RETIRED_MET_HOLD_AND_GETTY_ONLY_BOUNDED_CONTROL",
  issue: 1596,
  state: "DIAGNOSTIC_INITIALIZED",
  production: "HOLD",
  measured_at: new Date().toISOString(),
  runtime_lineage: {
    git_sha: process.env.KIDULTS_EXACT_CHECKOUT_SHA ?? process.env.GITHUB_SHA ?? null,
    github_run_id: process.env.GITHUB_RUN_ID ?? null,
    github_run_attempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
    github_workflow_ref: process.env.GITHUB_WORKFLOW_REF ?? null
  },
  backend: { database: "LOCAL_IN_MEMORY_SQLITE", queue: "LOCAL_DETERMINISTIC_IN_MEMORY_QUEUE", remote_cloudflare: false, canonical_cloudflare_durability_verified: false },
  retired_met_provider_call_count: 0,
  data_admission_performed: false,
  immutable_candidate_evidence_pair_created: false,
  production_mutation: false,
  validations: {}
};

function fail(code, detail = null) {
  const error = new Error(code);
  error.code = code;
  error.detail = detail;
  throw error;
}

function runExactZero(label, script, args) {
  const started = performance.now();
  const child = spawnSync(process.execPath, [script, ...args], { cwd: repo, encoding: "utf8", env: { ...process.env } });
  report.measurements.push({ label, elapsed_ms: Number((performance.now() - started).toFixed(3)), expected_exit_code: 0, observed_exit_code: child.status, signal: child.signal });
  if (child.error || child.status !== 0 || child.signal !== null) {
    fail(`${label.toUpperCase()}_FAILED`, { status: child.status, signal: child.signal, stderr_tail: String(child.stderr ?? "").slice(-4000), spawn_error: child.error ? String(child.error.message ?? child.error) : null });
  }
}

function validateGovernedOwnerLane(workflow, contract) {
  const exactWorkflowIdentity = workflow.includes("name: KIDULTS Autonomous Met Open Access Sample");
  const activeSchedule = workflow.includes('- cron: "30 22 * * *"');
  const exactMainBinding = workflow.includes("Verify exact current main before public-source read") &&
    workflow.includes("test \"$GITHUB_REF\" = 'refs/heads/main'") && workflow.includes('test "$LIVE_MAIN_SHA" = "$GITHUB_SHA"');
  const providerSerialization = workflow.includes("group: kidults-met-public-source-read") && /^\s*cancel-in-progress:\s*false\s*$/m.test(workflow);
  const governedCollector = workflow.includes("node scripts/kidults/autonomous/collect-met-open-access-sample.mjs") &&
    workflow.includes("node scripts/kidults/autonomous/validate-met-open-access-sample.mjs");
  const activeJob = /^jobs:\s*$[\s\S]*?^  collect:\s*$/m.test(workflow) && !/^ {4}if:\s*\$\{\{\s*false\s*\}\}\s*$/m.test(workflow);
  const exactContract = contract?.status === "APPROVED_FOR_GOVERNED_SCHEDULED_REFERENCE_DISCOVERY" &&
    contract?.admission_class === "REFERENCE_DISCOVERY_ONLY" && contract?.current_sold_eligible === false &&
    contract?.scheduled_activation?.owner_workflow === governedOwnerWorkflow && contract?.scheduled_activation?.cadence === "30 22 * * *" &&
    contract?.scheduled_activation?.single_scheduled_live_producer === true && contract?.scheduled_activation?.candidate_workflow_provider_call_count === 0 &&
    contract?.scheduled_activation?.candidate_r2_runtime_state === "NOT_ACTIVATED_VAM_EXTERNAL_VERIFIER_HARD_HOLD" &&
    contract?.scheduled_activation?.provider_wide_concurrency_group === "kidults-met-public-source-read" &&
    contract?.scheduled_activation?.cancel_in_progress === false;
  if (!exactWorkflowIdentity || !activeSchedule || !exactMainBinding || !providerSerialization || !governedCollector || !activeJob || !exactContract) {
    fail("GOVERNED_MET_OWNER_LANE_NOT_EXACTLY_ACTIVE", { exactWorkflowIdentity, activeSchedule, exactMainBinding, providerSerialization, governedCollector, activeJob, exactContract });
  }
}

async function main() {
  const expectedLineage = {
    github_repository: process.env.GITHUB_REPOSITORY,
    github_repository_owner: process.env.GITHUB_REPOSITORY_OWNER,
    git_sha: process.env.KIDULTS_EXACT_CHECKOUT_SHA,
    github_run_id: process.env.GITHUB_RUN_ID,
    github_run_attempt: process.env.GITHUB_RUN_ATTEMPT,
    github_workflow_name: process.env.GITHUB_WORKFLOW,
    github_workflow_ref: process.env.GITHUB_WORKFLOW_REF
  };
  const started = performance.now();
  const child = spawnSync(process.execPath, [legacyMetRunner, metOutput], {
    cwd: repo,
    encoding: "utf8",
    env: {
      ...process.env,
      KIDULTS_MET_HOLD_PROBE_GIT_SHA: process.env.KIDULTS_EXACT_CHECKOUT_SHA,
      KIDULTS_MET_HOLD_PROBE_PARENT: "scripts/kidults/runtime/run-real-source-runtime-control-baseline-r1.mjs"
    }
  });
  report.measurements = [{ label: "retired_met_hold_probe", elapsed_ms: Number((performance.now() - started).toFixed(3)), expected_exit_code: 3, observed_exit_code: child.status, signal: child.signal }];
  report.legacy_probe = { stderr_tail: String(child.stderr ?? "").slice(-4000), spawn_error: child.error ? String(child.error.message ?? child.error) : null };
  if (child.error) fail("RETIRED_MET_HOLD_PROBE_SPAWN_FAILED", report.legacy_probe);
  let artifact;
  try { artifact = JSON.parse(readFileSync(metOutput, "utf8")); }
  catch (error) { fail("RETIRED_MET_HOLD_ARTIFACT_UNREADABLE", String(error?.message ?? error)); }
  const holdValidation = validateRetiredMetInvokerReceipt({
    receipt: artifact,
    observedExitCode: child.status,
    observedSignal: child.signal,
    expectedLineage
  });
  report.retired_met_hold_receipt = holdValidation;
  report.validations.retired_met_hold_exact = "PASS";
  report.validations.no_provider_call = "PASS_ZERO";
  report.validations.no_data_admission = "PASS_FALSE";
  report.validations.no_candidate_or_track_b = "PASS_FALSE_ZERO";
  report.validations.no_production_mutation = "PASS_FALSE";

  const workflow = readFileSync(governedOwnerWorkflow, "utf8");
  const contract = JSON.parse(readFileSync(governedContract, "utf8"));
  validateGovernedOwnerLane(workflow, contract);
  report.validations.governed_owner_identity = "PASS_EXACT_PATH_AND_NAME";
  report.validations.governed_owner_lane = "PASS_ACTIVE_EXACT_MAIN_SERIALIZED_REFERENCE_DISCOVERY";
  report.validations.candidate_r2 = "HOLD_NOT_ACTIVATED";

  const gettyStarted = performance.now();
  const gettyChild = spawnSync(process.execPath, [gettyRunner, gettyOutput], { cwd: repo, encoding: "utf8", env: { ...process.env } });
  report.measurements.push({
    label: "getty_historical_sale_bounded_read",
    elapsed_ms: Number((performance.now() - gettyStarted).toFixed(3)),
    expected_exit_code: 0,
    observed_exit_code: gettyChild.status,
    signal: gettyChild.signal
  });
  report.getty_probe = {
    stderr_tail: String(gettyChild.stderr ?? "").slice(-4000),
    spawn_error: gettyChild.error ? String(gettyChild.error.message ?? gettyChild.error) : null
  };
  if (gettyChild.error || gettyChild.status !== 0 || gettyChild.signal !== null) {
    fail("GETTY_ONLY_DOWNSTREAM_READ_FAILED", { status: gettyChild.status, signal: gettyChild.signal, ...report.getty_probe });
  }
  let getty;
  try { getty = JSON.parse(readFileSync(gettyOutput, "utf8")); }
  catch (error) { fail("GETTY_ONLY_DOWNSTREAM_ARTIFACT_UNREADABLE", String(error?.message ?? error)); }
  if (getty?.id !== "getty-historical-sale-run-r1" || getty?.execution_mode !== "DEV_SHADOW_ONLY" ||
      getty?.source_id !== "getty-provenance-index" || getty?.rights_basis !== "CC0" ||
      getty?.validations?.live_public_api_retrieval !== "PASS" ||
      getty?.validations?.historical_sale_activity_semantics !== "PASS" ||
      getty?.validations?.rights_admission !== "PASS_CC0" ||
      getty?.validations?.current_market_price_semantics !== "NOT_ESTABLISHED" ||
      getty?.validations?.current_liquidity_semantics !== "NOT_ESTABLISHED" ||
      getty?.validations?.current_demand_semantics !== "NOT_ESTABLISHED" ||
      getty?.validations?.production_mutation !== false) {
    fail("GETTY_ONLY_DOWNSTREAM_TRUTH_BOUNDARY_INVALID");
  }
  process.env.KIDULTS_MET_HOLD_OBSERVED_EXIT_CODE = String(child.status);
  runExactZero("getty_only_bridge", "scripts/kidults/source-intelligence/build-real-source-processor-bridge-r1.mjs", [metOutput, gettyOutput, bridgeOutput]);
  const bridge = JSON.parse(readFileSync(bridgeOutput, "utf8"));
  if (bridge?.source_pool_admission?.state !== "PASS_GETTY_ONLY" || bridge?.source_pool_admission?.admitted_input_count !== 1 ||
      bridge?.source_pool_admission?.inputs?.length !== 1 || bridge?.source_pool_admission?.inputs?.[0]?.source_id !== "getty-provenance-index" ||
      bridge?.evidence_admission_report?.identity_context !== "WITHHELD_GOVERNED_MET_OWNER_ONLY" ||
      bridge?.candidate_handoff_preflight?.ready !== false || bridge?.production_mutation !== false) {
    fail("GETTY_ONLY_BRIDGE_BOUNDARY_INVALID");
  }
  runExactZero("getty_only_local_queue_harness", "services/kidults-autonomous-intelligence/scripts/asi-real-source-queue-injection-r1.mjs", [bridgeOutput, queueOutput]);
  runExactZero("getty_only_local_retry_dlq_harness", "services/kidults-autonomous-intelligence/scripts/asi-real-source-retry-dlq-quarantine-r1.mjs", [bridgeOutput, failureOutput]);
  const queue = JSON.parse(readFileSync(queueOutput, "utf8"));
  const failure = JSON.parse(readFileSync(failureOutput, "utf8"));
  if (queue?.backend?.remote_cloudflare !== false || queue?.admission?.decision !== "HOLD" || queue?.pool?.state !== "HOLD" ||
      queue?.pool?.usable !== 0 || queue?.market_claim_authorized !== false || queue?.production !== "HOLD") {
    fail("GETTY_ONLY_LOCAL_QUEUE_BOUNDARY_INVALID");
  }
  if (failure?.backend?.remote_cloudflare !== false || failure?.retry?.state !== "PASS_SYNTHETIC_CONTROL" ||
      failure?.retry?.forced_failure?.observed !== false || failure?.quarantine?.state !== "PASS_SYNTHETIC_UNKNOWN_CONTROL_HOLD" ||
      failure?.market_claim_authorized !== false || failure?.production !== "HOLD") {
    fail("GETTY_ONLY_LOCAL_FAILURE_CONTROL_BOUNDARY_INVALID");
  }
  report.validations.downstream_lane = "PASS_GETTY_ONLY_BRIDGE_LOCAL_QUEUE_AND_FAILURE_CONTROLS";
  report.validations.synthetic_retry_dlq_control = "PASS";
  report.validations.synthetic_fail_closed_rights_hold = "PASS";
  report.validations.remote_cloudflare_execution_verified = false;
  report.validations.dev_environment_measured = "NOT_YET";
  report.validations.staging_environment_measured = "NOT_YET";
  report.validations.business_capacity_claim_authorized = false;
  report.validations.production_mutation = false;
  report.state = "VERIFIED_PASS";
  report.truth_boundary = "The retired Met runner was executed only as a zero-call HOLD probe and its exact fail-closed artifact was accepted. The separately inspected governed owner workflow is active for bounded REFERENCE_DISCOVERY reads. Downstream source admission was Getty-only and exercised only deterministic local in-memory Queue/SQLite controls. No Met/V&A admission, Candidate/Evidence creation, remote Cloudflare/PostgreSQL access, current-market claim, or Production mutation occurred.";
}

try { await main(); }
catch (error) {
  report.state = "VERIFIED_FAIL";
  report.failure = { code: error?.code ?? "RUNTIME_BASELINE_UNEXPECTED_FAILURE", message: String(error?.message ?? error), detail: error?.detail ?? null, stack: String(error?.stack ?? "").slice(0, 8000) };
  report.truth_boundary = "Diagnostic failure receipt only. No provider call, admission, Candidate/Evidence creation, Cloudflare/PostgreSQL access, or Production mutation is authorized by this artifact.";
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  console.error(JSON.stringify(report, null, 2));
  process.exitCode = 1;
}
if (report.state === "VERIFIED_PASS") {
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}
