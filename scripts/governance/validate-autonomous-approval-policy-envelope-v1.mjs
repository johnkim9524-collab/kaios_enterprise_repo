import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
const root = process.cwd();
const read = relative => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
const fail = code => { throw new Error(code); };
const envelope = read("coordination/kidults/governance/autonomous-approval-policy-envelope-v1.json");
const inventory = read("coordination/kidults/governance/approval-policy-inventory-v1.json");
const manifest = read("coordination/kidults/governance/approval-policy-file-manifest-v1.json");
const delegated = read("coordination/kidults/governance/delegated-autonomous-internal-authority-policy-v1.json");
const autonomous = read("coordination/kidults/governance/autonomous-internal-landing-policy-v1.json");
const stagingExecutor = read("coordination/kidults/governance/autonomous-staging-bounded-executor-v1.json");
const owner = read("coordination/kidults/kpmo/governed-landing-authorization-policy-v1.json");
const runtime = fs.readFileSync(path.join(root, "scripts/kidults/kpmo/run-autonomous-internal-landing-v1.mjs"), "utf8");
if (envelope.status !== "MANDATORY_FAIL_CLOSED") fail("ENVELOPE_NOT_FAIL_CLOSED");
if (inventory.canonical_envelope !== "coordination/kidults/governance/autonomous-approval-policy-envelope-v1.json") fail("CANONICAL_ENVELOPE_MISMATCH");
if (inventory.audit?.method !== "REPRODUCIBLE_GIT_OBJECT_CONTENT_SCAN" || inventory.audit?.canonical_execution_authorization_policies !== inventory.policies.length) fail("INVENTORY_AUDIT_INVALID");
const sha256 = value => `sha256:${createHash("sha256").update(value).digest("hex")}`;
if (manifest.scan?.method !== "GIT_OBJECT_CONTENT_SCAN" || manifest.scan.file_count !== manifest.files?.length) fail("INVENTORY_MANIFEST_SHAPE_INVALID");
const manifestExclusions=["coordination/kidults/governance/approval-policy-file-manifest-v1.json","coordination/kidults/governance/approval-policy-inventory-v1.json"];
if (JSON.stringify(manifest.scan.exclusions)!==JSON.stringify(manifestExclusions)) fail("INVENTORY_MANIFEST_EXCLUSIONS_INVALID");
if (manifest.manifest_sha256 !== sha256(JSON.stringify(manifest.files))) fail("INVENTORY_MANIFEST_DIGEST_INVALID");
if (inventory.audit?.approval_related_files_reviewed !== manifest.files.length || inventory.audit?.manifest_sha256 !== manifest.manifest_sha256) fail("INVENTORY_MANIFEST_BINDING_INVALID");
const livePaths = execFileSync("git",["grep","-Il","-E",manifest.scan.pattern,"HEAD"],{cwd:root,encoding:"utf8",maxBuffer:64*1024*1024}).trim().split("\n").filter(Boolean).map(value=>value.replace(/^HEAD:/,"" )).filter(value=>!manifestExclusions.includes(value)).sort();
if (JSON.stringify(livePaths) !== JSON.stringify(manifest.files.map(value=>value.path))) fail("INVENTORY_MANIFEST_PATH_SET_DRIFT");
for (const entry of manifest.files) {
  const bytes=execFileSync("git",["show",`HEAD:${entry.path}`],{cwd:root,maxBuffer:64*1024*1024});
  const blob=execFileSync("git",["rev-parse",`HEAD:${entry.path}`],{cwd:root,encoding:"utf8"}).trim();
  if (entry.git_blob!==blob || entry.sha256!==sha256(bytes)) fail(`INVENTORY_MANIFEST_FILE_DRIFT:${entry.path}`);
}
for (const name of ["INTERNAL_REVERSIBLE", "STAGING_BOUNDED"]) {
  const rule = envelope.classes[name];
  if (rule.routine_owner_approval !== "FORBIDDEN") fail(`${name}_ROUTINE_OWNER_APPROVAL_NOT_FORBIDDEN`);
  if (rule.maximum_attempts < 1 || rule.maximum_attempts > 3) fail(`${name}_ATTEMPT_BOUND_INVALID`);
  if (rule.maximum_lifetime_seconds > 7200) fail(`${name}_TTL_TOO_LONG`);
  if (rule.pre_mutation_failure_consumes_authority !== false) fail(`${name}_PRE_MUTATION_FAILURE_BURNS_AUTHORITY`);
}
if (envelope.classes.STAGING_BOUNDED.executor!==stagingExecutor.id || stagingExecutor.risk_class!=="STAGING_BOUNDED" || stagingExecutor.execution_model!=="ALLOWLISTED_EXACT_SHA_WORKFLOW") fail("STAGING_BOUNDED_EXECUTOR_BINDING_INVALID");
if (stagingExecutor.arbitrary_command_execution!==false || stagingExecutor.operations.length<1) fail("STAGING_BOUNDED_EXECUTOR_SCOPE_INVALID");
for (const operation of stagingExecutor.operations) {
  if (!operation.immutable_terminal_receipt || operation.exact_main_sha_input!=="expected_main_sha" || operation.environment!=="KIDULTS-AUTONOMOUS-FINALIZER") fail(`STAGING_BOUNDED_OPERATION_INVALID:${operation.operation}`);
  const workflow=execFileSync("git",["show",`HEAD:${operation.workflow}`],{cwd:root,encoding:"utf8",maxBuffer:64*1024*1024});
  for (const marker of ["expected_main_sha","id-token: write","object-lock-mode COMPLIANCE","PRODUCTION_STATE","PUBLIC_STATE","G5_STATE"]) if (!workflow.includes(marker)) fail(`STAGING_BOUNDED_WORKFLOW_CONTROL_MISSING:${operation.operation}:${marker}`);
}
if (envelope.classes.OWNER_RESERVED.routine_owner_approval !== "REQUIRED_PER_EXACT_ACTION") fail("OWNER_BOUNDARY_WEAKENED");
if (envelope.classes.UNKNOWN.decision !== "FAIL_CLOSED_OWNER_REQUIRED") fail("UNKNOWN_NOT_FAIL_CLOSED");
for (const field of ["HEAD_TREE_CHANGED", "SCOPE_DIGEST_CHANGED", "RISK_CLASS_CHANGED", "OWNER_RESERVED_BOUNDARY_CROSSED"]) if (!envelope.invalidation.includes(field)) fail(`INVALIDATION_MISSING:${field}`);
for (const action of delegated.owner_reserved_actions) if (!envelope.owner_reserved_actions.includes(action)) fail(`OWNER_RESERVED_ACTION_MISSING:${action}`);
for (const policy of [delegated, autonomous]) if (policy.approval_policy_envelope !== envelope.id) fail(`ENVELOPE_BINDING_MISSING:${policy.id}`);
if (owner.routing?.eligible_internal_reversible !== envelope.id || owner.routing?.normal_owner_exact_head_path !== "OWNER_RESERVED_OR_RECOVERY_ONLY") fail("LEGACY_ROUTING_NOT_ISOLATED");
if (!runtime.includes("AUTONOMOUS_ATTEMPT_LIMIT_EXCEEDED") || runtime.includes("AUTONOMOUS_RERUN_FORBIDDEN")) fail("BOUNDED_RUNTIME_RETRY_NOT_ENFORCED");
for (const holds of [envelope.holds, inventory.holds]) if (Object.values(holds).some(value => value !== "HOLD")) fail("HOLD_WEAKENED");
console.log(JSON.stringify({id:envelope.id,state:"VERIFIED_PASS",policy_count:inventory.policies.length,internal_owner_reapproval:"FORBIDDEN_WHILE_ENVELOPE_VALID",owner_reserved:"REQUIRED_PER_EXACT_ACTION",production:"HOLD",public:"HOLD",g5:"HOLD",psa_external_call:"HOLD"}));
