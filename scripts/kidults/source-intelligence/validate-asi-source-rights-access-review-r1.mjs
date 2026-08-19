import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import {
  assertCompiledSourceRightsReview,
  compileSourceRightsReview,
  fingerprint,
  loadSourceRightsReviewInputs,
  stableJson
} from "./compile-asi-source-rights-access-review-r1.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../../..");
const outputPath = path.join(
  repositoryRoot,
  "coordination/kidults/source-intelligence/asi-source-pool-purpose-eligibility-r1.json"
);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function findPackage(inputs, packageId) {
  for (const review of inputs.review.reviews) {
    const pkg = review.purpose_packages.find(candidate => candidate.package_id === packageId);
    if (pkg) return pkg;
  }
  throw new Error(`Missing test package ${packageId}`);
}

function findEvidence(inputs, evidenceId) {
  const evidence = inputs.review.evidence.find(candidate => candidate.evidence_id === evidenceId);
  if (!evidence) throw new Error(`Missing test evidence ${evidenceId}`);
  return evidence;
}

function findEvidenceBinding(inputs, evidenceId) {
  const binding = inputs.evidenceAssertionBindings.bindings.find(candidate => candidate.evidence_id === evidenceId);
  if (!binding) throw new Error(`Missing test evidence binding ${evidenceId}`);
  return binding;
}

function findClaimRecordForEvidence(inputs, evidenceId) {
  const evidence = findEvidence(inputs, evidenceId);
  const claimRecordId = evidence.claim_record_ref?.split("#")[1];
  const claimRecord = inputs.claimRecords.records.find(candidate => candidate.claim_record_id === claimRecordId);
  if (!claimRecord) throw new Error(`Missing test claim record for ${evidenceId}`);
  return claimRecord;
}

function resignClaimRecordForEvidence(inputs, evidenceId, { bindAssertions = true } = {}) {
  const evidence = findEvidence(inputs, evidenceId);
  const claimRecord = findClaimRecordForEvidence(inputs, evidenceId);
  if (bindAssertions) claimRecord.evidence_assertion_binding_fingerprint = fingerprint(findEvidenceBinding(inputs, evidenceId));
  delete claimRecord.record_integrity_sha256;
  claimRecord.record_integrity_sha256 = fingerprint(claimRecord);
  evidence.record_integrity_sha256 = claimRecord.record_integrity_sha256;
  return claimRecord;
}

function bindMoMAEvidenceToProjectionForNegativeControl(inputs) {
  const binding = inputs.evidenceAssertionBindings.bindings.find(candidate => candidate.evidence_id === "ev-moma-license");
  binding.supported_purposes.push("PUBLIC_OR_COMMERCIAL_PROJECTION");
  resignClaimRecordForEvidence(inputs, "ev-moma-license");
}

function cloneInputs() {
  return structuredClone(loadSourceRightsReviewInputs());
}

function resignOutput(output) {
  delete output.eligibility_fingerprint;
  output.eligibility_fingerprint = fingerprint(output);
  return output;
}

function resignBinding(binding) {
  delete binding.binding_hash;
  binding.binding_hash = fingerprint(binding);
  return binding;
}

export function assertRuntimeFreshness(output, validationNow = process.env.KIDULTS_ASI_RIGHTS_VALIDATION_NOW ?? new Date().toISOString()) {
  const validationTimestamp = Date.parse(validationNow);
  assert(Number.isFinite(validationTimestamp), "Runtime validation clock is invalid");
  const generatedAt = Date.parse(output.generated_at);
  assert(Number.isFinite(generatedAt) && generatedAt <= validationTimestamp,
    "Compiled review snapshot is after the runtime validation clock");
  const passPackages = output.review_observations.flatMap(source =>
    source.purpose_packages.filter(pkg => pkg.decision === "PASS")
  );
  for (const pkg of passPackages) {
    const reviewDueAt = Date.parse(pkg.review_due_at);
    const evidenceObservedAt = Date.parse(pkg.evidence_observed_at_max);
    const claimRecordedAt = Date.parse(pkg.normalized_claim_record_recorded_at_max);
    assert(Number.isFinite(reviewDueAt) && reviewDueAt > validationTimestamp,
      `${pkg.package_id}: PASS evidence expired at the runtime validation clock`);
    assert(Number.isFinite(evidenceObservedAt) && evidenceObservedAt <= validationTimestamp,
      `${pkg.package_id}: PASS evidence observation is after the runtime validation clock`);
    assert(Number.isFinite(claimRecordedAt) && claimRecordedAt <= validationTimestamp,
      `${pkg.package_id}: PASS normalized claim record is after the runtime validation clock`);
  }
  for (const binding of output.purpose_eligibility_bindings) {
    assert(Date.parse(binding.review_due_at) > validationTimestamp,
      `${binding.binding_id}: PASS binding evidence expired at the runtime validation clock`);
    assert(Date.parse(binding.evidence_observed_at_max) <= validationTimestamp &&
      Date.parse(binding.normalized_claim_record_recorded_at_max) <= validationTimestamp,
    `${binding.binding_id}: PASS binding evidence timeline is after the runtime validation clock`);
  }
  return new Date(validationTimestamp).toISOString();
}

const negativeControls = [];
function expectCompileFailure(name, mutate, pattern) {
  const inputs = cloneInputs();
  mutate(inputs);
  assert.throws(() => compileSourceRightsReview(inputs), pattern, `${name} must fail closed`);
  negativeControls.push(name);
}

function expectOutputFailure(name, mutate, pattern) {
  const inputs = loadSourceRightsReviewInputs();
  const output = structuredClone(compileSourceRightsReview(inputs));
  mutate(output);
  resignOutput(output);
  assert.throws(() => assertCompiledSourceRightsReview(output, inputs), pattern, `${name} must fail closed`);
  negativeControls.push(name);
}

const firstInputs = loadSourceRightsReviewInputs();
const first = compileSourceRightsReview(firstInputs);
const second = compileSourceRightsReview(loadSourceRightsReviewInputs());
assert.equal(stableJson(first), stableJson(second), "Independent compiler runs must be byte-semantically deterministic");
assert.equal(first.eligibility_fingerprint, second.eligibility_fingerprint, "Independent compiler fingerprints must match");

const committed = readJson(outputPath);
assert.equal(stableJson(committed), stableJson(first), "Committed purpose-eligibility artifact is stale");
assertCompiledSourceRightsReview(committed, firstInputs);
const runtimeValidationClock = assertRuntimeFreshness(committed);

const ajv = new Ajv2020({ allErrors: true, strict: true, strictTypes: false, strictRequired: false });
addFormats(ajv);
const validateEvent = ajv.compile(firstInputs.eventSchema);
assert(firstInputs.eventSchema.properties.event_type.enum.includes("SOURCE_PURPOSE_ADMISSION_DECIDED"),
  "Deferred runtime event type must remain canonical");
assert.equal(first.summary.runtime_admission_events_emitted, 0);
assert.equal(first.decision_boundaries.runtime_admission_events_emitted, 0);
assert.equal(Object.hasOwn(first, "purpose_admission_events"), false);
assert(first.purpose_eligibility_bindings.every(binding => !Object.hasOwn(binding, "event_type")),
  "Policy-preflight bindings cannot impersonate runtime events");

const passPackages = first.review_observations.flatMap(source =>
  source.purpose_packages.filter(pkg => pkg.decision === "PASS").map(pkg => ({ source, pkg }))
);
const nonPassPackageIds = new Set(first.review_observations.flatMap(source =>
  source.purpose_packages.filter(pkg => pkg.decision !== "PASS").map(pkg => pkg.package_id)
));
assert.equal(passPackages.length, 4);
assert.equal(first.summary.held_purpose_package_count, 7);
assert.equal(first.summary.rejected_purpose_package_count, 3);
assert.equal(first.summary.purpose_policy_preflight_pass_binding_count, 32);
assert.equal(first.summary.full_scope_pool_ready_count, 0);
assert.equal(first.summary.market_event_evidence_policy_preflight_pass_count, 0);
assert.equal(first.summary.public_or_commercial_projection_policy_preflight_pass_count, 0);
assert.equal(first.summary.independent_legal_review_complete, false);
assert.equal(first.decision_semantics.pass_is_legal_conclusion, false);
assert.equal(first.decision_semantics.pass_package_claim_record_integrity_state,
  "ALL_PASS_NORMALIZED_CLAIM_RECORDS_INTEGRITY_VERIFIED");
assert.equal(first.decision_semantics.source_content_reproducibility_state, "PENDING_NOT_ARCHIVED");
assert.equal(first.summary.source_content_capture_complete_count, 0);
assert.equal(first.summary.source_content_capture_pending_count, 18);
assert(passPackages.every(({ pkg }) =>
  pkg.evidence_claim_record_refs.length > 0 && pkg.evidence_claim_record_refs.length === pkg.evidence_claim_record_integrity_digests.length
), "Every PASS package must have normalized claim record refs and matching integrity digests");
assert(first.purpose_eligibility_bindings.every(binding => !nonPassPackageIds.has(binding.package_id)),
  "HOLD/REJECT observations cannot emit PASS bindings");
assert(first.purpose_eligibility_bindings.every(binding =>
  binding.runtime_admission_ready === false &&
  binding.runtime_admission_event_emitted === false &&
  binding.acquisition_authorized === false &&
  binding.collection_execution_authorized === false &&
  binding.market_claim_authorized === false &&
  binding.public_projection_authorized === false &&
  binding.commercial_projection_authorized === false &&
  binding.production_authorized === false
), "Policy-preflight bindings cannot authorize runtime admission or downstream effects");

expectCompileFailure("source-admission-methodology-identity-version-drift", inputs => {
  inputs.sourceAdmissionMethodology.version = "9.9.9";
}, /parent methodology identity\/version drifted/);

expectCompileFailure("source-admission-methodology-purpose-state-drift", inputs => {
  inputs.sourceAdmissionMethodology.purposes = ["discover"];
  inputs.sourceAdmissionMethodology.states = ["ADMITTED"];
}, /purposes, states or principles drifted/);

expectCompileFailure("source-admission-methodology-production-hold-drift", inputs => {
  inputs.sourceAdmissionMethodology.production = "GO";
}, /state or HOLD boundary drifted/);

expectCompileFailure("source-admission-methodology-crosswalk-drift", inputs => {
  inputs.contract.source_admission_methodology_alignment.purpose_crosswalk.derive.r1_state = "IMPLEMENTED_POLICY_PREFLIGHT";
}, /purpose\/state crosswalk drifted/);

expectOutputFailure("eligibility-methodology-alignment-cannot-be-tampered", output => {
  output.source_admission_methodology_alignment.state_crosswalk.BLOCKED = "PASS";
}, /Compiled source-admission methodology alignment drifted/);

expectCompileFailure("tampered-normalized-claim-record-integrity-digest", inputs => {
  inputs.claimRecords.records[0].claim_text += " tampered";
}, /record integrity digest mismatch/);

expectCompileFailure("normalized-claim-record-evidence-missing-precise-locator", inputs => {
  findEvidence(inputs, "ev-moma-license").claim_locator = "";
}, /claim locator and reviewer are required/);

expectCompileFailure("normalized-claim-record-evidence-missing-reviewer", inputs => {
  findEvidence(inputs, "ev-moma-license").reviewer = "";
}, /claim locator and reviewer are required/);

expectCompileFailure("normalized-claim-record-evidence-missing-record-ref", inputs => {
  findEvidence(inputs, "ev-moma-license").claim_record_ref = null;
}, /normalized claim record needs a repo ref/);

expectCompileFailure("normalized-claim-record-evidence-integrity-mismatch", inputs => {
  findEvidence(inputs, "ev-moma-license").record_integrity_sha256 = `sha256:${"0".repeat(64)}`;
}, /claim record integrity digest does not match evidence/);

expectCompileFailure("claim-record-assertion-binding-fingerprint-drift-cannot-pass", inputs => {
  findEvidenceBinding(inputs, "ev-moma-license").supported_assertions.push("FORGED_ASSERTION");
}, /claim record evidence assertion binding fingerprint mismatch/);

expectCompileFailure("distinct-evidence-claims-cannot-reuse-one-claim-record", inputs => {
  const access = findEvidence(inputs, "ev-datacite-access");
  const rate = findEvidence(inputs, "ev-datacite-rate");
  rate.url = access.url;
  rate.claim_locator = access.claim_locator;
  rate.reviewer = access.reviewer;
  rate.claim_record_ref = access.claim_record_ref;
  rate.record_integrity_sha256 = access.record_integrity_sha256;
}, /normalized claim record ref is already bound to another evidence claim/);

expectCompileFailure("future-evidence-observation-cannot-pass", inputs => {
  const evidence = findEvidence(inputs, "ev-moma-license");
  evidence.observed_at = "2098-01-01T00:00:00Z";
  evidence.review_due_at = "2098-01-02T00:00:00Z";
}, /evidence observed_at is after the review snapshot/);

expectCompileFailure("future-normalized-claim-record-time-cannot-pass-after-resign", inputs => {
  const claimRecord = findClaimRecordForEvidence(inputs, "ev-moma-license");
  claimRecord.recorded_at = "2098-01-01T00:00:00Z";
  resignClaimRecordForEvidence(inputs, "ev-moma-license", { bindAssertions: false });
}, /recorded_at is invalid or after the review snapshot/);

expectCompileFailure("url-only-evidence-cannot-support-pass", inputs => {
  const evidence = findEvidence(inputs, "ev-moma-license");
  evidence.claim_record_state = "PRIMARY_URL_CLAIM_RECORDED_CLAIM_RECORD_PENDING";
  evidence.claim_record_ref = null;
  evidence.record_integrity_sha256 = null;
}, /Normalized claim record ledger contains an unreferenced or multiply referenced record|Normalized claim record integrity counts drifted|Exactly four evidence-supported purpose packages must pass R1/);

expectCompileFailure("expired-evidence-cannot-support-pass", inputs => {
  inputs.review.observed_at = "2027-01-01T00:00:00Z";
}, /Exactly four evidence-supported purpose packages must pass R1/);

assert.throws(() => assertRuntimeFreshness(first, "2027-01-01T00:00:00Z"),
  /PASS evidence expired at the runtime validation clock/,
  "Runtime clock must invalidate an as-of PASS after review_due_at");
negativeControls.push("runtime-clock-expiry-invalidates-as-of-pass");

const futureSnapshotOutput = structuredClone(first);
futureSnapshotOutput.generated_at = "2098-01-01T00:00:00Z";
assert.throws(() => assertRuntimeFreshness(futureSnapshotOutput, "2026-08-19T12:00:00Z"),
  /Compiled review snapshot is after the runtime validation clock/,
  "Runtime clock must reject a future compiled review snapshot");
negativeControls.push("runtime-clock-rejects-future-review-snapshot");

const futureEvidenceOutput = structuredClone(first);
const futureEvidencePackage = futureEvidenceOutput.review_observations
  .flatMap(source => source.purpose_packages)
  .find(pkg => pkg.decision === "PASS");
futureEvidencePackage.evidence_observed_at_max = "2098-01-01T00:00:00Z";
assert.throws(() => assertRuntimeFreshness(futureEvidenceOutput, "2026-08-19T12:00:00Z"),
  /PASS evidence observation is after the runtime validation clock/,
  "Runtime clock must reject a future PASS evidence observation");
negativeControls.push("runtime-clock-rejects-future-evidence-observation");

expectCompileFailure("unknown-required-right-cannot-support-pass", inputs => {
  findPackage(inputs, "pkg-moma-bounded-shadow-r1").rights.store = "UNKNOWN";
}, /Exactly four evidence-supported purpose packages must pass R1/);

expectCompileFailure("unprovisioned-credential-cannot-support-pass", inputs => {
  findPackage(inputs, "pkg-moma-bounded-shadow-r1").access.credential_state = "NOT_PROVISIONED";
}, /Exactly four evidence-supported purpose packages must pass R1/);

expectCompileFailure("context-source-cannot-enter-sold-role", inputs => {
  findPackage(inputs, "pkg-moma-bounded-shadow-r1").source_roles = ["SOLD_TRANSACTION"];
}, /context source entered a market role/);

expectCompileFailure("target-cannot-escape-bootstrap-scope", inputs => {
  findPackage(inputs, "pkg-moma-bounded-shadow-r1").scope_ids = ["vintage_computing"];
}, /Scope is outside bootstrap binding/);

expectCompileFailure("duplicate-logical-source-cannot-inflate-reviewed-count", inputs => {
  const duplicate = inputs.review.reviews.find(review => review.review_id === "review-classic-com-r1");
  duplicate.source_record_id = "christies-watches-results";
  duplicate.canonical_host = "christies.com";
}, /duplicate logical source identity/);

expectCompileFailure("cross-source-evidence-substitution-cannot-support-pass", inputs => {
  findPackage(inputs, "pkg-moma-discovery-r1").evidence_ids = ["ev-wikidata-license"];
}, /cross-source evidence substitution detected/);

expectCompileFailure("negative-evidence-polarity-cannot-support-pass", inputs => {
  findEvidenceBinding(inputs, "ev-moma-license").polarity = "DENY_SUPPORT";
  resignClaimRecordForEvidence(inputs, "ev-moma-license");
}, /Exactly four evidence-supported purpose packages must pass R1/);

expectCompileFailure("owner-lineage-cannot-be-self-attested-away-from-evidence", inputs => {
  const review = inputs.review.reviews.find(candidate => candidate.review_id === "review-moma-collection-r1");
  review.owner_lineage.operator = "Unrelated Unknown Operator";
  review.owner_lineage.relationship = "Self asserted";
}, /evidence subject operator does not match owner lineage/);

expectCompileFailure("evidence-subject-host-must-match-reviewed-source", inputs => {
  findEvidenceBinding(inputs, "ev-moma-license").subject_canonical_host = "unrelated.example";
  resignClaimRecordForEvidence(inputs, "ev-moma-license");
}, /evidence subject host does not match reviewed source/);

expectCompileFailure("missing-evidence-bound-right-cannot-support-pass", inputs => {
  const binding = findEvidenceBinding(inputs, "ev-moma-license");
  binding.supported_assertions = binding.supported_assertions.filter(assertion => assertion !== "RIGHT_STORE_ALLOW");
  resignClaimRecordForEvidence(inputs, "ev-moma-license");
}, /Exactly four evidence-supported purpose packages must pass R1/);

expectCompileFailure("unbound-input-field-cannot-support-pass", inputs => {
  const binding = findEvidenceBinding(inputs, "ev-moma-license");
  binding.supported_input_fields = binding.supported_input_fields.filter(field => field !== "Title");
  resignClaimRecordForEvidence(inputs, "ev-moma-license");
}, /Exactly four evidence-supported purpose packages must pass R1/);

expectCompileFailure("unbound-excluded-material-cannot-support-pass", inputs => {
  const binding = findEvidenceBinding(inputs, "ev-moma-license");
  binding.supported_excluded_material = binding.supported_excluded_material.filter(material => material !== "images");
  resignClaimRecordForEvidence(inputs, "ev-moma-license");
}, /Exactly four evidence-supported purpose packages must pass R1/);

expectCompileFailure("unsupported-nonrequired-allow-rights-cannot-propagate", inputs => {
  const pkg = findPackage(inputs, "pkg-wikidata-discovery-r1");
  pkg.rights.display = "ALLOW";
  pkg.rights.redistribute = "ALLOW";
  pkg.rights.sell = "ALLOW";
}, /Exactly four evidence-supported purpose packages must pass R1/);

expectCompileFailure("noncanonical-access-method-cannot-propagate", inputs => {
  findPackage(inputs, "pkg-datacite-discovery-r1").access.method = "SCRAPE_ANY_TARGET_SITE";
}, /access method is not canonical/);

expectCompileFailure("unsupported-rate-policy-cannot-propagate", inputs => {
  findPackage(inputs, "pkg-datacite-discovery-r1").access.rate_limit_policy = "UNLIMITED_NO_BACKOFF";
}, /Exactly four evidence-supported purpose packages must pass R1/);

expectCompileFailure("discovery-fields-must-be-evidence-bound", inputs => {
  findPackage(inputs, "pkg-datacite-discovery-r1").input_fields.push("personal_email", "secret_token");
}, /Exactly four evidence-supported purpose packages must pass R1/);

expectCompileFailure("propagated-excluded-material-must-be-evidence-bound", inputs => {
  findPackage(inputs, "pkg-wikidata-discovery-r1").excluded_material.push("unverified_material_claim");
}, /Exactly four evidence-supported purpose packages must pass R1/);

expectCompileFailure("noncanonical-region-grain-cannot-pass", inputs => {
  findPackage(inputs, "pkg-moma-discovery-r1").region = "MARS";
}, /noncanonical region\/language grain/);

expectCompileFailure("noncanonical-language-grain-cannot-pass", inputs => {
  findPackage(inputs, "pkg-moma-discovery-r1").language = "not-a-language";
}, /noncanonical region\/language grain/);

expectCompileFailure("target-discovery-channel-must-match-bootstrap-provenance", inputs => {
  const review = inputs.review.reviews.find(candidate => candidate.review_id === "review-moma-collection-r1");
  review.channel_id = "WIKIDATA_OFFICIAL_WEBSITE_GRAPH";
}, /target discovery channel drifted from bootstrap provenance/);

expectCompileFailure("frontier-scope-set-must-match-exact-channel-policy-provenance", inputs => {
  findPackage(inputs, "pkg-wikidata-discovery-r1").scope_ids = [
    "designer_toys",
    "diecast_scale_models",
    "vintage_character_toys",
    "sneakers",
    "fine_jewelry",
    "comic_books",
    "sports_memorabilia",
    "film_tv_props"
  ];
}, /frontier Scope set drifted from its exact R1 channel policy binding/);

expectCompileFailure("frontier-role-set-must-match-exact-channel-policy-provenance", inputs => {
  findPackage(inputs, "pkg-wikidata-discovery-r1").source_roles = ["CULTURE_ATTENTION"];
}, /frontier source-role set drifted from its exact R1 channel policy binding/);

expectCompileFailure("far-future-review-due-cannot-bypass-freshness", inputs => {
  findEvidence(inputs, "ev-moma-license").review_due_at = "2099-01-01T00:00:00Z";
}, /review_due_at exceeds the evidence-kind maximum horizon/);

expectCompileFailure("projection-display-rights-alone-are-insufficient", inputs => {
  bindMoMAEvidenceToProjectionForNegativeControl(inputs);
  const pkg = findPackage(inputs, "pkg-moma-discovery-r1");
  pkg.purpose = "PUBLIC_OR_COMMERCIAL_PROJECTION";
  pkg.rights.collect = "UNKNOWN";
  pkg.rights.store = "UNKNOWN";
  pkg.rights.transform = "UNKNOWN";
  pkg.rights.retention = "UNKNOWN";
  pkg.current_upstream_admission_refs = ["admission:test"];
  pkg.provenance_input_refs = ["input:test"];
  pkg.human_gate_ref = "human:test";
}, /Exactly four evidence-supported purpose packages must pass R1/);

expectCompileFailure("projection-without-upstream-lineage-is-insufficient", inputs => {
  bindMoMAEvidenceToProjectionForNegativeControl(inputs);
  const pkg = findPackage(inputs, "pkg-moma-discovery-r1");
  pkg.purpose = "PUBLIC_OR_COMMERCIAL_PROJECTION";
  pkg.current_upstream_admission_refs = null;
  pkg.provenance_input_refs = ["input:test"];
  pkg.human_gate_ref = "human:test";
}, /Exactly four evidence-supported purpose packages must pass R1/);

expectCompileFailure("projection-without-exact-input-lineage-is-insufficient", inputs => {
  bindMoMAEvidenceToProjectionForNegativeControl(inputs);
  const pkg = findPackage(inputs, "pkg-moma-discovery-r1");
  pkg.purpose = "PUBLIC_OR_COMMERCIAL_PROJECTION";
  pkg.current_upstream_admission_refs = ["admission:test"];
  pkg.provenance_input_refs = null;
  pkg.human_gate_ref = "human:test";
}, /Exactly four evidence-supported purpose packages must pass R1/);

expectCompileFailure("projection-without-human-gate-is-insufficient", inputs => {
  bindMoMAEvidenceToProjectionForNegativeControl(inputs);
  const pkg = findPackage(inputs, "pkg-moma-discovery-r1");
  pkg.purpose = "PUBLIC_OR_COMMERCIAL_PROJECTION";
  pkg.current_upstream_admission_refs = ["admission:test"];
  pkg.provenance_input_refs = ["input:test"];
  pkg.human_gate_ref = null;
}, /Exactly four evidence-supported purpose packages must pass R1/);

expectCompileFailure("fake-nonempty-projection-refs-cannot-bypass-r1-categorical-hold", inputs => {
  bindMoMAEvidenceToProjectionForNegativeControl(inputs);
  const pkg = findPackage(inputs, "pkg-moma-discovery-r1");
  pkg.purpose = "PUBLIC_OR_COMMERCIAL_PROJECTION";
  pkg.rights.display = "ALLOW";
  pkg.rights.redistribute = "ALLOW";
  pkg.rights.sell = "ALLOW";
  pkg.current_upstream_admission_refs = ["not-a-real-admission"];
  pkg.provenance_input_refs = ["not-a-real-input"];
  pkg.human_gate_ref = "not-a-real-human-gate";
}, /Exactly four evidence-supported purpose packages must pass R1/);

expectOutputFailure("eligibility-cannot-authorize-acquisition", output => {
  output.purpose_eligibility_bindings[0].acquisition_authorized = true;
  resignBinding(output.purpose_eligibility_bindings[0]);
}, /improperly authorized acquisition or collection/);

expectOutputFailure("eligibility-cannot-authorize-market-claim", output => {
  output.purpose_eligibility_bindings[0].market_claim_authorized = true;
  resignBinding(output.purpose_eligibility_bindings[0]);
}, /improperly authorized a market claim/);

expectOutputFailure("eligibility-cannot-authorize-public-projection", output => {
  output.purpose_eligibility_bindings[0].public_projection_authorized = true;
  resignBinding(output.purpose_eligibility_bindings[0]);
}, /improperly authorized projection/);

expectOutputFailure("eligibility-cannot-authorize-commercial-projection", output => {
  output.purpose_eligibility_bindings[0].commercial_projection_authorized = true;
  resignBinding(output.purpose_eligibility_bindings[0]);
}, /improperly authorized projection/);

expectOutputFailure("eligibility-cannot-authorize-production", output => {
  output.purpose_eligibility_bindings[0].production_authorized = true;
  resignBinding(output.purpose_eligibility_bindings[0]);
}, /improperly authorized Production/);

expectOutputFailure("binding-integrity-hash-detects-payload-tamper", output => {
  output.purpose_eligibility_bindings[0].input_field_allowlist.push("forged_field");
}, /binding integrity digest mismatch/);

expectOutputFailure("policy-binding-cannot-be-laundered-into-runtime-event", output => {
  output.purpose_eligibility_bindings[0].event_type = "SOURCE_PURPOSE_ADMISSION_DECIDED";
  resignBinding(output.purpose_eligibility_bindings[0]);
}, /impersonates a runtime event/);

expectOutputFailure("policy-binding-cannot-forge-runtime-readiness", output => {
  output.purpose_eligibility_bindings[0].runtime_admission_ready = true;
  resignBinding(output.purpose_eligibility_bindings[0]);
}, /laundered into runtime admission/);

expectOutputFailure("record-digest-cannot-be-laundered-into-source-content-capture", output => {
  output.purpose_eligibility_bindings[0].source_content_capture_state = "CAPTURED";
  output.purpose_eligibility_bindings[0].record_integrity_digest_covers_source_content = true;
  resignBinding(output.purpose_eligibility_bindings[0]);
}, /laundered into a source-content capture claim/);

expectOutputFailure("eligibility-cannot-mark-full-scope-ready", output => {
  output.canonical_scope_pool_readiness.scopes[0].full_scope_pool_ready = true;
}, /cannot mark a full Scope Source Pool ready/);

expectOutputFailure("eligibility-cannot-claim-independent-legal-review", output => {
  output.summary.independent_legal_review_complete = true;
}, /Independent legal review boundary regressed/);

expectOutputFailure("stale-output-cannot-pass-current-input-fingerprint-check", output => {
  output.generated_at = "2026-08-20T00:00:00Z";
}, /generation time drifted from the review snapshot/);

expectOutputFailure("hold-package-cannot-emit-pass-binding", output => {
  const injected = structuredClone(output.purpose_eligibility_bindings[0]);
  const heldId = [...nonPassPackageIds].sort()[0];
  injected.binding_id = `${injected.binding_id}_hold`;
  injected.package_id = heldId;
  resignBinding(injected);
  output.purpose_eligibility_bindings.push(injected);
  output.summary.purpose_policy_preflight_pass_binding_count += 1;
}, /HOLD or REJECT package emitted a policy-preflight PASS binding/);

expectOutputFailure("runtime-event-collection-cannot-be-added-to-policy-artifact", output => {
  output.purpose_admission_events = [];
}, /must not expose a runtime admission-event collection/);

assert.equal(validateEvent(first.purpose_eligibility_bindings[0]), false,
  "Policy-preflight binding must not validate as a canonical runtime event");
negativeControls.push("policy-binding-does-not-validate-as-runtime-event");

const minimumNegativeControls = 62;
assert(negativeControls.length >= minimumNegativeControls,
  `Negative-control floor regressed: ${negativeControls.length} < ${minimumNegativeControls}`);

console.log(JSON.stringify({
  status: "PASS",
  validator: "KIDULTS_ASI_SOURCE_RIGHTS_ACCESS_REVIEW_R1",
  deterministic_compiler_runs: 2,
  reviewed_sources: first.summary.reviewed_source_count,
  purpose_packages: {
    pass: first.summary.purpose_policy_preflight_pass_package_count,
    hold: first.summary.held_purpose_package_count,
    reject: first.summary.rejected_purpose_package_count
  },
  evidence_claims: {
    total: first.summary.evidence_claim_count,
    normalized_claim_record_integrity_verified: first.summary.normalized_claim_record_integrity_verified_count,
    normalized_claim_record_pending: first.summary.pending_normalized_claim_record_count,
    source_content_capture_complete: first.summary.source_content_capture_complete_count,
    source_content_capture_pending: first.summary.source_content_capture_pending_count,
    source_content_reproducibility_state: first.summary.source_content_reproducibility_state,
    pass_package_state: first.decision_semantics.pass_package_claim_record_integrity_state
  },
  policy_preflight_bindings: first.summary.purpose_policy_preflight_pass_binding_count,
  runtime_admission_events_emitted: first.summary.runtime_admission_events_emitted,
  runtime_validation_clock: runtimeValidationClock,
  deferred_event_schema_compiled: true,
  full_scope_pools_ready: first.summary.full_scope_pool_ready_count,
  public_or_commercial_projection_policy_preflight_pass: first.summary.public_or_commercial_projection_policy_preflight_pass_count,
  market_event_evidence_policy_preflight_pass: first.summary.market_event_evidence_policy_preflight_pass_count,
  independent_legal_review_complete: first.summary.independent_legal_review_complete,
  negative_controls: negativeControls.length,
  minimum_negative_controls: minimumNegativeControls,
  production: first.production
}, null, 2));
