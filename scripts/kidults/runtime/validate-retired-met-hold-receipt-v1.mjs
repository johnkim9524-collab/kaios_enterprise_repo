#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const contractUrl = new URL("../../../coordination/kidults/runtime/retired-met-hold-receipt-contract-v1.json", import.meta.url);

export const retiredMetInvokerContract = Object.freeze(
  JSON.parse(readFileSync(fileURLToPath(contractUrl), "utf8")),
);

export class RetiredMetHoldReceiptError extends Error {
  constructor(failures) {
    super(`RETIRED_MET_HOLD_RECEIPT_INVALID:${failures.join(",")}`);
    this.name = "RetiredMetHoldReceiptError";
    this.code = "RETIRED_MET_HOLD_RECEIPT_INVALID";
    this.failures = failures;
  }
}

function exactString(value) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function validateRetiredMetHoldReceipt({ receipt, outcome, expectedLineage }) {
  const contract = retiredMetInvokerContract;
  const expectedReceipt = contract.receipt;
  const lineage = receipt?.probe_lineage;
  const expected = expectedLineage ?? {};
  const failures = [];
  const require = (condition, code) => { if (!condition) failures.push(code); };

  require(receipt !== null && typeof receipt === "object" && !Array.isArray(receipt), "RECEIPT_MISSING");
  require(outcome?.exitCode === contract.process_outcome.expected_exit_code, "UNEXPECTED_EXIT_CODE");
  require((outcome?.signal ?? null) === contract.process_outcome.expected_signal, "UNEXPECTED_SIGNAL");
  for (const field of ["id", "version", "status", "execution_mode", "source_id", "blocker", "governed_owner_workflow"]) {
    require(receipt?.[field] === expectedReceipt[field], `RECEIPT_${field.toUpperCase()}_MISMATCH`);
  }
  for (const field of expectedReceipt.required_zero_fields) {
    require(receipt?.[field] === 0, `RECEIPT_${field.toUpperCase()}_NOT_ZERO`);
  }
  for (const field of expectedReceipt.required_false_fields) {
    require(receipt?.[field] === false, `RECEIPT_${field.toUpperCase()}_NOT_FALSE`);
  }
  for (const field of expectedReceipt.required_empty_array_fields) {
    require(Array.isArray(receipt?.[field]) && receipt[field].length === 0, `RECEIPT_${field.toUpperCase()}_NOT_EMPTY`);
  }

  require(lineage !== null && typeof lineage === "object" && !Array.isArray(lineage), "LINEAGE_MISSING");
  for (const field of contract.lineage.required_fields) {
    require(exactString(lineage?.[field]) !== null, `LINEAGE_${field.toUpperCase()}_MISSING`);
  }
  require(lineage?.github_repository === contract.invoker.github_repository, "LINEAGE_REPOSITORY_MISMATCH");
  require(lineage?.github_repository_owner === contract.invoker.github_repository_owner, "LINEAGE_REPOSITORY_OWNER_MISMATCH");
  require(lineage?.github_workflow_name === contract.invoker.github_workflow_name, "LINEAGE_WORKFLOW_NAME_MISMATCH");
  require(lineage?.parent_control === contract.invoker.parent_control, "LINEAGE_PARENT_CONTROL_MISMATCH");
  require(new RegExp(contract.lineage.git_sha_pattern).test(lineage?.git_sha ?? ""), "LINEAGE_GIT_SHA_FORMAT_INVALID");
  require(new RegExp(contract.lineage.positive_integer_string_pattern).test(lineage?.github_run_id ?? ""), "LINEAGE_RUN_ID_FORMAT_INVALID");
  require(new RegExp(contract.lineage.positive_integer_string_pattern).test(lineage?.github_run_attempt ?? ""), "LINEAGE_RUN_ATTEMPT_FORMAT_INVALID");
  require(new RegExp(contract.lineage.workflow_ref_pattern).test(lineage?.github_workflow_ref ?? ""), "LINEAGE_WORKFLOW_REF_INVALID");

  for (const [field, code] of [
    ["github_repository", "LINEAGE_EXPECTED_REPOSITORY_MISMATCH"],
    ["github_repository_owner", "LINEAGE_EXPECTED_REPOSITORY_OWNER_MISMATCH"],
    ["git_sha", "LINEAGE_EXPECTED_GIT_SHA_MISMATCH"],
    ["github_run_id", "LINEAGE_EXPECTED_RUN_ID_MISMATCH"],
    ["github_run_attempt", "LINEAGE_EXPECTED_RUN_ATTEMPT_MISMATCH"],
    ["github_workflow_name", "LINEAGE_EXPECTED_WORKFLOW_NAME_MISMATCH"],
    ["github_workflow_ref", "LINEAGE_EXPECTED_WORKFLOW_REF_MISMATCH"],
  ]) {
    require(exactString(expected[field]) !== null && lineage?.[field] === expected[field], code);
  }

  if (failures.length > 0) throw new RetiredMetHoldReceiptError([...new Set(failures)]);
  return {
    state: "VERIFIED_RETIRED_HOLD",
    contract_id: contract.id,
    contract_version: contract.version,
    provider_calls_authorized: false,
    data_admission_authorized: false,
    candidate_r2_authorized: false,
    track_b_authorized: false,
    production_mutation_authorized: false,
    lineage: { ...lineage },
  };
}

export function validateRetiredMetInvokerReceipt({
  receipt,
  observedExitCode,
  observedSignal = null,
  expectedLineage,
}) {
  return validateRetiredMetHoldReceipt({
    receipt,
    outcome: { exitCode: observedExitCode, signal: observedSignal },
    expectedLineage,
  });
}

function parseCli(args) {
  const receiptPath = args.shift();
  const options = {};
  while (args.length > 0) {
    const flag = args.shift();
    if (!flag?.startsWith("--") || args.length === 0) throw new Error(`INVALID_ARGUMENT:${flag ?? "missing"}`);
    options[flag.slice(2)] = args.shift();
  }
  return { receiptPath, options };
}

function requiredOption(options, name) {
  const value = options[name];
  if (!value) throw new Error(`MISSING_ARGUMENT:--${name}`);
  return value;
}

export function runRetiredMetHoldReceiptCli(argv) {
  const { receiptPath, options } = parseCli([...argv]);
  if (!receiptPath) throw new Error("MISSING_ARGUMENT:receipt-path");
  const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
  return validateRetiredMetHoldReceipt({
    receipt,
    outcome: {
      exitCode: Number(requiredOption(options, "exit-code")),
      signal: options.signal === "none" || options.signal === undefined ? null : options.signal,
    },
    expectedLineage: {
      github_repository: requiredOption(options, "repository"),
      github_repository_owner: requiredOption(options, "repository-owner"),
      git_sha: requiredOption(options, "sha"),
      github_run_id: requiredOption(options, "run-id"),
      github_run_attempt: requiredOption(options, "run-attempt"),
      github_workflow_name: requiredOption(options, "workflow-name"),
      github_workflow_ref: requiredOption(options, "workflow-ref"),
    },
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.stdout.write(`${JSON.stringify(runRetiredMetHoldReceiptCli(process.argv.slice(2)), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      state: "VERIFIED_FAIL",
      code: error?.code ?? "RETIRED_MET_HOLD_RECEIPT_CLI_FAILED",
      message: String(error?.message ?? error),
      failures: error?.failures ?? [],
    }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
