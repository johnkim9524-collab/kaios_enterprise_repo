#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  RetiredMetHoldReceiptError,
  validateRetiredMetInvokerReceipt,
} from "../../../scripts/kidults/runtime/validate-retired-met-hold-receipt-v1.mjs";

const runner = "scripts/kidults/source-intelligence/run-met-real-source-admission-r1.mjs";
const validator = "scripts/kidults/runtime/validate-retired-met-hold-receipt-v1.mjs";
const expectedLineage = Object.freeze({
  github_repository: "johnkim9524-collab/kaios_enterprise_repo",
  github_repository_owner: "johnkim9524-collab",
  git_sha: "a".repeat(40),
  github_run_id: "33270000001",
  github_run_attempt: "1",
  github_workflow_name: "KIDULTS Runtime Control Baseline R1",
  github_workflow_ref: "johnkim9524-collab/kaios_enterprise_repo/.github/workflows/kidults-runtime-control-baseline-r1.yml@refs/pull/1596/merge",
});

function runProbe() {
  const directory = mkdtempSync(join(tmpdir(), "retired-met-hold-"));
  const receiptPath = join(directory, "receipt.json");
  const result = spawnSync(process.execPath, [runner, receiptPath], {
    encoding: "utf8",
    env: {
      ...process.env,
      GITHUB_REPOSITORY: expectedLineage.github_repository,
      GITHUB_REPOSITORY_OWNER: expectedLineage.github_repository_owner,
      GITHUB_SHA: expectedLineage.git_sha,
      GITHUB_RUN_ID: expectedLineage.github_run_id,
      GITHUB_RUN_ATTEMPT: expectedLineage.github_run_attempt,
      GITHUB_WORKFLOW: expectedLineage.github_workflow_name,
      GITHUB_WORKFLOW_REF: expectedLineage.github_workflow_ref,
    },
  });
  const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
  rmSync(directory, { recursive: true, force: true });
  return { result, receipt };
}

function validate(receipt, observedExitCode = 3, lineage = expectedLineage) {
  return validateRetiredMetInvokerReceipt({ receipt, observedExitCode, expectedLineage: lineage });
}

function rejectsWith(receipt, expectedCode, observedExitCode = 3, lineage = expectedLineage) {
  assert.throws(
    () => validate(receipt, observedExitCode, lineage),
    (error) => error instanceof RetiredMetHoldReceiptError && error.failures.includes(expectedCode),
  );
}

test("valid retired invoker exits 3 and its exact-lineage HOLD receipt passes", () => {
  const { result, receipt } = runProbe();
  assert.equal(result.status, 3);
  assert.equal(result.signal, null);
  const verified = validate(receipt, result.status);
  assert.equal(verified.state, "VERIFIED_RETIRED_HOLD");
  assert.equal(verified.provider_calls_authorized, false);
  assert.equal(verified.data_admission_authorized, false);
  assert.equal(verified.candidate_r2_authorized, false);
  assert.equal(verified.track_b_authorized, false);
  assert.equal(verified.production_mutation_authorized, false);
});

test("exit zero with no receipt is rejected", () => {
  rejectsWith(null, "RECEIPT_MISSING", 0);
  assert.throws(
    () => validate(null, 0),
    (error) => error.failures.includes("UNEXPECTED_EXIT_CODE"),
  );
});

test("CLI rejects a missing receipt file", () => {
  const missing = join(tmpdir(), `retired-met-missing-${process.pid}.json`);
  const result = spawnSync(process.execPath, [
    validator,
    missing,
    "--exit-code", "3",
    "--repository", expectedLineage.github_repository,
    "--repository-owner", expectedLineage.github_repository_owner,
    "--sha", expectedLineage.git_sha,
    "--run-id", expectedLineage.github_run_id,
    "--run-attempt", expectedLineage.github_run_attempt,
    "--workflow-name", expectedLineage.github_workflow_name,
    "--workflow-ref", expectedLineage.github_workflow_ref,
  ], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /ENOENT/);
});

test("provider call or request output is rejected", () => {
  const { receipt } = runProbe();
  for (const field of ["provider_call_count", "requests_executed"]) {
    rejectsWith({ ...receipt, [field]: 1 }, `RECEIPT_${field.toUpperCase()}_NOT_ZERO`);
  }
});

test("admission, Candidate, or Track B output is rejected", () => {
  const { receipt } = runProbe();
  rejectsWith({ ...receipt, data_admission_performed: true }, "RECEIPT_DATA_ADMISSION_PERFORMED_NOT_FALSE");
  rejectsWith({ ...receipt, immutable_candidate_evidence_pair_created: true }, "RECEIPT_IMMUTABLE_CANDIDATE_EVIDENCE_PAIR_CREATED_NOT_FALSE");
  rejectsWith({ ...receipt, track_b_submission_count: 1 }, "RECEIPT_TRACK_B_SUBMISSION_COUNT_NOT_ZERO");
  rejectsWith({ ...receipt, track_b_assessment_count: 1 }, "RECEIPT_TRACK_B_ASSESSMENT_COUNT_NOT_ZERO");
});

test("wrong repository owner is rejected", () => {
  const { receipt } = runProbe();
  const mutated = structuredClone(receipt);
  mutated.probe_lineage.github_repository_owner = "untrusted-owner";
  rejectsWith(mutated, "LINEAGE_REPOSITORY_OWNER_MISMATCH");
  rejectsWith(
    { ...receipt, governed_owner_workflow: ".github/workflows/untrusted-met-owner.yml" },
    "RECEIPT_GOVERNED_OWNER_WORKFLOW_MISMATCH",
  );
});

test("missing lineage is rejected", () => {
  const { receipt } = runProbe();
  const mutated = structuredClone(receipt);
  delete mutated.probe_lineage;
  rejectsWith(mutated, "LINEAGE_MISSING");
});

test("wrong SHA, run id, run attempt, or workflow lineage is rejected", () => {
  const { receipt } = runProbe();
  for (const [field, value, expectedCode] of [
    ["git_sha", "b".repeat(40), "LINEAGE_EXPECTED_GIT_SHA_MISMATCH"],
    ["github_run_id", "33270000002", "LINEAGE_EXPECTED_RUN_ID_MISMATCH"],
    ["github_run_attempt", "2", "LINEAGE_EXPECTED_RUN_ATTEMPT_MISMATCH"],
    ["github_workflow_name", "Untrusted Workflow", "LINEAGE_WORKFLOW_NAME_MISMATCH"],
    ["github_workflow_ref", "johnkim9524-collab/kaios_enterprise_repo/.github/workflows/untrusted.yml@refs/heads/main", "LINEAGE_WORKFLOW_REF_INVALID"],
  ]) {
    const mutated = structuredClone(receipt);
    mutated.probe_lineage[field] = value;
    rejectsWith(mutated, expectedCode);
  }
});

test("missing required lineage member is rejected", () => {
  const { receipt } = runProbe();
  const mutated = structuredClone(receipt);
  delete mutated.probe_lineage.github_run_attempt;
  rejectsWith(mutated, "LINEAGE_GITHUB_RUN_ATTEMPT_MISSING");
});

test("unexpected exit code or signal is rejected", () => {
  const { receipt } = runProbe();
  rejectsWith(receipt, "UNEXPECTED_EXIT_CODE", 1);
  assert.throws(
    () => validateRetiredMetInvokerReceipt({
      receipt,
      observedExitCode: 3,
      observedSignal: "SIGTERM",
      expectedLineage,
    }),
    (error) => error.failures.includes("UNEXPECTED_SIGNAL"),
  );
});
