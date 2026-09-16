import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const policyPath = "coordination/kidults/kpmo/scope-aware-required-status-policy-v1.json";

test("the planned root Constitution has exactly one fail-closed validation scope", () => {
  const policy = JSON.parse(readFileSync(policyPath, "utf8"));
  const matches = policy.scope_rules.filter((rule) => rule.exact_paths?.includes("CONSTITUTION.md"));

  assert.equal(policy.zero_coverage_policy, "FAIL_CLOSED");
  assert.deepEqual(matches.map((rule) => rule.id), ["repository-root"]);
});
