import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import {routeAuthorizationControl,validateAuthorizationRoutingCoverage} from "../../scripts/governance/lib/approval-policy-routing-v1.mjs";
import {assertAutonomousFileScope,collectPaginatedApiValues,sha256,validateLiveChangedPaths} from "../../scripts/kidults/kpmo/lib/autonomous-internal-landing-v1.mjs";
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
  const execution=manifest.files.filter(value=>value.classification==="EXECUTION_AUTHORIZATION_CONTROL");
  assert.equal(execution.length,inventory.audit.routing_coverage.execution_authorization_controls);
  assert.ok(execution.every(value=>value.authorization_routing?.coverage));
});
test("routing coverage rejects omission, stale exemption, and a consumer without an envelope reference", () => {
  const fail=code=>{throw new Error(code)};
  const base={path:".github/workflows/example.yml",classification:"EXECUTION_AUTHORIZATION_CONTROL"};
  assert.throws(()=>validateAuthorizationRoutingCoverage({files:[base],readSource:()=>"",fail}),/EXECUTION_CONTROL_ROUTE_MISSING/);
  assert.throws(()=>validateAuthorizationRoutingCoverage({files:[{...base,authorization_routing:{route:"INTERNAL_REVERSIBLE",coverage:{mode:"EXEMPTION",reason_code:"STALE"}}}],readSource:()=>"",fail}),/EXECUTION_CONTROL_EXEMPTION_INVALID/);
  const fake={...base,authorization_routing:{route:"CANONICAL_ENVELOPE",coverage:{mode:"CONSUMER",consumer:base.path,source_reference:"kidults-autonomous-approval-policy-envelope-v1"}}};
  assert.throws(()=>validateAuthorizationRoutingCoverage({files:[fake],readSource:()=>"no canonical import",fail}),/EXECUTION_CONTROL_CONSUMER_NOT_REFERENCING_ENVELOPE/);
  assert.equal(routeAuthorizationControl("tests/example.test.mjs","owner approval").route,"NON_EXECUTING_REFERENCE");
});
test("live PR files paginate to exhaustion and reject an Owner-reserved path at position 101", async () => {
  const ordinary=Array.from({length:100},(_,index)=>({filename:`src/generated-${String(index).padStart(3,"0")}.mjs`}));
  const reserved={filename:"production/release.yml"};
  const requested=[];
  const files=await collectPaginatedApiValues({request:async endpoint=>{
    requested.push(endpoint);
    return endpoint.endsWith("page=1")?ordinary:[reserved];
  },endpoint:"/pulls/2314/files"});
  assert.equal(files.length,101);
  assert.deepEqual(requested,["/pulls/2314/files?per_page=100&page=1","/pulls/2314/files?per_page=100&page=2"]);
  const paths=files.map(value=>value.filename).sort();
  assert.throws(()=>validateLiveChangedPaths({files,expectedPaths:paths,expectedScopeDigest:sha256(paths.join("\n")),ownerReservedPathPrefixes:["production/"]}),/AUTONOMOUS_OWNER_RESERVED_PATH/);
  const autonomousPolicy=JSON.parse(fs.readFileSync('coordination/kidults/governance/autonomous-internal-landing-policy-v1.json','utf8'));
  assert.deepEqual(assertAutonomousFileScope({files:[{filename:'.github/workflows/internal.yml',patch:'@@ -1 +1,2 @@\n name: internal\n+concurrency: safe'}],policy:autonomousPolicy}),['.github/workflows/internal.yml']);
  assert.throws(()=>assertAutonomousFileScope({files:[{filename:'.github/workflows/internal.yml',patch:'@@ -1 +1,2 @@\n name: internal\n+permissions: write-all'}],policy:autonomousPolicy}),/AUTONOMOUS_OWNER_RESERVED_ACTION/);
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
test("finalizer revalidates paginated checks and shared status identity", () => {
  const source=fs.readFileSync("scripts/kidults/kpmo/run-autonomous-internal-landing-v1.mjs","utf8");
  const binding=fs.readFileSync("scripts/kidults/kpmo/lib/required-gate-evidence-v1.mjs","utf8");
  for(const marker of ["check-runs?filter=all&per_page=100&page=","AUTONOMOUS_REQUIRED_SET_DRIFT","AUTONOMOUS_REQUIRED_CHECK_IDENTITY_DRIFT","bindRequiredGateEvidence"]) assert.ok(source.includes(marker),marker);
  for(const marker of ["value.app?.id","value.sha === headSha","status.state !== 'success'","landingContexts"]) assert.ok(binding.includes(marker),marker);
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
