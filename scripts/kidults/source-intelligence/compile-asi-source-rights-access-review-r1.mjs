import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { compileGlobalPoolR1BootstrapCapture } from "./compile-global-pool-r1-bootstrap-capture-v1.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../../..");
const defaultContractPath = path.join(
  repositoryRoot,
  "coordination/kidults/source-intelligence/asi-source-rights-access-review-contract-v1.json"
);
const reviewContractRepoPath = "coordination/kidults/source-intelligence/asi-source-rights-access-review-contract-v1.json";
const claimRecordRepoPath = "coordination/kidults/source-intelligence/evidence/asi-source-rights-access-normalized-primary-claim-records-r1.json";
const contextAllowedRoles = new Set(["CATALOG_REFERENCE", "PROVENANCE_HISTORY", "CULTURE_ATTENTION"]);
const marketRoles = new Set(["LISTING_SUPPLY", "SOLD_TRANSACTION", "AUTHENTICATION_CONDITION"]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function resolveRepoPath(value) {
  return path.resolve(repositoryRoot, value);
}

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function fingerprint(value) {
  return `sha256:${crypto.createHash("sha256").update(stableJson(value)).digest("hex")}`;
}

function hashId(prefix, value, length = 32) {
  return `${prefix}_${crypto.createHash("sha256").update(value).digest("hex").slice(0, length)}`;
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

function assertUniqueStrings(values, label, { nonEmpty = true } = {}) {
  assert(Array.isArray(values), `${label} must be an array.`);
  assert(!nonEmpty || values.length > 0, `${label} must not be empty.`);
  assert(values.every(value => typeof value === "string" && value.length > 0), `${label} must contain non-empty strings.`);
  assert(new Set(values).size === values.length, `${label} must be unique.`);
}

function normalizedHost(value) {
  try {
    const url = new URL(`https://${value}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
    if (!host || host === "localhost" || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return null;
    return host;
  } catch {
    return null;
  }
}

function claimRecordFingerprint(claimRecord) {
  const { record_integrity_sha256: ignored, ...unsigned } = claimRecord;
  return fingerprint(unsigned);
}

function outputFingerprint(output) {
  const { eligibility_fingerprint: ignored, ...unsigned } = output;
  return fingerprint(unsigned);
}

export function loadSourceRightsReviewInputs(contractPath = defaultContractPath) {
  const contract = readJson(contractPath);
  const sourceAdmissionMethodology = readJson(resolveRepoPath(contract.canonical_inputs.source_admission_methodology));
  const review = readJson(resolveRepoPath(contract.canonical_inputs.review_data));
  const claimRecords = readJson(resolveRepoPath(contract.canonical_inputs.normalized_primary_claim_records));
  const evidenceAssertionBindings = readJson(resolveRepoPath(contract.canonical_inputs.evidence_assertion_bindings));
  const frontierContract = readJson(resolveRepoPath(contract.canonical_inputs.frontier_contract));
  const purposePolicy = readJson(resolveRepoPath(contract.canonical_inputs.purpose_policy));
  const scopeRegistry = readJson(resolveRepoPath(contract.canonical_inputs.scope_registry));
  const scopePoolReadiness = readJson(resolveRepoPath(contract.canonical_inputs.scope_pool_readiness));
  const eventSchema = readJson(resolveRepoPath(contract.canonical_inputs.event_schema));
  const bootstrap = compileGlobalPoolR1BootstrapCapture();
  return {
    contractPath,
    contract,
    sourceAdmissionMethodology,
    review,
    claimRecords,
    evidenceAssertionBindings,
    frontierContract,
    purposePolicy,
    scopeRegistry,
    scopePoolReadiness,
    eventSchema,
    bootstrap
  };
}

export function validateSourceRightsReviewInputs(inputs) {
  const {
    contract,
    sourceAdmissionMethodology,
    review,
    claimRecords,
    evidenceAssertionBindings,
    frontierContract,
    purposePolicy,
    scopeRegistry,
    scopePoolReadiness,
    eventSchema,
    bootstrap
  } = inputs;
  assert(contract.status === "ACTIVE_SHADOW_FAIL_CLOSED", "Rights review contract must remain fail-closed SHADOW.");
  const expectedParentPurposes = ["collect", "derive", "discover", "display_internal", "display_public", "store"];
  const expectedParentStates = ["ADMITTED", "BLOCKED", "CONDITIONAL", "DISCOVERY_ONLY"];
  const expectedParentPrinciples = [
    "CLAIM_STRENGTH_LE_EVIDENCE_STRENGTH",
    "EVIDENCE_BEFORE_METRICS",
    "PUBLIC_ACCESSIBLE_NOT_EQUAL_REUSABLE",
    "PURPOSE_SPECIFIC_RIGHTS",
    "UNKNOWN_FAILS_CLOSED"
  ];
  const expectedPurposeCrosswalk = {
    discover: { target_purpose: "DISCOVERY_METADATA_INDEX", r1_state: "IMPLEMENTED_POLICY_PREFLIGHT" },
    collect: { target_purpose: "BOUNDED_SHADOW_ACQUISITION", r1_state: "IMPLEMENTED_POLICY_PREFLIGHT_COLLECTION_EXECUTION_FALSE" },
    store: { target_purpose: "BOUNDED_SHADOW_ACQUISITION", r1_state: "IMPLEMENTED_POLICY_PREFLIGHT_COLLECTION_EXECUTION_FALSE" },
    derive: { target_purpose: "INTERNAL_MARKET_ANALYSIS", r1_state: "NOT_IMPLEMENTED_HOLD" },
    display_internal: { target_purpose: "INTERNAL_SOURCE_ASSESSMENT", r1_state: "NOT_IMPLEMENTED_HOLD" },
    display_public: { target_purpose: "PUBLIC_OR_COMMERCIAL_PROJECTION", r1_state: "IMPLEMENTED_CATEGORICAL_HOLD_ONLY" }
  };
  const expectedStateCrosswalk = {
    ADMITTED: "PASS_POLICY_PREFLIGHT_ONLY_NOT_RUNTIME_ADMISSION",
    CONDITIONAL: "HOLD",
    DISCOVERY_ONLY: "HOLD",
    BLOCKED: "REJECT"
  };
  assert(sourceAdmissionMethodology.id === contract.source_admission_methodology_alignment?.parent_methodology_id &&
    sourceAdmissionMethodology.version === contract.source_admission_methodology_alignment?.parent_methodology_version,
  "Source-admission parent methodology identity/version drifted.");
  assert(sourceAdmissionMethodology.status === contract.source_admission_methodology_alignment?.parent_status_required &&
    sourceAdmissionMethodology.execution_mode === contract.source_admission_methodology_alignment?.parent_execution_mode_required &&
    sourceAdmissionMethodology.production === contract.source_admission_methodology_alignment?.parent_production_required,
  "Source-admission parent methodology state or HOLD boundary drifted.");
  assert(stableJson(sortedUnique(sourceAdmissionMethodology.purposes)) === stableJson(expectedParentPurposes) &&
    stableJson(sortedUnique(sourceAdmissionMethodology.states)) === stableJson(expectedParentStates) &&
    stableJson(sortedUnique(sourceAdmissionMethodology.principles)) === stableJson(expectedParentPrinciples),
  "Source-admission parent methodology purposes, states or principles drifted.");
  assert(stableJson(contract.source_admission_methodology_alignment?.purpose_crosswalk) === stableJson(expectedPurposeCrosswalk) &&
    stableJson(contract.source_admission_methodology_alignment?.state_crosswalk) === stableJson(expectedStateCrosswalk),
  "Source-admission methodology purpose/state crosswalk drifted.");
  const canonicalPurposeNames = new Set(purposePolicy.purposes.map(item => item.purpose));
  assert(Object.values(expectedPurposeCrosswalk).every(item => canonicalPurposeNames.has(item.target_purpose)) &&
    !Object.hasOwn(contract.purpose_requirements, "INTERNAL_MARKET_ANALYSIS") &&
    !Object.hasOwn(contract.purpose_requirements, "INTERNAL_SOURCE_ASSESSMENT"),
  "Source-admission methodology crosswalk must target canonical purposes and keep unimplemented R1 purposes on HOLD.");
  assert(contract.source_admission_methodology_alignment?.profile_role === "PURPOSE_SPECIFIC_SHADOW_PREFLIGHT_IMPLEMENTATION_PROFILE" &&
    contract.source_admission_methodology_alignment?.parent_admission_state_emitted === false &&
    contract.source_admission_methodology_alignment?.runtime_admission_event_emitted === false &&
    contract.source_admission_methodology_alignment?.collection_execution_authorized === false &&
    contract.source_admission_methodology_alignment?.public_or_commercial_projection_authorized === false,
  "Source-admission methodology implementation-profile boundary drifted.");
  assert([
    "BYPASS_LOGIN_OR_AUTH",
    "BYPASS_PAYWALL",
    "BYPASS_CAPTCHA",
    "BYPASS_TECHNICAL_ACCESS_CONTROL",
    "PURPOSE_RIGHT_UNKNOWN_FOR_COLLECTION_OR_DERIVATION"
  ].every(code => sourceAdmissionMethodology.hard_blocks.includes(code)),
  "Source-admission parent methodology hard blocks drifted.");
  assert(contract.decision_semantics?.pass_means === "POLICY_AND_EVIDENCE_PREFLIGHT_PASS_ONLY",
    "PASS semantics must remain policy/evidence preflight only.");
  assert(contract.decision_semantics?.pass_is_legal_conclusion === false,
    "PASS cannot be represented as a legal conclusion.");
  assert(contract.decision_semantics?.independent_legal_review_complete === false,
    "Independent legal review cannot be self-attested as complete.");
  assert(contract.evidence_integrity_semantics?.record_integrity_sha256_covers === "CANONICAL_NORMALIZED_CLAIM_RECORD_ONLY",
    "Claim record digest semantics must be explicit.");
  assert(contract.evidence_integrity_semantics?.record_integrity_sha256_does_not_cover === "PRIMARY_SOURCE_PAGE_BYTES_OR_RENDERED_CONTENT",
    "Claim record digest must not be represented as a source-content digest.");
  assert(contract.evidence_integrity_semantics?.recorded_claim_to_evidence_cardinality === "ONE_TO_ONE" &&
    contract.evidence_integrity_semantics?.recorded_at_must_equal_evidence_observed_at === true &&
    contract.evidence_integrity_semantics?.claim_record_binds_evidence_assertion_fingerprint === true,
  "Normalized claim records must bind one evidence claim, its observation time and its assertion semantics.");
  assert(contract.geographic_grain?.allowed_region === "GLOBAL" && contract.geographic_grain?.allowed_language === "mul" &&
    contract.geographic_grain?.canonical_region_language_coverage_credit === 0 &&
    contract.geographic_grain?.satisfies_regional_scope_pool_readiness === false,
  "Bounded review geography must remain a zero-credit GLOBAL/mul non-market umbrella.");
  assert(contract.review_slice_semantics?.numeric_global_site_target === null, "A bounded review slice cannot become a numeric global site target.");
  assert(contract.event_contract?.hold_or_reject_event_emitted === false, "HOLD or REJECT observations must not emit admission events.");
  assert(contract.event_contract?.runtime_admission_events_emitted === 0 &&
    contract.event_contract?.policy_preflight_binding_is_runtime_event === false,
  "Policy preflight must not emit or impersonate runtime admission events.");
  assert(contract.event_contract?.runtime_materialization_requires_classification_assertion_fan_in === 4 &&
    contract.event_contract?.runtime_materialization_requires_qualification_assertion_fan_in === 7,
  "Runtime admission fan-in boundary drifted.");
  assert(contract.public_or_commercial_projection_r1?.policy_preflight_pass_enabled === false &&
    contract.public_or_commercial_projection_r1?.unresolved_reference_decision === "HOLD" &&
    contract.public_or_commercial_projection_r1?.canonical_reference_resolution_implemented === false,
  "R1 public/commercial projection must remain categorically HOLD until canonical reference resolution exists.");
  assert(contract.publication?.production === "HOLD", "Rights review contract must keep Production on HOLD.");
  assert(review.production === "HOLD", "Rights review data must keep Production on HOLD.");
  assert(review.review_batch?.bounded_mechanism_proof_not_market_completeness === true, "Review batch must deny completeness claims.");
  assert(review.review_batch?.numeric_global_site_target === null, "Review batch cannot introduce a global site target.");
  assert(review.review_batch?.official_primary_sources_only === true, "Review batch must use official primary sources only.");
  assert(review.review_batch?.legal_conclusion_asserted === false, "Review batch cannot self-assert a legal conclusion.");
  assert(review.review_batch?.human_legal_review_substituted === false, "Review batch cannot substitute for human legal review.");
  assert(review.review_batch?.decision_semantics === "POLICY_AND_EVIDENCE_PREFLIGHT_PASS_ONLY",
    "Review batch must identify PASS as a policy/evidence preflight decision.");
  assert(review.review_batch?.independent_legal_review_complete === false && review.review_batch?.independent_legal_review_state === "NOT_COMPLETED",
    "Review batch must fail closed on independent legal review.");
  assert(review.review_batch?.reviewed_source_count === review.reviews.length, "Reviewed source count does not match review rows.");
  assert(review.reviews.length === 13, "R1 mechanism proof must contain its declared 13-source review slice.");
  const reviewObservedAt = Date.parse(review.observed_at);
  assert(Number.isFinite(reviewObservedAt), "Review snapshot observed_at is invalid.");
  assert(scopeRegistry.scope_count === 32 && scopeRegistry.scopes.length === 32, "Canonical Scope registry must contain 32 Scopes.");
  assert(scopePoolReadiness.minimums?.required_source_roles_per_scope === 7, "Canonical Scope readiness must retain seven required roles.");
  assert(scopePoolReadiness.discovery_vs_acquisition?.discovery_authorizes_collection === false, "Discovery must not authorize collection.");
  assert(scopePoolReadiness.discovery_vs_acquisition?.acquisition_requires_scope_ready === true, "Acquisition must require full Scope readiness.");
  assert(scopePoolReadiness.discovery_vs_acquisition?.bulk_collection_authorized === false, "Bulk collection must remain unauthorized.");
  assert(eventSchema.properties?.event_type?.enum?.includes("SOURCE_PURPOSE_ADMISSION_DECIDED"), "Canonical event schema lacks SOURCE_PURPOSE_ADMISSION_DECIDED.");

  assert(claimRecords.record_type === "normalized_primary_claim_record_ledger", "Claim evidence ledger type is misleading.");
  assert(claimRecords.source_content_capture_state === "PENDING_NOT_ARCHIVED" && claimRecords.source_content_digest_available === false,
    "Normalized claim ledger must disclose that source content was not captured.");
  const claimRecordIds = new Set();
  for (const claimRecord of claimRecords.records ?? []) {
    assert(typeof claimRecord.claim_record_id === "string" && claimRecord.claim_record_id.length > 0, "Normalized claim record ID is required.");
    assert(!claimRecordIds.has(claimRecord.claim_record_id), `Duplicate normalized claim record: ${claimRecord.claim_record_id}`);
    claimRecordIds.add(claimRecord.claim_record_id);
    assert(/^https:\/\//.test(claimRecord.source_url), `${claimRecord.claim_record_id}: primary source URL must be HTTPS.`);
    assert(claimRecord.claim_locator && claimRecord.reviewer && claimRecord.claim_text,
      `${claimRecord.claim_record_id}: locator, reviewer and normalized claim are required.`);
    assert(typeof claimRecord.evidence_id === "string" && claimRecord.evidence_id.length > 0,
      `${claimRecord.claim_record_id}: bound evidence ID is required.`);
    assert(/^sha256:[a-f0-9]{64}$/.test(claimRecord.evidence_assertion_binding_fingerprint ?? ""),
      `${claimRecord.claim_record_id}: evidence assertion binding fingerprint is invalid.`);
    const claimRecordedAt = Date.parse(claimRecord.recorded_at);
    assert(Number.isFinite(claimRecordedAt) && claimRecordedAt <= reviewObservedAt,
      `${claimRecord.claim_record_id}: recorded_at is invalid or after the review snapshot.`);
    assert(claimRecord.source_content_capture_state === "PENDING_NOT_ARCHIVED",
      `${claimRecord.claim_record_id}: source-content capture state must remain honest.`);
    assert(/^sha256:[a-f0-9]{64}$/.test(claimRecord.record_integrity_sha256), `${claimRecord.claim_record_id}: record integrity digest is invalid.`);
    assert(claimRecord.record_integrity_sha256 === claimRecordFingerprint(claimRecord), `${claimRecord.claim_record_id}: record integrity digest mismatch.`);
  }

  const claimRecordsById = new Map(claimRecords.records.map(claimRecord => [claimRecord.claim_record_id, claimRecord]));
  const evidenceById = new Map();
  const usedClaimRecordRefs = new Set();
  const usedClaimRecordIds = new Set();
  for (const evidence of review.evidence ?? []) {
    assert(typeof evidence.evidence_id === "string" && evidence.evidence_id.length > 0, "Evidence ID is required.");
    assert(!evidenceById.has(evidence.evidence_id), `Duplicate evidence ID: ${evidence.evidence_id}`);
    evidenceById.set(evidence.evidence_id, evidence);
    assert(/^https:\/\//.test(evidence.url), `${evidence.evidence_id}: evidence URL must be HTTPS.`);
    assert(evidence.claim_locator && evidence.reviewer, `${evidence.evidence_id}: claim locator and reviewer are required.`);
    const observedAt = Date.parse(evidence.observed_at);
    const reviewDueAt = Date.parse(evidence.review_due_at);
    assert(Number.isFinite(observedAt) && Number.isFinite(reviewDueAt) && reviewDueAt > observedAt,
      `${evidence.evidence_id}: evidence dates are invalid.`);
    assert(observedAt <= reviewObservedAt,
      `${evidence.evidence_id}: evidence observed_at is after the review snapshot.`);
    const maxReviewHorizonDays = contract.evidence_max_review_horizon_days[evidence.evidence_kind];
    assert(Number.isInteger(maxReviewHorizonDays) && maxReviewHorizonDays > 0,
      `${evidence.evidence_id}: evidence kind lacks a bounded review horizon.`);
    assert(reviewDueAt - observedAt <= maxReviewHorizonDays * 86_400_000,
      `${evidence.evidence_id}: review_due_at exceeds the evidence-kind maximum horizon.`);
    assert(contract.claim_record_states.includes(evidence.claim_record_state), `${evidence.evidence_id}: unknown claim record state.`);
    assert(contract.source_content_capture_states.includes(evidence.source_content_capture_state) &&
      evidence.source_content_capture_state === "PENDING_NOT_ARCHIVED",
    `${evidence.evidence_id}: source-content capture state must remain pending and explicit.`);
    if (evidence.claim_record_state === "NORMALIZED_PRIMARY_CLAIM_RECORD_RECORDED") {
      assert(/^repo:[^#]+#[^#]+$/.test(evidence.claim_record_ref ?? ""), `${evidence.evidence_id}: normalized claim record needs a repo ref.`);
      assert(/^sha256:[a-f0-9]{64}$/.test(evidence.record_integrity_sha256 ?? ""), `${evidence.evidence_id}: normalized claim record needs an integrity digest.`);
      const claimRecordId = evidence.claim_record_ref.split("#")[1];
      const claimRecord = claimRecordsById.get(claimRecordId);
      assert(claimRecord, `${evidence.evidence_id}: referenced normalized claim record is missing.`);
      assert(!usedClaimRecordRefs.has(evidence.claim_record_ref),
        `${evidence.evidence_id}: normalized claim record ref is already bound to another evidence claim.`);
      usedClaimRecordRefs.add(evidence.claim_record_ref);
      usedClaimRecordIds.add(claimRecordId);
      assert(evidence.claim_record_ref === `repo:${claimRecordRepoPath}#${claimRecordId}`, `${evidence.evidence_id}: claim record ref is not canonical.`);
      assert(claimRecord.record_integrity_sha256 === evidence.record_integrity_sha256, `${evidence.evidence_id}: claim record integrity digest does not match evidence.`);
      assert(claimRecord.source_url === evidence.url, `${evidence.evidence_id}: claim record URL does not match evidence URL.`);
      assert(claimRecord.claim_locator === evidence.claim_locator, `${evidence.evidence_id}: claim record locator does not match evidence locator.`);
      assert(claimRecord.reviewer === evidence.reviewer, `${evidence.evidence_id}: claim record reviewer does not match evidence reviewer.`);
      assert(claimRecord.evidence_id === evidence.evidence_id,
        `${evidence.evidence_id}: claim record is bound to a different evidence claim.`);
      assert(claimRecord.recorded_at === evidence.observed_at,
        `${evidence.evidence_id}: claim record recorded_at must equal evidence observed_at.`);
    } else {
      assert(evidence.claim_record_ref === null && evidence.record_integrity_sha256 === null,
        `${evidence.evidence_id}: pending claim record must not carry an unverifiable ref or digest.`);
    }
  }
  assert(usedClaimRecordIds.size === claimRecords.records.length,
    "Normalized claim record ledger contains an unreferenced or multiply referenced record.");

  assert(evidenceAssertionBindings.status === "ACTIVE_SHADOW_FAIL_CLOSED",
    "Evidence assertion binding ledger must remain fail closed.");
  assert(evidenceAssertionBindings.source_content_capture_state === "PENDING_NOT_ARCHIVED" &&
    evidenceAssertionBindings.legal_conclusion_asserted === false && evidenceAssertionBindings.runtime_admission_authorized === false,
  "Evidence assertion bindings cannot claim source capture, legal conclusion or runtime admission.");
  const evidenceBindingById = new Map();
  for (const binding of evidenceAssertionBindings.bindings ?? []) {
    assert(evidenceById.has(binding.evidence_id), `${binding.evidence_id}: assertion binding references unknown evidence.`);
    assert(!evidenceBindingById.has(binding.evidence_id), `${binding.evidence_id}: duplicate evidence assertion binding.`);
    evidenceBindingById.set(binding.evidence_id, binding);
    assert(evidenceAssertionBindings.polarity_states.includes(binding.polarity), `${binding.evidence_id}: invalid evidence polarity.`);
    assert(typeof binding.subject_review_id === "string" && typeof binding.subject_canonical_host === "string" &&
      typeof binding.subject_operator === "string", `${binding.evidence_id}: evidence subject binding is incomplete.`);
    assertUniqueStrings(binding.supported_purposes, `${binding.evidence_id}: supported purposes`);
    assertUniqueStrings(binding.supported_output_classes, `${binding.evidence_id}: supported output classes`);
    assertUniqueStrings(binding.supported_assertions, `${binding.evidence_id}: supported assertions`);
    assertUniqueStrings(binding.supported_input_fields, `${binding.evidence_id}: supported input fields`, { nonEmpty: false });
    assertUniqueStrings(binding.supported_excluded_material, `${binding.evidence_id}: supported excluded material`, { nonEmpty: false });
    if (binding.supported_access !== undefined) {
      const supportedAccessKeys = Object.keys(binding.supported_access);
      const allowedAccessKeys = new Set(["method", "state", "credential_state", "robots_state", "rate_limit_state", "rate_limit_policy"]);
      assert(supportedAccessKeys.length > 0 && supportedAccessKeys.every(key => allowedAccessKeys.has(key)),
        `${binding.evidence_id}: supported access policy has unknown or empty fields.`);
      assert(Object.values(binding.supported_access).every(value => typeof value === "string" && value.length > 0),
        `${binding.evidence_id}: supported access policy values must be non-empty strings.`);
      if (binding.supported_access.method !== undefined) {
        assert(contract.access_methods.includes(binding.supported_access.method), `${binding.evidence_id}: supported access method is not canonical.`);
      }
    }
  }
  assert(evidenceBindingById.size === evidenceById.size,
    "Every evidence record must have exactly one source/operator/assertion binding.");
  for (const evidence of review.evidence.filter(item => item.claim_record_state === "NORMALIZED_PRIMARY_CLAIM_RECORD_RECORDED")) {
    const claimRecordId = evidence.claim_record_ref.split("#")[1];
    const claimRecord = claimRecordsById.get(claimRecordId);
    const binding = evidenceBindingById.get(evidence.evidence_id);
    assert(claimRecord.evidence_assertion_binding_fingerprint === fingerprint(binding),
      `${evidence.evidence_id}: claim record evidence assertion binding fingerprint mismatch.`);
  }

  const currentScopeIds = new Set(scopeRegistry.scopes.map(scope => scope.scope_id));
  const canonicalRoles = new Set(Object.keys(purposePolicy.source_role_boundaries));
  const frontierChannelIds = new Set(frontierContract.seed_channel_taxonomy.map(channel => channel.channel_id));
  const frontierScopeRolePolicy = contract.frontier_channel_scope_role_bindings_r1;
  assert(frontierScopeRolePolicy?.binding_semantics === "EXACT_R1_POLICY_PREFLIGHT_GRAIN_NOT_GLOBAL_CHANNEL_COVERAGE" &&
    frontierScopeRolePolicy?.canonical_scope_count_per_channel === 8,
  "Frontier Scope/Role policy must remain an exact bounded R1 grain.");
  const configuredFrontierChannels = Object.keys(frontierScopeRolePolicy.channels ?? {}).sort();
  const reviewedFrontierChannels = review.reviews
    .filter(sourceReview => sourceReview.source_kind === "FRONTIER_DISCOVERY_CHANNEL")
    .map(sourceReview => sourceReview.channel_id)
    .sort();
  assert(stableJson(configuredFrontierChannels) === stableJson(reviewedFrontierChannels),
    "Frontier Scope/Role policy must bind every and only the reviewed frontier channels.");
  for (const [channelId, policyBinding] of Object.entries(frontierScopeRolePolicy.channels)) {
    assert(frontierChannelIds.has(channelId), `${channelId}: Scope/Role policy references a noncanonical frontier channel.`);
    assertUniqueStrings(policyBinding.scope_ids, `${channelId}: frontier policy Scope IDs`);
    assertUniqueStrings(policyBinding.source_roles, `${channelId}: frontier policy source roles`);
    assert(policyBinding.scope_ids.length === frontierScopeRolePolicy.canonical_scope_count_per_channel &&
      policyBinding.scope_ids.every(scopeId => currentScopeIds.has(scopeId)),
    `${channelId}: frontier policy Scope set is incomplete or noncanonical.`);
    assert(policyBinding.source_roles.every(role => canonicalRoles.has(role)),
      `${channelId}: frontier policy source-role set is noncanonical.`);
  }
  const targetById = new Map(bootstrap.source_records.map(record => [record.source_record_id, record]));
  const reviewIds = new Set();
  const logicalSourceIds = new Set();
  const packageIds = new Set();
  let packageCount = 0;
  for (const sourceReview of review.reviews) {
    assert(!reviewIds.has(sourceReview.review_id), `Duplicate review ID: ${sourceReview.review_id}`);
    reviewIds.add(sourceReview.review_id);
    assert(contract.source_kinds.includes(sourceReview.source_kind), `${sourceReview.review_id}: unknown source kind.`);
    const logicalSourceId = sourceReview.source_kind === "GLOBAL_POOL_R1_TARGET_CANDIDATE"
      ? `target:${sourceReview.source_record_id}`
      : `frontier:${sourceReview.channel_id}`;
    assert(!logicalSourceIds.has(logicalSourceId), `${sourceReview.review_id}: duplicate logical source identity ${logicalSourceId}.`);
    logicalSourceIds.add(logicalSourceId);
    assert(normalizedHost(sourceReview.canonical_host) === sourceReview.canonical_host, `${sourceReview.review_id}: canonical host is invalid.`);
    assert(contract.owner_lineage_states.includes(sourceReview.owner_lineage?.state), `${sourceReview.review_id}: owner lineage state is invalid.`);
    assert(Array.isArray(sourceReview.purpose_packages) && sourceReview.purpose_packages.length > 0,
      `${sourceReview.review_id}: at least one purpose package is required.`);
    let targetRecord = null;
    let frontierScopeRoleBinding = null;
    if (sourceReview.source_kind === "GLOBAL_POOL_R1_TARGET_CANDIDATE") {
      assert(frontierChannelIds.has(sourceReview.channel_id), `${sourceReview.review_id}: target discovery channel is not canonical.`);
      assert(sourceReview.channel_id === bootstrap.queue_seed_discovery_channel_id,
        `${sourceReview.review_id}: target discovery channel drifted from bootstrap provenance.`);
      targetRecord = targetById.get(sourceReview.source_record_id);
      assert(targetRecord, `${sourceReview.review_id}: source is not in the Global Pool R1 bootstrap.`);
      assert(targetRecord.canonical_host === sourceReview.canonical_host, `${sourceReview.review_id}: canonical host drifted from bootstrap.`);
      assert(targetRecord.context_only === sourceReview.context_only, `${sourceReview.review_id}: context boundary drifted from bootstrap.`);
    } else {
      assert(sourceReview.source_record_id === null, `${sourceReview.review_id}: frontier channel must not impersonate a target source record.`);
      assert(frontierChannelIds.has(sourceReview.channel_id), `${sourceReview.review_id}: frontier discovery channel is not canonical.`);
      assert(sourceReview.context_only === true, `${sourceReview.review_id}: discovery provider must remain context-only.`);
      frontierScopeRoleBinding = frontierScopeRolePolicy.channels[sourceReview.channel_id];
      assert(frontierScopeRoleBinding, `${sourceReview.review_id}: frontier Scope/Role policy binding is missing.`);
    }

    for (const pkg of sourceReview.purpose_packages) {
      packageCount += 1;
      assert(!packageIds.has(pkg.package_id), `Duplicate purpose package: ${pkg.package_id}`);
      packageIds.add(pkg.package_id);
      assert(contract.purpose_requirements[pkg.purpose], `${pkg.package_id}: purpose is not supported by this review contract.`);
      assertUniqueStrings(pkg.scope_ids, `${pkg.package_id}: scope IDs`);
      assertUniqueStrings(pkg.source_roles, `${pkg.package_id}: source roles`);
      assertUniqueStrings(pkg.input_fields, `${pkg.package_id}: input fields`);
      assertUniqueStrings(pkg.excluded_material, `${pkg.package_id}: excluded material`);
      assertUniqueStrings(pkg.evidence_ids, `${pkg.package_id}: evidence IDs`);
      assert(pkg.region === contract.geographic_grain.allowed_region && pkg.language === contract.geographic_grain.allowed_language,
        `${pkg.package_id}: noncanonical region/language grain.`);
      assert(pkg.scope_ids.every(scopeId => currentScopeIds.has(scopeId)), `${pkg.package_id}: unknown canonical Scope.`);
      assert(pkg.source_roles.every(role => canonicalRoles.has(role)), `${pkg.package_id}: unknown canonical source role.`);
      if (frontierScopeRoleBinding) {
        assert(stableJson([...pkg.scope_ids].sort()) === stableJson([...frontierScopeRoleBinding.scope_ids].sort()),
          `${pkg.package_id}: frontier Scope set drifted from its exact R1 channel policy binding.`);
        assert(stableJson([...pkg.source_roles].sort()) === stableJson([...frontierScopeRoleBinding.source_roles].sort()),
          `${pkg.package_id}: frontier source-role set drifted from its exact R1 channel policy binding.`);
      }
      assert(pkg.evidence_ids.every(evidenceId => evidenceById.has(evidenceId)), `${pkg.package_id}: referenced evidence is missing.`);
      const packageEvidenceBindings = pkg.evidence_ids.map(evidenceId => evidenceBindingById.get(evidenceId));
      assert(packageEvidenceBindings.every(binding => binding.subject_review_id === sourceReview.review_id),
        `${pkg.package_id}: cross-source evidence substitution detected.`);
      assert(packageEvidenceBindings.every(binding => binding.subject_canonical_host === sourceReview.canonical_host),
        `${pkg.package_id}: evidence subject host does not match reviewed source.`);
      assert(packageEvidenceBindings.every(binding => binding.subject_operator === sourceReview.owner_lineage.operator),
        `${pkg.package_id}: evidence subject operator does not match owner lineage.`);
      assert(packageEvidenceBindings.every(binding => binding.supported_purposes.includes(pkg.purpose)),
        `${pkg.package_id}: evidence is not bound to the requested purpose.`);
      assert(packageEvidenceBindings.every(binding => binding.supported_output_classes.includes(pkg.output_class)),
        `${pkg.package_id}: evidence is not bound to the requested output class.`);
      assert(contract.document_scope_states.includes(pkg.license_scope_state), `${pkg.package_id}: license scope state is invalid.`);
      assert(contract.document_scope_states.includes(pkg.terms_scope_state), `${pkg.package_id}: terms scope state is invalid.`);
      assert(contract.access_states.includes(pkg.access?.state), `${pkg.package_id}: access state is invalid.`);
      assert(contract.access_methods.includes(pkg.access?.method), `${pkg.package_id}: access method is not canonical.`);
      assert(contract.credential_states.includes(pkg.access?.credential_state), `${pkg.package_id}: credential state is invalid.`);
      assert(contract.robots_states.includes(pkg.access?.robots_state), `${pkg.package_id}: robots state is invalid.`);
      assert(contract.rate_limit_states.includes(pkg.access?.rate_limit_state), `${pkg.package_id}: rate-limit state is invalid.`);
      assert(stableJson(Object.keys(pkg.rights).sort()) === stableJson([...contract.rights_facets].sort()),
        `${pkg.package_id}: rights facets are incomplete.`);
      assert(Object.values(pkg.rights).every(state => contract.rights_states.includes(state)), `${pkg.package_id}: rights state is invalid.`);
      assert(pkg.market_semantics?.market_event_claim_authorized === false, `${pkg.package_id}: review cannot authorize a market claim.`);
      assert(pkg.market_semantics?.demand_or_liquidity_claim_authorized === false, `${pkg.package_id}: review cannot authorize demand or liquidity claims.`);
      if (sourceReview.context_only) {
        assert(pkg.source_roles.every(role => contextAllowedRoles.has(role)), `${pkg.package_id}: context source entered a market role.`);
      }
      if (targetRecord) {
        assert(pkg.scope_ids.every(scopeId => targetRecord.candidate_scope_ids.includes(scopeId)), `${pkg.package_id}: Scope is outside bootstrap binding.`);
        assert(pkg.source_roles.every(role => targetRecord.candidate_source_roles.includes(role)), `${pkg.package_id}: role is outside bootstrap binding.`);
      }
    }
  }
  assert(packageCount === 14, "R1 review must contain its declared 14 purpose packages.");
  assert(logicalSourceIds.size === review.reviews.length, "Reviewed-source count must equal unique logical source identities.");
}

function evaluatePackage(sourceReview, pkg, evidenceById, evidenceBindingById, contract, observedAt) {
  const requirements = contract.purpose_requirements[pkg.purpose];
  const evidence = pkg.evidence_ids.map(id => evidenceById.get(id));
  const evidenceBindings = pkg.evidence_ids.map(id => evidenceBindingById.get(id));
  const allowSupportBindings = evidenceBindings.filter(binding => binding.polarity === contract.pass_evidence_polarity);
  const evidenceSupports = assertion => allowSupportBindings.some(binding => binding.supported_assertions.includes(assertion));
  const assertions = [];
  let rejected = false;
  let held = false;
  const check = (name, state, effect = "HOLD") => {
    assertions.push({ assertion: name, satisfied: state });
    if (!state) {
      if (effect === "REJECT") rejected = true;
      else held = true;
    }
  };
  const checkEvidenceBound = (name, state, effect = "HOLD") => check(name, state && evidenceSupports(name), effect);

  checkEvidenceBound("OWNER_LINEAGE_VERIFIED", sourceReview.owner_lineage.state === "VERIFIED_OFFICIAL_OPERATOR");
  check("ALL_REFERENCED_EVIDENCE_POLARITY_ALLOW_SUPPORT",
    evidenceBindings.every(binding => binding.polarity === contract.pass_evidence_polarity));
  check("NORMALIZED_CLAIM_RECORD_INTEGRITY_VERIFIED",
    evidence.every(item => item.claim_record_state === "NORMALIZED_PRIMARY_CLAIM_RECORD_RECORDED" && /^sha256:[a-f0-9]{64}$/.test(item.record_integrity_sha256)));
  check("SOURCE_CONTENT_CAPTURE_STATE_DISCLOSED_PENDING",
    evidence.every(item => item.source_content_capture_state === "PENDING_NOT_ARCHIVED"));
  check("EVIDENCE_CURRENT", evidence.every(item => Date.parse(item.review_due_at) > Date.parse(observedAt)));
  checkEvidenceBound("LICENSE_SCOPE_EXPLICIT", pkg.license_scope_state === "EXPLICIT",
    pkg.license_scope_state === "PROHIBITED" ? "REJECT" : "HOLD");
  checkEvidenceBound("TERMS_SCOPE_EXPLICIT", pkg.terms_scope_state === "EXPLICIT",
    pkg.terms_scope_state === "PROHIBITED" ? "REJECT" : "HOLD");
  check("R1_PUBLIC_OR_COMMERCIAL_PROJECTION_CATEGORICAL_HOLD",
    pkg.purpose !== "PUBLIC_OR_COMMERCIAL_PROJECTION");

  for (const facet of requirements.required_rights_facets) {
    const assertion = `RIGHT_${facet.toUpperCase()}_ALLOW`;
    checkEvidenceBound(assertion, pkg.rights[facet] === "ALLOW", pkg.rights[facet] === "DENY" ? "REJECT" : "HOLD");
  }
  for (const facet of contract.rights_facets.filter(facet => !requirements.required_rights_facets.includes(facet))) {
    if (pkg.rights[facet] === "ALLOW") {
      checkEvidenceBound(`RIGHT_${facet.toUpperCase()}_ALLOW`, true);
    }
  }
  if (requirements.requires_access_available) {
    checkEvidenceBound("ACCESS_AVAILABLE", pkg.access.state === "AVAILABLE", pkg.access.state === "PROHIBITED" ? "REJECT" : "HOLD");
  }
  if (requirements.requires_credential_ready) {
    checkEvidenceBound("CREDENTIAL_READY", ["NOT_REQUIRED", "PROVISIONED"].includes(pkg.access.credential_state));
  }
  if (requirements.requires_robots_or_documented_non_crawl_path) {
    checkEvidenceBound("ROBOTS_OR_NON_CRAWL_PATH_EXPLICIT", [
      "ALLOW_WITH_PUBLISHED_ETIQUETTE",
      "NOT_APPLICABLE_DOCUMENTED_API",
      "NOT_APPLICABLE_STATIC_DATASET"
    ].includes(pkg.access.robots_state), pkg.access.robots_state === "PROHIBITED" ? "REJECT" : "HOLD");
  }
  if (requirements.requires_rate_limit_or_static_dataset) {
    checkEvidenceBound("RATE_LIMIT_OR_STATIC_DATASET_EXPLICIT", ["EXPLICIT", "NOT_APPLICABLE_STATIC_DATASET"].includes(pkg.access.rate_limit_state));
  }
  const accessSupportValues = new Map();
  for (const binding of allowSupportBindings) {
    for (const [key, value] of Object.entries(binding.supported_access ?? {})) {
      const values = accessSupportValues.get(key) ?? new Set();
      values.add(value);
      accessSupportValues.set(key, values);
    }
  }
  const accessPolicyExactlyBound = Object.entries(pkg.access).every(([key, value]) => {
    const values = accessSupportValues.get(key);
    return values?.size === 1 && values.has(value);
  });
  checkEvidenceBound("ACCESS_POLICY_EXACTLY_EVIDENCE_BOUND", accessPolicyExactlyBound);

  const supportedFields = new Set(allowSupportBindings.flatMap(binding => binding.supported_input_fields));
  checkEvidenceBound("INPUT_FIELDS_EXACTLY_EVIDENCE_BOUND",
    pkg.input_fields.length > 0 && pkg.input_fields.every(field => supportedFields.has(field)));
  const supportedExcludedMaterial = new Set(allowSupportBindings.flatMap(binding => binding.supported_excluded_material));
  checkEvidenceBound("EXCLUDED_MATERIAL_EXACTLY_EVIDENCE_BOUND",
    pkg.excluded_material.length > 0 && pkg.excluded_material.every(material => supportedExcludedMaterial.has(material)));
  if (requirements.requires_field_allowlist) {
    checkEvidenceBound("FIELD_ALLOWLIST_EXPLICIT", pkg.input_fields.length > 0 && pkg.input_fields.every(field => supportedFields.has(field)));
  }
  if (requirements.requires_excluded_material_boundary) {
    checkEvidenceBound("EXCLUDED_MATERIAL_BOUNDARY_EXPLICIT",
      pkg.excluded_material.length > 0 && pkg.excluded_material.every(material => supportedExcludedMaterial.has(material)));
  }
  if (requirements.requires_current_upstream_admission_lineage) {
    check("CURRENT_UPSTREAM_ADMISSION_LINEAGE", Array.isArray(pkg.current_upstream_admission_refs) && pkg.current_upstream_admission_refs.length > 0);
  }
  if (requirements.requires_provenance_and_exact_input_field_lineage) {
    check("PROVENANCE_AND_EXACT_INPUT_FIELD_LINEAGE", Array.isArray(pkg.provenance_input_refs) && pkg.provenance_input_refs.length > 0);
  }
  if (requirements.requires_human_gate) check("HUMAN_GATE_PRESENT", typeof pkg.human_gate_ref === "string" && pkg.human_gate_ref.length > 0);
  check("MARKET_CLAIM_BLOCKED", pkg.market_semantics.market_event_claim_authorized === false);
  check("DEMAND_LIQUIDITY_CLAIM_BLOCKED", pkg.market_semantics.demand_or_liquidity_claim_authorized === false);
  if (sourceReview.context_only) check("CONTEXT_ROLE_BOUNDARY", pkg.source_roles.every(role => contextAllowedRoles.has(role)), "REJECT");

  const decision = rejected ? "REJECT" : held ? "HOLD" : "PASS";
  const reasonCodes = assertions.filter(item => !item.satisfied).map(item => item.assertion);
  const evidenceBoundAssertionSet = new Set(contract.evidence_bound_pass_assertions);
  const requiredEvidenceBoundAssertions = assertions
    .map(item => item.assertion)
    .filter(assertion => evidenceBoundAssertionSet.has(assertion));
  const supportedEvidenceAssertions = sortedUnique(allowSupportBindings.flatMap(binding => binding.supported_assertions));
  if (decision === "PASS") reasonCodes.push("ALL_REQUIRED_PURPOSE_ASSERTIONS_EXPLICIT");
  if (sourceReview.context_only) reasonCodes.push("CONTEXT_ONLY_NOT_MARKET_EVENT");
  const reviewDueAt = evidence.map(item => item.review_due_at).sort()[0];
  const evidenceObservedAtMax = evidence.map(item => item.observed_at).sort().at(-1);
  const normalizedClaimRecordRecordedAtMax = evidence
    .filter(item => item.claim_record_state === "NORMALIZED_PRIMARY_CLAIM_RECORD_RECORDED")
    .map(item => item.observed_at)
    .sort()
    .at(-1) ?? null;
  return {
    package_id: pkg.package_id,
    purpose: pkg.purpose,
    decision,
    rights_policy_preflight_state: decision === "PASS" ? "ASSERTIONS_SUPPORTED" : decision === "REJECT" ? "DENIED" : "UNKNOWN",
    freshness_state: evidence.every(item => Date.parse(item.review_due_at) > Date.parse(observedAt)) ? "CURRENT" : "EXPIRED",
    required_assertion_count: assertions.length,
    satisfied_assertion_count: assertions.filter(item => item.satisfied).length,
    satisfied_assertions: assertions.filter(item => item.satisfied).map(item => item.assertion).sort(),
    required_evidence_bound_assertions: requiredEvidenceBoundAssertions.sort(),
    evidence_bound_assertions: supportedEvidenceAssertions,
    evidence_binding_polarities: evidenceBindings.map(binding => binding.polarity).sort(),
    assertions,
    reason_codes: sortedUnique(reasonCodes),
    review_due_at: reviewDueAt,
    evidence_observed_at_max: evidenceObservedAtMax,
    normalized_claim_record_recorded_at_max: normalizedClaimRecordRecordedAtMax,
    evidence_claim_record_refs: evidence.map(item => item.claim_record_ref).filter(Boolean).sort(),
    evidence_claim_record_integrity_digests: evidence.map(item => item.record_integrity_sha256).filter(Boolean).sort(),
    evidence_assertion_binding_fingerprints: evidenceBindings.map(binding => fingerprint(binding)).sort(),
    source_content_capture_state: "PENDING_NOT_ARCHIVED"
  };
}

function policyPreflightBinding(sourceReview, pkg, evaluation, scopeId, sourceRole, snapshotRef, observedAt, bootstrap) {
  const sourceId = sourceReview.source_kind === "GLOBAL_POOL_R1_TARGET_CANDIDATE"
    ? `source_${sourceReview.source_record_id}`
    : `source_channel_${sourceReview.channel_id.toLowerCase()}`;
  const binding = `${sourceId}|${pkg.package_id}|${scopeId}|${sourceRole}|${pkg.region}|${pkg.language}|${snapshotRef}`;
  const record = {
    binding_id: hashId("preflight", binding, 40),
    record_type: "source_purpose_policy_preflight_binding",
    version: "1.0.0",
    decided_at: observedAt,
    input_snapshot_ref: snapshotRef,
    source_id: sourceId,
    source_kind: sourceReview.source_kind,
    source_record_id: sourceReview.source_record_id,
    channel_id: sourceReview.channel_id,
    bootstrap_discovery_channel_id: sourceReview.source_kind === "GLOBAL_POOL_R1_TARGET_CANDIDATE"
      ? bootstrap.queue_seed_discovery_channel_id
      : null,
    bootstrap_discovery_processor_fleet_id: sourceReview.source_kind === "GLOBAL_POOL_R1_TARGET_CANDIDATE"
      ? bootstrap.queue_seed_processor_fleet_id
      : null,
    frontier_scope_role_policy_binding_ref: sourceReview.source_kind === "FRONTIER_DISCOVERY_CHANNEL"
      ? `repo:${reviewContractRepoPath}#frontier_channel_scope_role_bindings_r1/channels/${sourceReview.channel_id}`
      : null,
    package_id: pkg.package_id,
    purpose: pkg.purpose,
    scope_id: scopeId,
    source_role: sourceRole,
    region: pkg.region,
    language: pkg.language,
    geographic_grain_semantics: "GLOBAL_UMBRELLA_NON_MARKET_ZERO_CANONICAL_COVERAGE_CREDIT",
    canonical_region_language_coverage_credit: 0,
    owner_lineage: sourceReview.owner_lineage,
    context_only: sourceReview.context_only,
    input_field_allowlist: [...pkg.input_fields].sort(),
    excluded_material: [...pkg.excluded_material].sort(),
    output_class: pkg.output_class,
    rights: pkg.rights,
    access: pkg.access,
    evidence_claim_record_refs: evaluation.evidence_claim_record_refs,
    evidence_claim_record_integrity_digests: evaluation.evidence_claim_record_integrity_digests,
    evidence_assertion_binding_fingerprints: evaluation.evidence_assertion_binding_fingerprints,
    evidence_observed_at_max: evaluation.evidence_observed_at_max,
    normalized_claim_record_recorded_at_max: evaluation.normalized_claim_record_recorded_at_max,
    satisfied_assertions: evaluation.satisfied_assertions,
    required_evidence_bound_assertions: evaluation.required_evidence_bound_assertions,
    evidence_bound_assertions: evaluation.evidence_bound_assertions,
    evidence_binding_polarities: evaluation.evidence_binding_polarities,
    source_content_capture_state: "PENDING_NOT_ARCHIVED",
    record_integrity_digest_covers_source_content: false,
    review_due_at: evaluation.review_due_at,
    required_assertion_count: evaluation.required_assertion_count,
    satisfied_assertion_count: evaluation.satisfied_assertion_count,
    decision: "PASS",
    decision_semantics: "POLICY_AND_EVIDENCE_PREFLIGHT_PASS_ONLY",
    purpose_policy_preflight_pass: true,
    scope_source_pool_ready: false,
    bounded_shadow_rights_policy_preflight_pass: pkg.purpose === "BOUNDED_SHADOW_ACQUISITION",
    bounded_shadow_acquisition_planning_preflight_pass: pkg.purpose === "BOUNDED_SHADOW_ACQUISITION",
    runtime_admission_ready: false,
    runtime_admission_materialized: false,
    runtime_admission_event_emitted: false,
    runtime_admission_missing_requirements: [
      "CURRENT_ASI_PURPOSE_ADMISSION",
      "ADMISSION_ID",
      "CLASSIFICATION_GROUP_ID",
      "QUALIFICATION_GROUP_ID",
      "FOUR_CLASSIFICATION_ASSERTION_FAN_IN",
      "SEVEN_QUALIFICATION_ASSERTION_FAN_IN"
    ],
    acquisition_authorized: false,
    collection_execution_authorized: false,
    market_claim_authorized: false,
    demand_or_liquidity_claim_authorized: false,
    public_projection_authorized: false,
    commercial_projection_authorized: false,
    production_authorized: false
  };
  record.binding_hash = fingerprint(record);
  return record;
}

export function compileSourceRightsReview(inputs = loadSourceRightsReviewInputs()) {
  validateSourceRightsReviewInputs(inputs);
  const { contract, sourceAdmissionMethodology, review, claimRecords, evidenceAssertionBindings, frontierContract, purposePolicy, scopeRegistry, scopePoolReadiness, eventSchema, bootstrap } = inputs;
  const inputFingerprints = {
    review_contract: fingerprint(contract),
    source_admission_methodology: fingerprint(sourceAdmissionMethodology),
    review_data: fingerprint(review),
    normalized_primary_claim_records: fingerprint(claimRecords),
    evidence_assertion_bindings: fingerprint(evidenceAssertionBindings),
    frontier_contract: fingerprint(frontierContract),
    purpose_policy: fingerprint(purposePolicy),
    scope_registry: fingerprint(scopeRegistry),
    scope_pool_readiness: fingerprint(scopePoolReadiness),
    event_schema: fingerprint(eventSchema),
    bootstrap_capture: bootstrap.bootstrap_fingerprint
  };
  const snapshotRef = fingerprint(inputFingerprints);
  const evidenceById = new Map(review.evidence.map(item => [item.evidence_id, item]));
  const evidenceBindingById = new Map(evidenceAssertionBindings.bindings.map(item => [item.evidence_id, item]));
  const observations = [];
  const policyBindings = [];
  for (const sourceReview of [...review.reviews].sort((left, right) => left.review_id.localeCompare(right.review_id))) {
    const packages = [];
    for (const pkg of [...sourceReview.purpose_packages].sort((left, right) => left.package_id.localeCompare(right.package_id))) {
      const evaluation = evaluatePackage(sourceReview, pkg, evidenceById, evidenceBindingById, contract, review.observed_at);
      packages.push({
        ...evaluation,
        scope_ids: [...pkg.scope_ids].sort(),
        source_roles: [...pkg.source_roles].sort(),
        region: pkg.region,
        language: pkg.language,
        input_fields: [...pkg.input_fields].sort(),
        excluded_material: [...pkg.excluded_material].sort(),
        output_class: pkg.output_class,
        rights: pkg.rights,
        access: pkg.access,
        market_semantics: pkg.market_semantics,
        human_gate_ref: pkg.human_gate_ref
      });
      if (evaluation.decision === "PASS") {
        for (const scopeId of [...pkg.scope_ids].sort()) {
          for (const sourceRole of [...pkg.source_roles].sort()) {
            policyBindings.push(policyPreflightBinding(sourceReview, pkg, evaluation, scopeId, sourceRole, snapshotRef, review.observed_at, bootstrap));
          }
        }
      }
    }
    observations.push({
      review_id: sourceReview.review_id,
      source_id: sourceReview.source_kind === "GLOBAL_POOL_R1_TARGET_CANDIDATE"
        ? `source_${sourceReview.source_record_id}`
        : `source_channel_${sourceReview.channel_id.toLowerCase()}`,
      source_kind: sourceReview.source_kind,
      source_record_id: sourceReview.source_record_id,
      channel_id: sourceReview.channel_id,
      display_name: sourceReview.display_name,
      canonical_host: sourceReview.canonical_host,
      owner_lineage: sourceReview.owner_lineage,
      context_only: sourceReview.context_only,
      purpose_packages: packages
    });
  }
  policyBindings.sort((left, right) => left.binding_id.localeCompare(right.binding_id));

  const allPackages = observations.flatMap(source => source.purpose_packages.map(pkg => ({ source, pkg })));
  const reviewedSourceIds = new Set(observations.map(source => source.source_id));
  assert(reviewedSourceIds.size === observations.length, "Compiled observations contain duplicate logical source IDs.");
  const eligibleSources = new Set(allPackages.filter(item => item.pkg.decision === "PASS").map(item => item.source.source_id));
  const heldSources = new Set(allPackages.filter(item => item.pkg.decision === "HOLD").map(item => item.source.source_id));
  const rejectedSources = new Set(allPackages.filter(item => item.pkg.decision === "REJECT").map(item => item.source.source_id));
  const boundedEligibleSources = new Set(allPackages.filter(item =>
    item.pkg.decision === "PASS" && item.pkg.purpose === "BOUNDED_SHADOW_ACQUISITION"
  ).map(item => item.source.source_id));
  const evidenceCompleteSources = new Set(observations.filter(source =>
    source.purpose_packages.every(pkg => pkg.evidence_claim_record_refs.length > 0 && pkg.evidence_claim_record_refs.length === pkg.evidence_claim_record_integrity_digests.length)
  ).map(source => source.source_id));
  const recordedEvidenceClaims = review.evidence.filter(item => item.claim_record_state === "NORMALIZED_PRIMARY_CLAIM_RECORD_RECORDED");
  const pendingClaimRecordEvidence = review.evidence.filter(item => item.claim_record_state === "PRIMARY_URL_CLAIM_RECORDED_CLAIM_RECORD_PENDING");
  const targetEligibleSources = new Set(allPackages.filter(item =>
    item.pkg.decision === "PASS" && item.source.source_kind === "GLOBAL_POOL_R1_TARGET_CANDIDATE"
  ).map(item => item.source.source_id));
  const frontierEligibleSources = new Set(allPackages.filter(item =>
    item.pkg.decision === "PASS" && item.source.source_kind === "FRONTIER_DISCOVERY_CHANNEL"
  ).map(item => item.source.source_id));

  const bindingsByScope = new Map();
  for (const binding of policyBindings) {
    const current = bindingsByScope.get(binding.scope_id) ?? [];
    current.push(binding);
    bindingsByScope.set(binding.scope_id, current);
  }
  const scopeReadiness = scopeRegistry.scopes.map(scope => {
    const bindings = bindingsByScope.get(scope.scope_id) ?? [];
    const roles = sortedUnique(bindings.map(binding => binding.source_role));
    return {
      scope_id: scope.scope_id,
      purpose_policy_preflight_pass_binding_count: bindings.length,
      purpose_policy_preflight_pass_role_count: roles.length,
      purpose_policy_preflight_pass_roles: roles,
      canonical_region_language_coverage_credit: 0,
      canonical_required_role_count: scopePoolReadiness.minimums.required_source_roles_per_scope,
      canonical_scope_ready_candidate_minimum: scopePoolReadiness.minimums.scope_ready_candidates_per_scope,
      bounded_live_adapter_ready_count: 0,
      critical_role_fallback_ready: false,
      full_scope_pool_ready: false,
      reason_codes: [
        "PURPOSE_POLICY_PREFLIGHT_IS_NOT_FULL_SCOPE_POOL_READINESS",
        "SEVEN_REQUIRED_ROLES_NOT_CLEARED",
        "CRITICAL_ROLE_FALLBACKS_NOT_READY",
        "BOUNDED_LIVE_ADAPTER_NOT_READY",
        "ACQUISITION_EXECUTION_NOT_AUTHORIZED"
      ]
    };
  }).sort((left, right) => left.scope_id.localeCompare(right.scope_id));

  const output = {
    id: "kidults-asi-source-pool-purpose-eligibility-r1",
    record_type: "asi_source_pool_purpose_eligibility",
    version: "1.0.0",
    status: "PURPOSE_POLICY_PREFLIGHT_SHADOW",
    generated_at: review.observed_at,
    input_fingerprints: inputFingerprints,
    input_snapshot_ref: snapshotRef,
    source_admission_methodology_alignment: {
      parent_methodology_ref: contract.canonical_inputs.source_admission_methodology,
      parent_methodology_id: sourceAdmissionMethodology.id,
      parent_methodology_version: sourceAdmissionMethodology.version,
      parent_status: sourceAdmissionMethodology.status,
      parent_execution_mode: sourceAdmissionMethodology.execution_mode,
      profile_role: contract.source_admission_methodology_alignment.profile_role,
      purpose_crosswalk: contract.source_admission_methodology_alignment.purpose_crosswalk,
      state_crosswalk: contract.source_admission_methodology_alignment.state_crosswalk,
      parent_admission_state_emitted: false,
      runtime_admission_event_emitted: false,
      production: "HOLD"
    },
    review_slice_is_not_market_completeness: true,
    numeric_global_site_target: null,
    decision_semantics: {
      pass_means: "POLICY_AND_EVIDENCE_PREFLIGHT_PASS_ONLY",
      pass_is_legal_conclusion: false,
      pass_is_independent_legal_review: false,
      independent_legal_review_complete: false,
      independent_legal_review_state: "NOT_COMPLETED",
      pass_package_claim_record_integrity_state: "ALL_PASS_NORMALIZED_CLAIM_RECORDS_INTEGRITY_VERIFIED",
      source_content_reproducibility_state: "PENDING_NOT_ARCHIVED",
      normalized_claim_record_digest_covers_source_content: false,
      collection_execution_authorized: false,
      public_or_commercial_projection_authorized: false
    },
    summary: {
      reviewed_source_count: reviewedSourceIds.size,
      reviewed_real_target_source_count: observations.filter(item => item.source_kind === "GLOBAL_POOL_R1_TARGET_CANDIDATE").length,
      reviewed_frontier_channel_count: observations.filter(item => item.source_kind === "FRONTIER_DISCOVERY_CHANNEL").length,
      reviewed_purpose_package_count: allPackages.length,
      normalized_claim_record_complete_source_count: evidenceCompleteSources.size,
      evidence_claim_count: review.evidence.length,
      normalized_claim_record_integrity_verified_count: recordedEvidenceClaims.length,
      pending_normalized_claim_record_count: pendingClaimRecordEvidence.length,
      normalized_claim_record_integrity_state: pendingClaimRecordEvidence.length === 0
        ? "ALL_REVIEW_CLAIM_RECORDS_VERIFIED"
        : "PASS_PACKAGE_CLAIM_RECORDS_VERIFIED_REVIEW_SLICE_PARTIAL",
      source_content_capture_complete_count: 0,
      source_content_capture_pending_count: review.evidence.length,
      source_content_reproducibility_state: "PENDING_NOT_ARCHIVED",
      independent_legal_review_complete: false,
      independent_legal_review_state: "NOT_COMPLETED",
      purpose_policy_preflight_pass_package_count: allPackages.filter(item => item.pkg.decision === "PASS").length,
      held_purpose_package_count: allPackages.filter(item => item.pkg.decision === "HOLD").length,
      rejected_purpose_package_count: allPackages.filter(item => item.pkg.decision === "REJECT").length,
      purpose_policy_preflight_pass_binding_count: policyBindings.length,
      purpose_policy_preflight_pass_source_count: eligibleSources.size,
      held_source_count: heldSources.size,
      rejected_source_count: rejectedSources.size,
      source_records_with_only_hold_or_reject: observations.filter(source => !eligibleSources.has(source.source_id)).length,
      purpose_policy_preflight_pass_frontier_channel_count: frontierEligibleSources.size,
      purpose_policy_preflight_pass_target_source_count: targetEligibleSources.size,
      bounded_shadow_rights_policy_preflight_pass_source_count: boundedEligibleSources.size,
      runtime_admission_events_emitted: 0,
      canonical_region_language_coverage_credit: 0,
      public_or_commercial_projection_policy_preflight_pass_count: allPackages.filter(item =>
        item.pkg.decision === "PASS" && item.pkg.purpose === "PUBLIC_OR_COMMERCIAL_PROJECTION"
      ).length,
      market_event_evidence_policy_preflight_pass_count: allPackages.filter(item =>
        item.pkg.decision === "PASS" && item.pkg.source_roles.some(role => marketRoles.has(role))
      ).length,
      full_scope_pool_ready_count: 0,
      indexes_computed: 0,
      deployed_alignment_percent: 0,
      production: "HOLD"
    },
    decision_boundaries: {
      source_receives_one_global_pass: false,
      purpose_policy_preflight_authorizes_acquisition_execution: false,
      purpose_policy_preflight_authorizes_market_claim: false,
      museum_or_institutional_sources_are_context_only: true,
      hold_or_reject_admission_events_emitted: 0,
      runtime_admission_events_emitted: 0,
      policy_preflight_bindings_are_runtime_events: false,
      acquisition_planned_events_emitted: 0,
      public_projection_authorized: false,
      production_authorized: false
    },
    review_observations: observations,
    purpose_eligibility_bindings: policyBindings,
    canonical_scope_pool_readiness: {
      canonical_scope_count: scopeRegistry.scope_count,
      required_roles_per_scope: scopePoolReadiness.minimums.required_source_roles_per_scope,
      full_scope_pool_ready_count: 0,
      scopes: scopeReadiness
    },
    public_projection: false,
    commercial_projection: false,
    production: "HOLD"
  };
  output.eligibility_fingerprint = outputFingerprint(output);
  assertCompiledSourceRightsReview(output, inputs);
  return output;
}

export function assertCompiledSourceRightsReview(output, inputs = loadSourceRightsReviewInputs()) {
  assert(output.eligibility_fingerprint === outputFingerprint(output), "Eligibility output fingerprint mismatch.");
  const expectedInputFingerprints = {
    review_contract: fingerprint(inputs.contract),
    source_admission_methodology: fingerprint(inputs.sourceAdmissionMethodology),
    review_data: fingerprint(inputs.review),
    normalized_primary_claim_records: fingerprint(inputs.claimRecords),
    evidence_assertion_bindings: fingerprint(inputs.evidenceAssertionBindings),
    frontier_contract: fingerprint(inputs.frontierContract),
    purpose_policy: fingerprint(inputs.purposePolicy),
    scope_registry: fingerprint(inputs.scopeRegistry),
    scope_pool_readiness: fingerprint(inputs.scopePoolReadiness),
    event_schema: fingerprint(inputs.eventSchema),
    bootstrap_capture: inputs.bootstrap.bootstrap_fingerprint
  };
  assert(stableJson(output.input_fingerprints) === stableJson(expectedInputFingerprints), "Eligibility output input fingerprints are stale.");
  assert(output.input_snapshot_ref === fingerprint(expectedInputFingerprints), "Eligibility output input snapshot ref is stale.");
  assert(output.source_admission_methodology_alignment?.parent_methodology_ref === inputs.contract.canonical_inputs.source_admission_methodology &&
    output.source_admission_methodology_alignment?.parent_methodology_id === inputs.sourceAdmissionMethodology.id &&
    output.source_admission_methodology_alignment?.parent_methodology_version === inputs.sourceAdmissionMethodology.version &&
    output.source_admission_methodology_alignment?.parent_status === "ACTIVE_P0" &&
    output.source_admission_methodology_alignment?.parent_execution_mode === "DEV_SHADOW_ONLY" &&
    output.source_admission_methodology_alignment?.profile_role === "PURPOSE_SPECIFIC_SHADOW_PREFLIGHT_IMPLEMENTATION_PROFILE" &&
    stableJson(output.source_admission_methodology_alignment?.purpose_crosswalk) ===
      stableJson(inputs.contract.source_admission_methodology_alignment.purpose_crosswalk) &&
    stableJson(output.source_admission_methodology_alignment?.state_crosswalk) ===
      stableJson(inputs.contract.source_admission_methodology_alignment.state_crosswalk) &&
    output.source_admission_methodology_alignment?.parent_admission_state_emitted === false &&
    output.source_admission_methodology_alignment?.runtime_admission_event_emitted === false &&
    output.source_admission_methodology_alignment?.production === "HOLD",
  "Compiled source-admission methodology alignment drifted.");
  assert(output.generated_at === inputs.review.observed_at, "Eligibility output generation time drifted from the review snapshot.");
  const outputGeneratedAt = Date.parse(output.generated_at);
  assert(Number.isFinite(outputGeneratedAt), "Eligibility output generated_at is invalid.");
  assert(output.summary.reviewed_source_count === 13, "Compiled reviewed-source count drifted.");
  assert(output.summary.reviewed_real_target_source_count === 11, "Compiled target-source count drifted.");
  assert(output.summary.reviewed_frontier_channel_count === 2, "Compiled frontier-channel count drifted.");
  assert(output.summary.reviewed_purpose_package_count === 14, "Compiled purpose-package count drifted.");
  assert(output.summary.evidence_claim_count === 18 && output.summary.normalized_claim_record_integrity_verified_count === 16 && output.summary.pending_normalized_claim_record_count === 2,
    "Normalized claim record integrity counts drifted.");
  assert(output.summary.normalized_claim_record_integrity_state === "PASS_PACKAGE_CLAIM_RECORDS_VERIFIED_REVIEW_SLICE_PARTIAL",
    "Normalized claim record integrity state drifted.");
  assert(output.summary.source_content_capture_complete_count === 0 && output.summary.source_content_capture_pending_count === 18 &&
    output.summary.source_content_reproducibility_state === "PENDING_NOT_ARCHIVED",
  "Source-content capture/reproducibility boundary regressed.");
  assert(output.summary.independent_legal_review_complete === false && output.summary.independent_legal_review_state === "NOT_COMPLETED",
    "Independent legal review boundary regressed.");
  assert(output.decision_semantics?.pass_means === "POLICY_AND_EVIDENCE_PREFLIGHT_PASS_ONLY",
    "Compiled PASS semantics regressed.");
  assert(output.decision_semantics?.pass_is_legal_conclusion === false && output.decision_semantics?.pass_is_independent_legal_review === false,
    "Compiled PASS cannot imply legal review or conclusion.");
  assert(output.summary.purpose_policy_preflight_pass_package_count === 4, "Exactly four evidence-supported purpose packages must pass R1.");
  assert(output.summary.held_purpose_package_count === 7, "Exactly seven R1 purpose packages must remain HOLD.");
  assert(output.summary.rejected_purpose_package_count === 3, "Exactly three prohibited R1 purpose packages must be REJECT.");
  assert(output.summary.purpose_policy_preflight_pass_source_count === 3, "R1 must have three purpose-specific eligible sources.");
  assert(output.summary.purpose_policy_preflight_pass_target_source_count === 1, "Only MoMA metadata may qualify among reviewed target sources.");
  assert(output.summary.purpose_policy_preflight_pass_frontier_channel_count === 2, "Wikidata and DataCite discovery channels must be the only frontier passes.");
  assert(output.summary.bounded_shadow_rights_policy_preflight_pass_source_count === 1,
    "Only MoMA metadata may pass bounded SHADOW policy/evidence preflight.");
  assert(output.summary.runtime_admission_events_emitted === 0, "Policy preflight must not emit runtime admission events.");
  assert(output.summary.public_or_commercial_projection_policy_preflight_pass_count === 0, "Public or commercial projection must remain zero.");
  assert(output.summary.market_event_evidence_policy_preflight_pass_count === 0, "Market-event evidence eligibility must remain zero.");
  assert(output.summary.full_scope_pool_ready_count === 0, "No full Scope Source Pool may be promoted by this review slice.");
  assert(output.summary.production === "HOLD" && output.production === "HOLD", "Production boundary regressed.");
  assert(output.public_projection === false && output.commercial_projection === false,
    "Compiled output cannot authorize public or commercial projection.");
  assert(output.decision_semantics?.collection_execution_authorized === false &&
    output.decision_semantics?.public_or_commercial_projection_authorized === false,
  "Compiled decision semantics authorized a forbidden downstream effect.");
  assert(!Object.hasOwn(output, "purpose_admission_events"), "Policy artifact must not expose a runtime admission-event collection.");
  assert(output.purpose_eligibility_bindings.length === output.summary.purpose_policy_preflight_pass_binding_count,
    "Eligible policy-preflight binding count drifted.");
  assert(new Set(output.purpose_eligibility_bindings.map(binding => binding.binding_id)).size === output.purpose_eligibility_bindings.length,
    "Policy-preflight binding IDs must be unique.");
  const runtimeEventKeys = ["event_id", "event_type", "event_version", "producer_engine", "idempotency_key", "partition", "payload_hash", "payload"];
  const packageById = new Map(output.review_observations.flatMap(source =>
    source.purpose_packages.map(pkg => [pkg.package_id, pkg])
  ));
  for (const pkg of packageById.values()) {
    assert(Number.isFinite(Date.parse(pkg.evidence_observed_at_max)) &&
      Date.parse(pkg.evidence_observed_at_max) <= outputGeneratedAt,
    `${pkg.package_id}: evidence observation is after the compiled review snapshot.`);
    if (pkg.normalized_claim_record_recorded_at_max !== null) {
      assert(Number.isFinite(Date.parse(pkg.normalized_claim_record_recorded_at_max)) &&
        Date.parse(pkg.normalized_claim_record_recorded_at_max) <= outputGeneratedAt,
      `${pkg.package_id}: normalized claim record time is after the compiled review snapshot.`);
    }
  }
  for (const binding of output.purpose_eligibility_bindings) {
    const { binding_hash: ignored, ...unsignedBinding } = binding;
    assert(binding.binding_hash === fingerprint(unsignedBinding), `${binding.binding_id}: binding integrity digest mismatch.`);
    assert(binding.record_type === "source_purpose_policy_preflight_binding" && binding.decision === "PASS",
      `${binding.binding_id}: binding type or decision drifted.`);
    if (binding.source_kind === "GLOBAL_POOL_R1_TARGET_CANDIDATE") {
      assert(binding.channel_id === inputs.bootstrap.queue_seed_discovery_channel_id &&
        binding.bootstrap_discovery_channel_id === inputs.bootstrap.queue_seed_discovery_channel_id &&
        binding.bootstrap_discovery_processor_fleet_id === inputs.bootstrap.queue_seed_processor_fleet_id,
      `${binding.binding_id}: target discovery channel/fleet provenance drifted.`);
      assert(binding.frontier_scope_role_policy_binding_ref === null,
        `${binding.binding_id}: target source cannot claim frontier Scope/Role policy provenance.`);
    } else {
      assert(binding.frontier_scope_role_policy_binding_ref ===
        `repo:${reviewContractRepoPath}#frontier_channel_scope_role_bindings_r1/channels/${binding.channel_id}`,
      `${binding.binding_id}: frontier Scope/Role policy provenance is missing or stale.`);
      const frontierPolicyBinding = inputs.contract.frontier_channel_scope_role_bindings_r1.channels[binding.channel_id];
      assert(frontierPolicyBinding.scope_ids.includes(binding.scope_id) && frontierPolicyBinding.source_roles.includes(binding.source_role),
        `${binding.binding_id}: frontier policy-preflight grain is outside its exact channel policy binding.`);
    }
    assert(runtimeEventKeys.every(key => !Object.hasOwn(binding, key)),
      `${binding.binding_id}: policy-preflight binding impersonates a runtime event.`);
    assert(binding.decided_at === output.generated_at, `${binding.binding_id}: binding timestamp drifted from reviewed snapshot.`);
    assert(binding.required_assertion_count === binding.satisfied_assertion_count,
      `${binding.binding_id}: incomplete assertions entered PASS binding.`);
    assert(binding.required_evidence_bound_assertions.every(assertion => binding.evidence_bound_assertions.includes(assertion)),
      `${binding.binding_id}: PASS assertion lacks source/operator-matched evidence coverage.`);
    assert(Object.entries(binding.rights).every(([facet, state]) =>
      state !== "ALLOW" || binding.evidence_bound_assertions.includes(`RIGHT_${facet.toUpperCase()}_ALLOW`)
    ), `${binding.binding_id}: propagated ALLOW right lacks matching evidence coverage.`);
    assert(binding.evidence_binding_polarities.length > 0 &&
      binding.evidence_binding_polarities.every(polarity => polarity === inputs.contract.pass_evidence_polarity),
    `${binding.binding_id}: PASS binding includes incompatible or negative evidence polarity.`);
    assert(binding.evidence_claim_record_refs.length > 0 &&
      binding.evidence_claim_record_refs.length === binding.evidence_claim_record_integrity_digests.length,
    `${binding.binding_id}: PASS binding lacks normalized claim record integrity evidence.`);
    assert(binding.evidence_assertion_binding_fingerprints.length === binding.evidence_claim_record_refs.length &&
      binding.evidence_assertion_binding_fingerprints.every(value => /^sha256:[a-f0-9]{64}$/.test(value)),
    `${binding.binding_id}: PASS binding lacks evidence assertion binding fingerprints.`);
    assert(Date.parse(binding.evidence_observed_at_max) <= outputGeneratedAt &&
      Date.parse(binding.normalized_claim_record_recorded_at_max) <= outputGeneratedAt,
    `${binding.binding_id}: PASS evidence timeline is after the compiled review snapshot.`);
    const packageObservation = packageById.get(binding.package_id);
    assert(packageObservation && binding.evidence_observed_at_max === packageObservation.evidence_observed_at_max &&
      binding.normalized_claim_record_recorded_at_max === packageObservation.normalized_claim_record_recorded_at_max,
    `${binding.binding_id}: binding evidence timeline drifted from its package observation.`);
    assert(binding.evidence_claim_record_integrity_digests.every(digest => /^sha256:[a-f0-9]{64}$/.test(digest)),
      `${binding.binding_id}: PASS binding carries an invalid normalized claim record digest.`);
    assert(binding.source_content_capture_state === "PENDING_NOT_ARCHIVED" && binding.record_integrity_digest_covers_source_content === false,
      `${binding.binding_id}: normalized record digest was laundered into a source-content capture claim.`);
    assert(binding.runtime_admission_ready === false && binding.runtime_admission_event_emitted === false,
      `${binding.binding_id}: policy preflight was laundered into runtime admission.`);
    assert(binding.runtime_admission_materialized === false && binding.scope_source_pool_ready === false,
      `${binding.binding_id}: policy preflight was laundered into runtime or Scope-pool readiness.`);
    assert(binding.region === "GLOBAL" && binding.language === "mul" &&
      binding.geographic_grain_semantics === "GLOBAL_UMBRELLA_NON_MARKET_ZERO_CANONICAL_COVERAGE_CREDIT" &&
      binding.canonical_region_language_coverage_credit === 0,
    `${binding.binding_id}: non-market umbrella grain gained canonical regional coverage credit.`);
    assert(binding.runtime_admission_missing_requirements.length === 6,
      `${binding.binding_id}: runtime admission fan-in gaps are incomplete.`);
    assert(binding.purpose_policy_preflight_pass === true, `${binding.binding_id}: purpose eligibility missing.`);
    assert(binding.acquisition_authorized === false && binding.collection_execution_authorized === false,
      `${binding.binding_id}: eligibility improperly authorized acquisition or collection.`);
    assert(binding.market_claim_authorized === false && binding.demand_or_liquidity_claim_authorized === false,
      `${binding.binding_id}: eligibility improperly authorized a market claim.`);
    assert(binding.public_projection_authorized === false && binding.commercial_projection_authorized === false,
      `${binding.binding_id}: eligibility improperly authorized projection.`);
    assert(binding.production_authorized === false, `${binding.binding_id}: eligibility improperly authorized Production.`);
    if (binding.context_only) assert(contextAllowedRoles.has(binding.source_role) && !marketRoles.has(binding.source_role),
      `${binding.binding_id}: context source entered a market role.`);
  }
  const nonPassPackageIds = new Set(output.review_observations.flatMap(source =>
    source.purpose_packages.filter(pkg => pkg.decision !== "PASS").map(pkg => pkg.package_id)
  ));
  assert(output.purpose_eligibility_bindings.every(binding => !nonPassPackageIds.has(binding.package_id)),
    "HOLD or REJECT package emitted a policy-preflight PASS binding.");
  assert(output.decision_boundaries.hold_or_reject_admission_events_emitted === 0, "HOLD or REJECT event count must remain zero.");
  assert(output.decision_boundaries.runtime_admission_events_emitted === 0 &&
    output.decision_boundaries.policy_preflight_bindings_are_runtime_events === false,
  "Policy-preflight bindings must remain outside runtime event routing.");
  assert(output.decision_boundaries.acquisition_planned_events_emitted === 0, "Review compiler cannot emit acquisition plans.");
  assert(output.canonical_scope_pool_readiness.canonical_scope_count === 32, "Scope readiness summary must cover 32 Scopes.");
  assert(output.canonical_scope_pool_readiness.scopes.length === 32, "Scope readiness rows must cover 32 Scopes.");
  assert(output.canonical_scope_pool_readiness.scopes.every(scope => scope.full_scope_pool_ready === false),
    "Purpose-specific eligibility cannot mark a full Scope Source Pool ready.");
}

export function writeSourceRightsReview(output, contract = loadSourceRightsReviewInputs().contract) {
  const outputPath = resolveRepoPath(contract.output);
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  return outputPath;
}

async function main() {
  const inputs = loadSourceRightsReviewInputs();
  const output = compileSourceRightsReview(inputs);
  const outputPath = writeSourceRightsReview(output, inputs.contract);
  console.log(`KIDULTS ASI source rights/access review compiled: ${path.relative(repositoryRoot, outputPath)}`);
  console.log(`Reviewed sources / policy-preflight PASS packages / policy bindings: ${output.summary.reviewed_source_count} / ${output.summary.purpose_policy_preflight_pass_package_count} / ${output.summary.purpose_policy_preflight_pass_binding_count}`);
  console.log(`Bounded SHADOW rights-preflight PASS sources / market-event preflight passes / full Scope pools ready: ${output.summary.bounded_shadow_rights_policy_preflight_pass_source_count} / 0 / 0`);
  console.log("Acquisition execution: NOT AUTHORIZED; public/commercial projection: 0; Production: HOLD");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
