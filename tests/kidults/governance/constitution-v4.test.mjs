import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("Article 0 is the first constitutional section and retains the V4 foundation", () => {
  const constitution = read("CONSTITUTION.md");
  const sections = [...constitution.matchAll(/^## (.+)$/gm)].map((match) => match[1]);

  assert.equal(sections[0], "Article 0 — KIDULTS SUPREME PLATFORM PHILOSOPHY");
  for (const required of [
    "**Version:** 4.0",
    "**Owner:** Program Owner",
    "**Authority:** Program Owner — KIDULTS Supreme Platform Philosophy — Constitution V4 Foundation",
    "**Effective Date:** 2026-09-16",
    "**Revision Policy:**",
    "**Constitution Status:** ACTIVE / HIGHEST GOVERNING DOCUMENT / PERMANENT / REPOSITORY-WIDE / FAIL-CLOSED",
    "The KIDULTS Platform exists to become the world's most trusted Autonomous, Global, Irreplaceable Value, Transparent Intelligence Platform.",
    "### I. AUTONOMOUS",
    "### II. GLOBAL",
    "### III. IRREPLACEABLE VALUE",
    "### IV. TRANSPARENT",
    "### Supreme Operating Principle",
    "More Autonomous",
    "More Global",
    "More Valuable",
    "More Transparent",
    "Every lower layer SHALL inherit the layer above.",
    "Every existing and future article of this Constitution SHALL inherit the Platform Philosophy.",
    "The Platform Philosophy SHALL become the highest review criterion",
    "No implementation may bypass it.",
    "## Single Source of Truth",
    "Unknown SHALL ALWAYS become HOLD.",
    "Protected Main Natural Execution is the authoritative operational proof.",
    "Historical evidence SHALL NEVER be rewritten.",
    "When uncertain, AI SHALL return HOLD, never PASS.",
    "THIS CONSTITUTION SHALL PREVAIL.",
  ]) {
    assert.ok(constitution.includes(required), `missing constitutional control: ${required}`);
  }
});

test("required governance documents reference the Supreme Platform Philosophy", () => {
  const references = [
    "README.md",
    "AGENTS.md",
    ".github/AI_AGENT_OPERATING_RULES.md",
    ".github/copilot-instructions.md",
    "docs/ARCHITECTURE.md",
    "docs/DEVELOPER_GUIDE.md",
    "docs/GOVERNANCE.md",
    "docs/kidults/platform-track-alignment-directive-v1.md",
    "docs/recovery/backup-and-restore.md",
  ];

  for (const path of references) {
    const content = read(path);
    assert.ok(content.includes("CONSTITUTION.md"), `${path} must reference CONSTITUTION.md`);
    assert.ok(content.includes("KIDULTS Supreme Platform Philosophy"), `${path} must reference the Platform Philosophy`);
  }
});

test("agent instructions enforce philosophy inheritance and constitutional supremacy", () => {
  const agents = read("AGENTS.md");
  assert.ok(agents.includes("highest governing layer"));
  assert.ok(agents.includes("Autonomous, Global, Irreplaceable Value, and Transparent"));
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
