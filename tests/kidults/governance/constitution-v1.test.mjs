import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("the permanent KIDULTS Constitution retains its authority and core controls", () => {
  const constitution = read("CONSTITUTION.md");

  for (const required of [
    "**Version:** 1.0.0",
    "**Owner:** Program Owner",
    "**Authority:** KIDULTS Executive Directive — Master Execution Order — FINAL",
    "**Effective Date:** 2026-09-16",
    "**Revision Policy:**",
    "**Constitution Status:** ACTIVE / PERMANENT / REPOSITORY-WIDE / FAIL-CLOSED",
    "## Single Source of Truth",
    "Multiple truths are forbidden.",
    "Hidden state is forbidden.",
    "Duplicate authority is forbidden.",
    "Unknown SHALL become HOLD.",
    "Recovery SHALL NEVER weaken validation.",
    "Protected Main natural execution is the authoritative proof.",
    "Historical evidence SHALL NEVER be rewritten.",
    "When uncertain, produce HOLD, never PASS.",
    "THIS DIRECTIVE SHALL PREVAIL.",
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
