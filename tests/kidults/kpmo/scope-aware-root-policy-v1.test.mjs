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

test("committed evidence receipts are covered by the governance scope", () => {
  const policy = JSON.parse(readFileSync(policyPath, "utf8"));
  const matches = policy.scope_rules.filter((rule) =>
    rule.prefixes?.some((prefix) => "evidence/staging-operations/receipt.json".startsWith(prefix)),
  );

  assert.deepEqual(matches.map((rule) => rule.id), ["governance-and-data"]);
});

test("trust-engine source is routed through technical and governed coverage", () => {
  const policy = JSON.parse(readFileSync(policyPath, "utf8"));
  const filename = "src/trust/rebuild/decision-engine.mjs";
  const matches = policy.scope_rules.filter((rule) =>
    rule.exact_paths?.includes(filename)
      || rule.prefixes?.some((prefix) => filename.startsWith(prefix)),
  );

  assert.deepEqual(matches.map((rule) => rule.id), ["implementation-and-tests"]);
});

test("unknown top-level source remains fail-closed and unmatched", () => {
  const policy = JSON.parse(readFileSync(policyPath, "utf8"));
  const filename = "unknown-runtime/decision-engine.mjs";
  const matches = policy.scope_rules.filter((rule) =>
    rule.exact_paths?.includes(filename)
      || rule.prefixes?.some((prefix) => filename.startsWith(prefix)),
  );

  assert.equal(policy.zero_coverage_policy, "FAIL_CLOSED");
  assert.deepEqual(matches, []);
});
