import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
const root = process.cwd();
const envelope = JSON.parse(fs.readFileSync("coordination/kidults/governance/autonomous-approval-policy-envelope-v1.json", "utf8"));
test("repository-wide approval envelope is internally consistent", () => {
  const result = spawnSync(process.execPath, ["scripts/governance/validate-autonomous-approval-policy-envelope-v1.mjs"], {cwd:root,encoding:"utf8"});
  assert.equal(result.status, 0, result.stderr);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.state, "VERIFIED_PASS");
  assert.equal(receipt.internal_owner_reapproval, "FORBIDDEN_WHILE_ENVELOPE_VALID");
});
test("bounded recovery cannot expand authority", () => {
  for (const route of ["INTERNAL_REVERSIBLE", "STAGING_BOUNDED"]) {
    assert.equal(envelope.classes[route].maximum_attempts, 3);
    assert.equal(envelope.classes[route].same_tree_recovery, "ALLOWED");
  }
  for (const cause of ["HEAD_TREE_CHANGED", "SCOPE_DIGEST_CHANGED", "OWNER_RESERVED_BOUNDARY_CROSSED"]) assert.ok(envelope.invalidation.includes(cause));
});
test("external boundaries and holds remain Owner-reserved", () => {
  for (const action of ["PRODUCTION", "PUBLIC", "G5", "EXTERNAL_COMMUNICATION", "EXTERNAL_SPEND", "CREDENTIAL_OR_PERMISSION_EXPANSION", "DESTRUCTIVE_DATA_OPERATION"]) assert.ok(envelope.owner_reserved_actions.includes(action), action);
  assert.deepEqual(Object.values(envelope.holds), ["HOLD", "HOLD", "HOLD", "HOLD"]);
});
test("approval inventory is a complete digest-bound Git-object manifest", () => {
  const inventory=JSON.parse(fs.readFileSync("coordination/kidults/governance/approval-policy-inventory-v1.json","utf8"));
  const manifest=JSON.parse(fs.readFileSync("coordination/kidults/governance/approval-policy-file-manifest-v1.json","utf8"));
  assert.equal(inventory.audit.approval_related_files_reviewed,manifest.files.length);
  assert.equal(inventory.audit.manifest_sha256,manifest.manifest_sha256);
  assert.ok(manifest.files.every(value=>value.path&&value.classification&&value.git_blob&&value.sha256));
  assert.equal(new Set(manifest.files.map(value=>value.path)).size,manifest.files.length);
});
test("draft ready recovery is reserved, rebound, revalidated, then merged", () => {
  const source=fs.readFileSync("scripts/kidults/kpmo/run-autonomous-internal-landing-v1.mjs","utf8");
  const finalizer=source.slice(source.indexOf("const candidate=await validateLiveCandidate"));
  const ordered=[
    "action:'CREATE_RESERVATION'",
    "await rebindDraftReady(candidate.pr)",
    "await waitForReadyCandidate()",
    "await publishLandingStatus('success'",
    "method:'PUT'",
  ].map(fragment=>finalizer.indexOf(fragment));
  assert.ok(ordered.every(index=>index>=0),`missing lifecycle operation: ${ordered}`);
  assert.deepEqual([...ordered].sort((a,b)=>a-b),ordered,"lifecycle mutation order drifted");
  assert.match(source,/if \(!envelope\.recovery\) throw new AutonomousLandingError\('AUTONOMOUS_DRAFT_READY_RECOVERY_REQUIRED'\)/);
  assert.match(source,/validateDraftReadyRebind\(\{before,after,envelope,policy\}\)/);
});
test("approval roles derive decisions before durable signing", () => {
  const source=fs.readFileSync("scripts/kidults/kpmo/run-autonomous-internal-landing-v1.mjs","utf8");
  const approval=source.slice(source.indexOf("if (mode === 'APPROVAL')"),source.indexOf("} else {",source.indexOf("if (mode === 'APPROVAL')")));
  const derive=approval.indexOf("deriveApprovalDecision({envelope,role:approvalRole");
  const sign=approval.indexOf("putApproval()");
  assert.ok(derive>=0&&sign>derive,"caller assertion could reach signing before live decision derivation");
  assert.match(source,/statuses:candidate\.statuses,checks:candidate\.checks/);
});
test("staging bounded execution is allowlisted and immutable", () => {
  const executor=JSON.parse(fs.readFileSync("coordination/kidults/governance/autonomous-staging-bounded-executor-v1.json","utf8"));
  assert.equal(envelope.classes.STAGING_BOUNDED.executor,executor.id);
  assert.equal(executor.arbitrary_command_execution,false);
  assert.deepEqual(executor.operations.map(value=>value.operation).sort(),["CLOUDTRAIL_CONTINUOUS_ASSURANCE","OBJECT_LOCK_CONTINUOUS_ASSURANCE"]);
  assert.ok(executor.operations.every(value=>value.immutable_terminal_receipt&&value.exact_main_sha_input==="expected_main_sha"));
  assert.ok(executor.forbidden_operations.includes("CLOUDFORMATION_IAM_PERMISSION_EXPANSION"));
});
