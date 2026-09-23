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
