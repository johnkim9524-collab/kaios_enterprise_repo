import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("the permanent KIDULTS Constitution retains Version 3.0 authority and controls", () => {
  const constitution = read("CONSTITUTION.md");

  for (const required of [
    "**Version:** 3.0",
    "**Owner:** Program Owner",
    "**Authority:** Program Owner — KIDULTS Platform Executive Constitution",
    "**Effective Date:** 2026-09-16",
    "**Revision Policy:**",
    "**Constitution Status:** ACTIVE / HIGHEST GOVERNING DOCUMENT / PERMANENT / REPOSITORY-WIDE / FAIL-CLOSED",
    "Every future implementation SHALL inherit this Constitution.",
    "## Integrated Platform",
    "Every decision SHALL optimize the entire platform.",
    "## Architecture",
    "Duplicate Runtime forbidden.",
    "Duplicate Registry forbidden.",
    "Duplicate Truth forbidden.",
    "Hidden State forbidden.",
    "Implicit Authority forbidden.",
    "Unknown shall ALWAYS become HOLD.",
    "Recovery SHALL permanently reduce future recovery cost.",
    "Protected Main Natural Execution is the authoritative operational proof.",
    "History shall NEVER be rewritten.",
    "When uncertain, produce HOLD, never PASS.",
    "## Provider",
    "The platform SHALL NEVER become dependent on a single provider.",
    "## Supremacy Clause",
    "THIS CONSTITUTION SHALL PREVAIL.",
  ]) {
    assert.ok(constitution.includes(required), `missing constitutional control: ${required}`);
  }
});

test("execution and platform guidance cross-reference the Constitution", () => {
  const references = [
    "README.md",
    "docs/DEVELOPER_GUIDE.md",
    "docs/ARCHITECTURE.md",
    "docs/GOVERNANCE.md",
    "AGENTS.md",
    ".github/AI_AGENT_OPERATING_RULES.md",
    ".github/copilot-instructions.md",
    "docs/recovery/backup-and-restore.md",
    "docs/kidults/platform-track-alignment-directive-v1.md",
    "docs/operations/KIDULTS_REGISTRY_GOVERNANCE_V1.md",
  ];

  for (const path of references) {
    assert.ok(read(path).includes("CONSTITUTION.md"), `${path} must reference CONSTITUTION.md`);
  }
});

test("agent instructions enforce constitutional supremacy without silent override", () => {
  const agents = read("AGENTS.md");
  assert.ok(agents.includes("the Constitution SHALL prevail"));
  assert.ok(agents.includes("no agent may silently ignore, weaken, reorder, or override"));
  assert.ok(agents.includes("surface the conflict and fail closed"));
});

test("the Constitution has an explicit fail-closed validation scope", () => {
  const policy = JSON.parse(read("coordination/kidults/kpmo/scope-aware-required-status-policy-v1.json"));
  const rules = policy.scope_rules.filter((rule) => rule.exact_paths?.includes("CONSTITUTION.md"));
  assert.equal(policy.zero_coverage_policy, "FAIL_CLOSED");
  assert.deepEqual(rules.map((rule) => rule.id), ["repository-root"]);
});
