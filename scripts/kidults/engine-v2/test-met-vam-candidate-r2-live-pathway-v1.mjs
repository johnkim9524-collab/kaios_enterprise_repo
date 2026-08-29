import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildLicenseProvenance as buildMetLicenseProvenance,
  normalizeRecord as normalizeMetRecord,
  requestJson as requestMetJson,
  retryDelayMs as metRetryDelayMs,
  runMetCollection,
  validateMetObjectPayload,
  validateMetSearchPayload
} from "../autonomous/collect-met-open-access-sample.mjs";
import { evaluateRightsScope, runVamCollection } from "../autonomous/collect-vam-fashion-sample.mjs";
import { buildCandidateR2Preflight, requiredProviderCallCount } from "./run-candidate-r2-preflight.mjs";
import { validateLivePublicMetadataPathway } from "./validate-candidate-r2-live-public-metadata-pathway-v1.mjs";

const NOW_MS = Date.now();
const NOW = new Date(NOW_MS).toISOString();
const VALID_UNTIL = new Date(NOW_MS + 7 * 86_400_000).toISOString();
const OLD = new Date(NOW_MS - 10 * 86_400_000).toISOString();
const OLD_VALID_UNTIL = new Date(NOW_MS - 3 * 86_400_000).toISOString();
const TEST_LINEAGE = Object.freeze({
  GITHUB_ACTIONS: "true",
  GITHUB_SHA: "a".repeat(40),
  GITHUB_RUN_ID: "111",
  GITHUB_RUN_ATTEMPT: "2"
});

async function withTestLineage(callback) {
  const saved = Object.fromEntries(Object.keys(TEST_LINEAGE).map(key => [key, process.env[key]]));
  Object.assign(process.env, TEST_LINEAGE);
  try {
    return await callback();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function runArtifactValidator(script, directory, lineage = TEST_LINEAGE) {
  return spawnSync(process.execPath, [script, directory], {
    cwd: process.cwd(),
    env: { ...process.env, ...lineage },
    encoding: "utf8"
  });
}

function currentRuntimeLineage() {
  return {
    git_sha: /^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA ?? "") ? process.env.GITHUB_SHA : null,
    github_run_id: /^\d+$/.test(process.env.GITHUB_RUN_ID ?? "") ? Number(process.env.GITHUB_RUN_ID) : null,
    github_run_attempt: /^\d+$/.test(process.env.GITHUB_RUN_ATTEMPT ?? "") ? Number(process.env.GITHUB_RUN_ATTEMPT) : null
  };
}
const hash = value => crypto.createHash("sha256").update(value).digest("hex");
const contract = file => {
  const raw = fs.readFileSync(file, "utf8");
  return { value: JSON.parse(raw), digest: `sha256:${hash(raw)}` };
};
const metContract = contract("coordination/kidults/autonomous/source-discovery/contracts/met-costume-open-access-r1.json");
const vamContract = contract("coordination/kidults/autonomous/source-discovery/contracts/vam-fashion-collections-r1.json");
const metLicense = buildMetLicenseProvenance(metContract.value, metContract.digest);

const forgedReceipt = Buffer.from(JSON.stringify({ receipt_type: "FORGED", scope: "INTERNAL_NONCOMMERCIAL_POC" })).toString("base64");
const rightsScope = evaluateRightsScope(
  "INTERNAL_NONCOMMERCIAL_POC",
  new Date(NOW_MS + 86_400_000).toISOString(),
  `sha256:${"a".repeat(64)}`,
  forgedReceipt,
  new Date(NOW)
);
assert.deepEqual(rightsScope, {
  authorized: false,
  reason: "EXTERNAL_RIGHTS_VERIFIER_NOT_IMPLEMENTED",
  provider_call_authorized: false,
  receipt_content_loaded: false,
  receipt_claims_accepted: false,
  license_provenance_created: false
});
assert.deepEqual(evaluateRightsScope(), rightsScope);
assert.throws(() => requiredProviderCallCount(undefined, "vam"), /PROVIDER_CALL_COUNT_REQUIRED/);
assert.throws(() => requiredProviderCallCount(null, "vam"), /PROVIDER_CALL_COUNT_REQUIRED/);
assert.throws(() => requiredProviderCallCount(Number.NaN, "vam"), /PROVIDER_CALL_COUNT_REQUIRED/);
assert.equal(requiredProviderCallCount(0, "vam"), 0);

assert.throws(() => validateMetSearchPayload({ total: 0 }), /MET_SEARCH_RESPONSE_SCHEMA_INVALID/);
assert.throws(() => validateMetSearchPayload({ total: 1, objectIDs: [] }), /MET_SEARCH_RESPONSE_SCHEMA_INVALID/);
assert.equal(validateMetSearchPayload({ total: 0, objectIDs: [] }), true);
assert.equal(validateMetSearchPayload({ total: 0, objectIDs: null }), true);
const validMetObject = {
  objectID: 123,
  accessionNumber: "A-123",
  title: "Evening Dress",
  objectName: "Dress",
  objectURL: "https://www.metmuseum.org/art/collection/search/123",
  department: "The Costume Institute",
  isPublicDomain: false
};
assert.equal(validateMetObjectPayload(validMetObject, 123), true);
assert.throws(() => validateMetObjectPayload({ ...validMetObject, objectID: 999 }, 123), /MET_OBJECT_ID_MISMATCH/);
assert.throws(() => validateMetObjectPayload({ ...validMetObject, department: undefined }, 123),
  /MET_OBJECT_DEPARTMENT_NOT_ALLOWED/);
assert.throws(() => validateMetObjectPayload({ foo: "bar" }, 123), /MET_OBJECT_RESPONSE_SCHEMA_INVALID/);
const retryHeaders = { get: name => name === "retry-after" ? "2" : null };
assert.equal(metRetryDelayMs({ headers: retryHeaders }, 1), 2000);

const networkLog = [];
await assert.rejects(
  requestMetJson("https://collectionapi.metmuseum.org/public/collection/v1/search?q=dress", {
    retryAttempts: 1,
    timeoutMs: 100,
    fetchImpl: async () => { throw new TypeError("simulated network failure"); }
  }, networkLog),
  /simulated network failure/
);
assert.equal(networkLog.length, 1);
assert.equal(networkLog[0].provider_call_attempted, true);
assert.equal(networkLog[0].status, null);
assert.equal(networkLog[0].response_sha256, null);
assert.equal(networkLog[0].error_class, "NETWORK_OR_TRANSPORT_ERROR");

const metFailureOutput = fs.mkdtempSync(path.join(os.tmpdir(), "kidults-met-provider-failure-"));
try {
  const { runManifest, exitCode } = await withTestLineage(() => runMetCollection({
    apiBase: "https://collectionapi.metmuseum.org/public/collection/v1",
    departmentId: 8,
    query: "dress",
    limit: 12,
    minimumRecords: 8,
    maximumObjectRequests: 50,
    requestIntervalMs: 250,
    timeoutMs: 100,
    retryAttempts: 1,
    maximumObservationAgeHours: 168,
    output: metFailureOutput,
    fetchImpl: async () => { throw new TypeError("simulated search transport failure"); }
  }));
  assert.equal(exitCode, 2);
  assert.equal(runManifest.status, "FAILED_PROVIDER_READ");
  assert.equal(runManifest.provider_call_count, 1);
  assert.equal(runManifest.requests_executed, 1);
  assert.equal(runManifest.request_log[0].error_class, "NETWORK_OR_TRANSPORT_ERROR");
  assert.equal(fs.existsSync(path.join(metFailureOutput, "evidence-package.json")), true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(metFailureOutput, "evidence-package.json"), "utf8")).status,
    "PROVIDER_READ_FAILED_NOT_EVIDENCE_NOT_CANDIDATE");
  const matchingLineage = runArtifactValidator(
    "scripts/kidults/autonomous/validate-met-open-access-sample.mjs",
    metFailureOutput
  );
  assert.equal(matchingLineage.status, 0, matchingLineage.stderr);
  const replayedLineage = runArtifactValidator(
    "scripts/kidults/autonomous/validate-met-open-access-sample.mjs",
    metFailureOutput,
    { ...TEST_LINEAGE, GITHUB_SHA: "b".repeat(40), GITHUB_RUN_ID: "222", GITHUB_RUN_ATTEMPT: "3" }
  );
  assert.notEqual(replayedLineage.status, 0);
  assert.match(replayedLineage.stderr, /Exact GitHub runtime/);
} finally {
  fs.rmSync(metFailureOutput, { recursive: true, force: true });
}

const redirectLog = [];
await assert.rejects(
  requestMetJson("https://collectionapi.metmuseum.org/public/collection/v1/search?q=dress", {
    retryAttempts: 1,
    timeoutMs: 100,
    fetchImpl: async () => ({
      url: "https://redirect.example.test/escape",
      redirected: true,
      status: 200,
      ok: true,
      headers: { get: () => null },
      text: async () => "{}"
    })
  }, redirectLog),
  /outside the approved allowlist/
);
assert.equal(redirectLog.length, 1);
assert.equal(redirectLog[0].error_class, "REDIRECT_OR_URL_ALLOWLIST_REJECTED");

const successLog = [];
const successfulSearch = await requestMetJson(
  "https://collectionapi.metmuseum.org/public/collection/v1/search?q=dress",
  {
    retryAttempts: 1,
    timeoutMs: 100,
    fetchImpl: async url => ({
      url,
      redirected: false,
      status: 200,
      ok: true,
      headers: { get: () => null },
      text: async () => JSON.stringify({ total: 0, objectIDs: [] })
    })
  },
  successLog
);
assert.equal(successfulSearch.payload.total, 0);
assert.equal(successLog.length, 1);
assert.equal(successLog[0].status, 200);
assert.match(successLog[0].response_sha256, /^[a-f0-9]{64}$/);

function mockResponse(url, payload) {
  return {
    url,
    redirected: false,
    status: 200,
    ok: true,
    headers: { get: () => null },
    text: async () => JSON.stringify(payload)
  };
}

async function assertInvalidMetObjectFailsClosed(payload, expectedErrorClass) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kidults-met-object-lineage-"));
  try {
    const result = await runMetCollection({
      apiBase: "https://collectionapi.metmuseum.org/public/collection/v1",
      departmentId: 8,
      query: "dress",
      limit: 1,
      minimumRecords: 1,
      maximumObjectRequests: 1,
      requestIntervalMs: 0,
      timeoutMs: 100,
      retryAttempts: 1,
      maximumObservationAgeHours: 168,
      output: directory,
      fetchImpl: async url => mockResponse(url, url.includes("/search?")
        ? { total: 1, objectIDs: [123] }
        : payload)
    });
    assert.equal(result.exitCode, 2);
    assert.equal(result.runManifest.status, "FAILED_MINIMUM_RECORD_GATE");
    assert.equal(result.runManifest.provider_call_count, 2);
    assert.equal(result.runManifest.failed_object_requests, 1);
    assert.equal(result.runManifest.failures[0].requested_object_id, 123);
    assert.equal(result.runManifest.failures[0].error_class, expectedErrorClass);
    assert.equal(result.runManifest.request_log[1].response_accepted, false);
    assert.equal(result.runManifest.request_log[1].error_class, expectedErrorClass);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory, "normalized-evidence-records.json"), "utf8")), []);
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, "evidence-package.json"), "utf8")).status,
      "INSUFFICIENT_RECORDS_NOT_EVIDENCE_NOT_CANDIDATE");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

await assertInvalidMetObjectFailsClosed({ ...validMetObject, objectID: 999 }, "OBJECT_ID_MISMATCH");
await assertInvalidMetObjectFailsClosed({ ...validMetObject, department: undefined }, "OBJECT_DEPARTMENT_NOT_ALLOWED");
await assertInvalidMetObjectFailsClosed({ foo: "bar" }, "OBJECT_RESPONSE_SCHEMA_INVALID");

const metCompletedOutput = fs.mkdtempSync(path.join(os.tmpdir(), "kidults-met-object-completed-"));
try {
  const result = await withTestLineage(() => runMetCollection({
    apiBase: "https://collectionapi.metmuseum.org/public/collection/v1",
    departmentId: 8,
    query: "dress",
    limit: 1,
    minimumRecords: 1,
    maximumObjectRequests: 1,
    requestIntervalMs: 0,
    timeoutMs: 100,
    retryAttempts: 1,
    maximumObservationAgeHours: 168,
    output: metCompletedOutput,
    fetchImpl: async url => mockResponse(url, url.includes("/search?")
      ? { total: 1, objectIDs: [123] }
      : validMetObject)
  }));
  assert.equal(result.exitCode, 0);
  assert.equal(result.runManifest.status, "COMPLETED");
  assert.equal(result.runManifest.provider_call_count, 2);
  assert.equal(result.runManifest.request_log.every(item => item.response_accepted === true), true);
  const completedRecords = JSON.parse(fs.readFileSync(
    path.join(metCompletedOutput, "normalized-evidence-records.json"), "utf8"));
  assert.equal(completedRecords[0].source_object_id, "123");
  assert.equal(completedRecords[0].evidence_id, "met:123");
  const validation = runArtifactValidator(
    "scripts/kidults/autonomous/validate-met-open-access-sample.mjs",
    metCompletedOutput
  );
  assert.equal(validation.status, 0, validation.stderr);
} finally {
  fs.rmSync(metCompletedOutput, { recursive: true, force: true });
}

const normalizedMet = normalizeMetRecord({
  objectID: 1,
  accessionNumber: "A-1",
  title: "Evening Dress",
  objectName: "Dress",
  department: "The Costume Institute",
  objectURL: "https://www.metmuseum.org/art/collection/search/1",
  objectDate: "1960",
  objectBeginDate: 1960,
  artistDisplayName: "Example Maker",
  isPublicDomain: false
}, NOW, hash("met-payload"), metLicense, 168);
assert.equal(normalizedMet.evidence_role, "REFERENCE_DISCOVERY");
assert.equal(normalizedMet.current_sold_eligible, false);
assert.equal(normalizedMet.market_observation_type, "NONE");
assert.equal(normalizedMet.license_provenance.repository_contract_sha256, metContract.digest);

const vamOutput = fs.mkdtempSync(path.join(os.tmpdir(), "kidults-vam-hard-hold-"));
try {
  const { runManifest, exitCode } = await withTestLineage(() =>
    runVamCollection({ output: vamOutput, query: "dress", limit: 12, minimumRecords: 8 }));
  assert.equal(exitCode, 3);
  assert.equal(runManifest.status, "HOLD_EXTERNAL_RIGHTS_VERIFIER_NOT_IMPLEMENTED");
  assert.equal(runManifest.provider_call_count, 0);
  assert.equal(runManifest.license_provenance_created, false);
  assert.equal(fs.existsSync(path.join(vamOutput, "normalized-evidence-records.json")), true);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(vamOutput, "normalized-evidence-records.json"), "utf8")), []);
  const matchingLineage = runArtifactValidator(
    "scripts/kidults/autonomous/validate-vam-fashion-sample.mjs",
    vamOutput
  );
  assert.equal(matchingLineage.status, 0, matchingLineage.stderr);
  const replayedLineage = runArtifactValidator(
    "scripts/kidults/autonomous/validate-vam-fashion-sample.mjs",
    vamOutput,
    { ...TEST_LINEAGE, GITHUB_SHA: "b".repeat(40), GITHUB_RUN_ID: "222", GITHUB_RUN_ATTEMPT: "3" }
  );
  assert.notEqual(replayedLineage.status, 0);
  assert.match(replayedLineage.stderr, /Exact GitHub runtime/);
} finally {
  fs.rmSync(vamOutput, { recursive: true, force: true });
}

function authorityRecord(sourceFamily, index) {
  const sourceByFamily = {
    THE_MET: "met-costume-institute-open-access",
    SMITHSONIAN: "smithsonian-open-access-art-design",
    ART_INSTITUTE_CHICAGO: "art-institute-chicago-design-api"
  };
  const sourceId = sourceByFamily[sourceFamily];
  const live = sourceFamily === "THE_MET";
  return {
    source_record_id: `${sourceId}:${index}`,
    source_id: sourceId,
    source_family: sourceFamily,
    live_metadata_binding: live,
    source_object_id: `${index}`,
    source_qualified_key: `${sourceId}:${index}`,
    evidence_class: "PRIMARY_AUTHORITY",
    evidence_role: "REFERENCE_DISCOVERY",
    market_observation_type: "NONE",
    current_sold_eligible: false,
    core_domain_hint: sourceFamily === "THE_MET" ? "fashion-accessories" : "design-furniture",
    title: `Object ${sourceFamily} ${index}`,
    object_type: "Object",
    maker: `Maker ${index}`,
    production_year: 1960 + index,
    date_text: String(1960 + index),
    accession_number: `${sourceFamily}-${index}`,
    culture_or_place: "Test",
    medium: null,
    observed_at: NOW,
    observation_valid_until: live ? VALID_UNTIL : undefined,
    provenance_reference: `https://example.test/${sourceId}/${index}`,
    source_payload_sha256: hash(`${sourceId}:${index}`),
    rights_state: sourceFamily === "THE_MET" ? "CC0_COLLECTION_METADATA" : "CC0",
    license_provenance: live ? structuredClone(metLicense) : undefined,
    image_state: "NOT_INGESTED",
    critical_field_completeness: 1,
    publication_state: "INTERNAL_SHADOW_ONLY",
    public_commercial_authorized: false,
    provider_id_is_canonical_id: false,
    physical_object_candidate_id: `physical:${sourceId}:${index}`,
    canonical_design_candidate_key: `${sourceFamily.toLowerCase()}|object-${index}|1960`
  };
}

function transactionEvent() {
  return {
    market_event_id: "getty:event:1",
    source_entity_id: "getty-1",
    source_id: "getty-provenance-index-sale-activity",
    source_family: "GETTY_PROVENANCE_INDEX",
    rights_state: "CC0",
    provenance_reference: "https://data.getty.edu/provenance/activity/1",
    fetched_at: NOW,
    source_event_type: "Activity",
    event_type: "HISTORICAL_SALE_ACTIVITY",
    sold_event: true,
    listing_is_sale: false,
    event_at: "1900-01-01T00:00:00.000Z",
    provider_id_is_canonical_object_id: false,
    sold_price: 100,
    currency: "USD",
    object_references: [{ id: "object-1", type: "HumanMadeObject" }],
    monetary_amounts: [{ id: "amount-1", value: 100, currency: "USD", currency_id: null }]
  };
}

const sources = [
  { source_id: "met-costume-institute-open-access", source_family: "THE_MET", source_role: "AUTHORITY", evidence_role: "REFERENCE_DISCOVERY", current_sold_eligible: false, rights_state: "CC0", license_provenance: metLicense },
  { source_id: "vam-collections-api-fashion", source_family: "V_AND_A", source_role: "AUTHORITY", evidence_role: "REFERENCE_DISCOVERY", current_sold_eligible: false, rights_state: "UNVERIFIED_RUNTIME_HOLD", license_provenance: null },
  { source_id: "smithsonian-open-access-art-design", source_family: "SMITHSONIAN", source_role: "AUTHORITY", evidence_role: "REFERENCE_DISCOVERY", current_sold_eligible: false, rights_state: "CC0" },
  { source_id: "art-institute-chicago-design-api", source_family: "ART_INSTITUTE_CHICAGO", source_role: "AUTHORITY", evidence_role: "REFERENCE_DISCOVERY", current_sold_eligible: false, rights_state: "CC0" },
  { source_id: "getty-provenance-index-sale-activity", source_family: "GETTY_PROVENANCE_INDEX", source_role: "TRANSACTION", evidence_role: "HISTORICAL_TRANSACTION_CONTEXT", current_sold_eligible: false, rights_state: "CC0" }
];

function input({ mutate = null } = {}) {
  const records = [
    ...Array.from({ length: 2 }, (_, index) => authorityRecord("THE_MET", index + 1)),
    ...Array.from({ length: 2 }, (_, index) => authorityRecord("SMITHSONIAN", index + 1)),
    ...Array.from({ length: 2 }, (_, index) => authorityRecord("ART_INSTITUTE_CHICAGO", index + 1))
  ];
  if (mutate) mutate(records);
  return {
    input_id: "candidate-r2-preflight-input-r1",
    input_mode: "LIVE_MET_VAM_PUBLIC_METADATA",
    run_at: NOW,
    evaluation_at: NOW,
    freshness_max_age_days: 7,
    authority_records: records,
    transaction_events: [transactionEvent()],
    source_observations: [
      { source_id: "met-costume-institute-open-access", source_family: "THE_MET", status: "COMPLETED", normalized_records: 2, minimum_records: 2, observed_at: NOW, license_provenance: metLicense, provider_call_count: 3, runtime_lineage: currentRuntimeLineage() },
      { source_id: "vam-collections-api-fashion", source_family: "V_AND_A", status: "HOLD_EXTERNAL_RIGHTS_VERIFIER_NOT_IMPLEMENTED", normalized_records: 0, minimum_records: 8, observed_at: NOW, license_provenance: null, license_contract_sha256: vamContract.digest, rights_scope_gate: rightsScope, provider_call_count: 0, runtime_lineage: currentRuntimeLineage() }
    ],
    sources
  };
}

function writeOutputs(outputs) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kidults-met-vam-pathway-"));
  for (const [name, value] of Object.entries(outputs)) {
    fs.writeFileSync(path.join(directory, name), `${JSON.stringify(value, null, 2)}\n`);
  }
  return directory;
}

function validateScenario(candidateInput, expectedState, expectedErrorPattern = null) {
  const directory = writeOutputs(buildCandidateR2Preflight(candidateInput));
  try {
    const result = validateLivePublicMetadataPathway(directory);
    assert.equal(result.pathway_state, expectedState);
    if (expectedErrorPattern) assert(result.errors.some(error => expectedErrorPattern.test(error)), result.errors.join("\n"));
    else assert.deepEqual(result.errors, []);
    const receipt = JSON.parse(fs.readFileSync(path.join(directory, "candidate-r2-pathway-receipt.json"), "utf8"));
    assert.equal(receipt.candidate_r2_activation, "NOT_ACTIVATED_IMMUTABLE_PAIR_REQUIRED");
    assert.equal(receipt.immutable_candidate_evidence_pair_created, false);
    assert.equal(receipt.track_b_assessment_count, 0);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

validateScenario(input(), "HOLD_EXTERNAL_RIGHTS_VERIFIER_NOT_IMPLEMENTED");
validateScenario(input({ mutate: records => { records[0].observed_at = OLD; } }),
  "FAIL_CLOSED_INPUT_REJECTED", /LIVE_INPUT_FAIL_CLOSED:.*STALE_OBSERVATION/);
validateScenario(input({ mutate: records => { records[0].market_observation_type = "SOLD_TRANSACTION"; records[0].current_sold_eligible = true; } }),
  "FAIL_CLOSED_INPUT_REJECTED", /PUBLIC_METADATA_CURRENT_SOLD_LAUNDERING|PUBLIC_METADATA_MARKET_EVENT_LAUNDERING/);
validateScenario(input({ mutate: records => { records[0].license_provenance = null; } }),
  "FAIL_CLOSED_INPUT_REJECTED", /LICENSE_PROVENANCE_INVALID/);

const replayInput = input();
replayInput.run_at = OLD;
for (const record of replayInput.authority_records) {
  record.observed_at = OLD;
  if (record.live_metadata_binding) record.observation_valid_until = OLD_VALID_UNTIL;
}
for (const event of replayInput.transaction_events) event.fetched_at = OLD;
for (const observation of replayInput.source_observations) observation.observed_at = OLD;
validateScenario(replayInput, "FAIL_CLOSED_INPUT_REJECTED", /LIVE_INPUT_FAIL_CLOSED:.*STALE_OBSERVATION/);
const forgedOldEvaluationInput = structuredClone(replayInput);
forgedOldEvaluationInput.evaluation_at = OLD;
validateScenario(forgedOldEvaluationInput, "FAIL_CLOSED_INPUT_REJECTED", /EVALUATION_TIMESTAMP_STALE_OR_FUTURE/);

console.log(JSON.stringify({
  id: "met-vam-candidate-r2-live-pathway-offline-test-v1",
  state: "VERIFIED_PASS",
  external_provider_calls: 0,
  scenarios: 13,
  met_scheduled_read_capability: "ACTIVE_CONTRACT_BOUND_SERIALIZED_REDIRECT_FAIL_CLOSED",
  vam_scheduled_read_capability: "EXTERNAL_RIGHTS_VERIFIER_HARD_HOLD_PROVIDER_CALLS_ZERO",
  candidate_r2_activation: "NOT_ACTIVATED_IMMUTABLE_PAIR_REQUIRED",
  track_b: "NOT_STARTED"
}, null, 2));
