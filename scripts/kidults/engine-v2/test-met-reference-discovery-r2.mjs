import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  runMetCollection,
  requestJson,
  validateObjectPayload,
  validateSearchPayload
} from "../autonomous/collect-met-open-access-sample.mjs";
import { validateMetReferenceDiscovery } from "../autonomous/validate-met-open-access-sample.mjs";
import { observeMetReferenceDiscovery } from "./observe-met-reference-discovery-r2.mjs";

function response(url, payload, overrides = {}) {
  return {
    url,
    redirected: false,
    status: 200,
    ok: true,
    headers: { get: () => null },
    text: async () => JSON.stringify(payload),
    ...overrides
  };
}

function object(id) {
  return {
    objectID: id,
    accessionNumber: `A-${id}`,
    title: `Dress ${id}`,
    objectName: "Dress",
    department: "The Costume Institute",
    objectURL: `https://www.metmuseum.org/art/collection/search/${id}`,
    isPublicDomain: false,
    primaryImage: "https://images.example.invalid/forbidden.jpg",
    additionalImages: ["https://images.example.invalid/forbidden-2.jpg"]
  };
}

function temp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function read(directory, name) {
  return JSON.parse(fs.readFileSync(path.join(directory, name), "utf8"));
}

assert.equal(validateSearchPayload({ total: 0, objectIDs: null }), true);
assert.equal(validateSearchPayload({ total: 8, objectIDs: [1, 2, 3, 4, 5, 6, 7, 8] }), true);
assert.throws(() => validateSearchPayload({ total: 1, objectIDs: null }), /SCHEMA_INVALID/);
assert.equal(validateObjectPayload(object(1), 1), true);
assert.throws(() => validateObjectPayload({ ...object(1), objectID: 2 }, 1), /ID_MISMATCH/);
assert.throws(() => validateObjectPayload({ ...object(1), department: "European Sculpture" }, 1), /DEPARTMENT/);

const completeDirectory = temp("kidults-met-reference-complete-");
const observerDirectory = temp("kidults-met-reference-observer-");
try {
  const ids = [1, 2, 3, 4, 5, 6, 7, 8];
  const complete = await runMetCollection({
    output: completeDirectory,
    limit: 8,
    minimumRecords: 8,
    fetchImpl: async url => response(url, url.includes("/search?")
      ? { total: ids.length, objectIDs: ids }
      : object(Number(url.split("/").at(-1))))
  });
  assert.equal(complete.exitCode, 0);
  assert.equal(complete.runManifest.status, "COMPLETED_REFERENCE_DISCOVERY");
  assert.equal(complete.runManifest.normalized_records, 8);
  assert.equal(complete.runManifest.provider_call_count, 9);
  assert.equal(complete.runManifest.http_attempt_count, 9);
  assert.equal(complete.runManifest.request_log.length, 9);
  assert.equal(read(completeDirectory, "terminal-receipt.json").terminal_receipt_count, 1);
  const serializedRaw = JSON.stringify(read(completeDirectory, "sanitized-raw-records.json"));
  assert.equal(serializedRaw.includes("primaryImage"), false);
  assert.equal(serializedRaw.includes("additionalImages"), false);
  assert.deepEqual(validateMetReferenceDiscovery(completeDirectory).errors, []);

  const observed = observeMetReferenceDiscovery({
    metDir: completeDirectory,
    output: observerDirectory,
    requireSource: true
  });
  assert.equal(observed.exitCode, 0);
  assert.equal(observed.receipt.state, "REFERENCE_DISCOVERY_OBSERVED_NO_CANDIDATE");
  assert.equal(observed.receipt.dynamic_record_count, 8);
  assert.equal(observed.receipt.vam_provider_call_count, 0);
  assert.equal(observed.receipt.current_sold_observation_count, 0);
  assert.equal(observed.receipt.canonical_candidate_state, "NONE");
  assert.equal(observed.receipt.canonical_evidence_state, "NONE");
  assert.equal(observed.receipt.track_b_state, "NOT_STARTED");

  const recordsPath = path.join(completeDirectory, "normalized-evidence-records.json");
  const records = read(completeDirectory, "normalized-evidence-records.json");
  records[0].observed_at = "2026-01-01T00:00:00.000Z";
  records[0].observation_valid_until = "2026-01-08T00:00:00.000Z";
  fs.writeFileSync(recordsPath, `${JSON.stringify(records, null, 2)}\n`);
  assert(validateMetReferenceDiscovery(completeDirectory).errors.includes("STALE_OR_FUTURE_OBSERVATION"));
  const stale = observeMetReferenceDiscovery({
    metDir: completeDirectory,
    output: observerDirectory,
    requireSource: true
  });
  assert.equal(stale.exitCode, 2);
  assert.equal(stale.receipt.state, "FAIL_CLOSED_INPUT_REJECTED");
} finally {
  fs.rmSync(completeDirectory, { recursive: true, force: true });
  fs.rmSync(observerDirectory, { recursive: true, force: true });
}

const zeroDirectory = temp("kidults-met-reference-zero-");
const zeroObserverDirectory = temp("kidults-met-reference-zero-observer-");
try {
  const zero = await runMetCollection({
    output: zeroDirectory,
    fetchImpl: async url => response(url, { total: 0, objectIDs: [] })
  });
  assert.equal(zero.exitCode, 0);
  assert.equal(zero.runManifest.status, "TERMINAL_ZERO_REFERENCE_DISCOVERY");
  assert.equal(zero.runManifest.provider_call_count, 1);
  assert.equal(zero.runManifest.normalized_records, 0);
  assert.deepEqual(validateMetReferenceDiscovery(zeroDirectory).errors, []);
  const observed = observeMetReferenceDiscovery({
    metDir: zeroDirectory,
    output: zeroObserverDirectory,
    requireSource: true
  });
  assert.equal(observed.exitCode, 0);
  assert.equal(observed.receipt.state, "TERMINAL_ZERO_OBSERVED_NO_CANDIDATE");
} finally {
  fs.rmSync(zeroDirectory, { recursive: true, force: true });
  fs.rmSync(zeroObserverDirectory, { recursive: true, force: true });
}

const failureDirectory = temp("kidults-met-reference-failure-");
try {
  const failed = await runMetCollection({
    output: failureDirectory,
    retryAttempts: 1,
    fetchImpl: async () => { throw new TypeError("simulated transport failure"); }
  });
  assert.equal(failed.exitCode, 2);
  assert.equal(failed.runManifest.status, "FAILED_REFERENCE_DISCOVERY");
  assert.equal(fs.existsSync(path.join(failureDirectory, "terminal-receipt.json")), true);
  assert.equal(read(failureDirectory, "terminal-receipt.json").terminal_receipt_count, 1);
  assert.deepEqual(validateMetReferenceDiscovery(failureDirectory).errors, []);
} finally {
  fs.rmSync(failureDirectory, { recursive: true, force: true });
}

const redirectLedger = { logical_requests: 0, http_attempts: 0, request_log: [] };
await assert.rejects(requestJson(
  "https://collectionapi.metmuseum.org/public/collection/v1/search?q=dress",
  {
    maximumLogicalRequests: 51,
    maximumHttpAttempts: 153,
    retryAttempts: 1,
    timeoutMs: 100,
    maximumRetryAfterMs: 5_000,
    fetchImpl: async url => response(url, {}, {
      url: "https://escape.example.invalid/data",
      redirected: true
    })
  },
  redirectLedger,
  validateSearchPayload
), /ALLOWLISTED/);
assert.equal(redirectLedger.request_log.length, 1);
assert.equal(redirectLedger.request_log[0].provider_call_attempted, true);

const metWorkflow = fs.readFileSync(".github/workflows/kidults-autonomous-met-sample.yml", "utf8");
const observerWorkflow = fs.readFileSync(".github/workflows/kidults-agci-os-candidate-r2-preflight.yml", "utf8");
for (const workflow of [metWorkflow, observerWorkflow]) {
  assert.equal(workflow.includes("authority-shadow-met-records-r1.json"), false);
  assert.equal(workflow.includes("authority-shadow-vam-records-r1.json"), false);
  assert.equal(workflow.includes("SMITHSONIAN_API_KEY"), false);
}
assert.equal(metWorkflow.includes("group: kidults-autonomous-met-sample-${{ github.event_name }}-${{ github.event_name == 'push' && github.ref || github.run_id }}"), true);
assert.equal(metWorkflow.includes("cancel-in-progress: true"), true);
assert.equal(observerWorkflow.includes("Candidate R2 Reference Observer HOLD"), true);

console.log(JSON.stringify({
  id: "met-reference-discovery-candidate-r2-observer-offline-v1",
  state: "VERIFIED_PASS",
  external_provider_calls: 0,
  stale_committed_shadow_inputs: 0,
  dynamic_cardinality_regression: "PASS",
  rights_contract_digest: "PASS",
  final_redirect_recheck: "PASS",
  terminal_success_zero_failure_receipt_count: 1,
  vam_provider_calls: 0,
  current_sold: 0,
  candidate: "NONE",
  evidence: "NONE",
  track_b: "NOT_STARTED",
  public: "HOLD",
  production: "HOLD",
  g5: "HOLD"
}, null, 2));
