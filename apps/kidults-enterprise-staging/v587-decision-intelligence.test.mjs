import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import test from "node:test";
import {
  assertDecisionDataSeparation,
  buildDecisionSnapshot,
  buildMarketCardMetadata,
  buildObjectDecisionModel,
  buildResearchDecisionFlow
} from "./public/portal/components/v587-decision-intelligence.js";
import { buildWorkspaceDecisionPacket } from "./public/portal/components/v587-workspace-decision-flow.js";
import {
  buildIntelligenceDecision,
  computeConfidence,
  evaluateRights,
  v587IntelligenceCoreContract
} from "./public/portal/components/v587-intelligence-core.js";

const read = path => fs.readFileSync(path, "utf8");
const json = path => JSON.parse(read(path));
const normalizedDigest = path => `sha256:${crypto.createHash("sha256").update(read(path).replaceAll("\r\n", "\n")).digest("hex")}`;
const contract = json("../../coordination/kidults/portal/v587-intelligence-upgrade-contract-v1.json");
const registry = json("public/portal/data/registry-view.json");
const summary = json("public/portal/data/portal-summary.json");
const signals = json("public/portal/data/market-signals.json");
const k100 = json("public/portal/data/kidult100.json");
const manifest = json("public/portal/data/v502-manifest.json");
const research = json("public/portal/data/research.json");

test("keeps every protected V587 foundation file byte-stable", () => {
  for (const [path, expected] of Object.entries(contract.protected_surface_digests)) {
    assert.equal(normalizedDigest(`../../${path}`), expected, path);
  }
  assert.equal(contract.upgrade_class, "EXTENSION_ONLY_NOT_REDESIGN_NOT_V600");
  assert.equal(contract.visual_change_budget_percent, 5);
  assert.deepEqual(contract.features, ["DECISION_SNAPSHOT", "CONFIDENCE_BADGE", "RIGHTS_BADGE", "FRESHNESS_BADGE", "EVIDENCE_DRAWER", "DECISION_PANEL", "CANONICAL_SEARCH_PREVIEW", "WORKSPACE_DECISION_MEMO", "RESEARCH_EVIDENCE_TIMELINE"]);
  assert.deepEqual(contract.intelligence_engine.flow, ["EVIDENCE", "REASON", "CONFIDENCE", "DECISION", "ACTION"]);
  assert.deepEqual(contract.intelligence_engine.confidence_factors, ["EVIDENCE", "COVERAGE", "FRESHNESS", "RIGHTS", "CONSISTENCY", "QUALIFICATION"]);
  assert.deepEqual(contract.intelligence_engine.consumers, ["PORTAL", "WORKSPACE", "RESEARCH", "OBJECT", "SEARCH", "API"]);
  assert.deepEqual(contract.provider_qualification.providers, ["PSA", "EBAY", "HERITAGE", "GOLDIN", "CLASSIC_COM", "BRING_A_TRAILER"]);
  assert.equal(contract.provider_qualification.live_connections_allowed, false);
});

test("does not retarget protected identity selectors or introduce a replacement design system", () => {
  const css = read("public/portal/components/v587-decision-intelligence.css");
  for (const forbidden of [":root", ".hero", ".site-header", ".primary-nav", ".site-footer", "@font-face", "@keyframes", "animation:"]) {
    assert.ok(!css.includes(forbidden), `protected or replacement CSS token found: ${forbidden}`);
  }
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i);
  assert.doesNotMatch(css, /\.v587-decision-panel\s*\{[^}]*position\s*:\s*relative/s);
  for (const variable of ["var(--paper)", "var(--card)", "var(--forest)", "var(--line)", "var(--serif)"]) {
    assert.match(css, new RegExp(variable.replace(/[()\-]/g, "\\$&")));
  }
});

test("renders the required evidence-confidence-decision hierarchy with fail-closed truth", () => {
  const data = { registry, summary, signals, connections: { sources: [] }, research };
  const snapshot = buildDecisionSnapshot(data);
  assert.deepEqual(snapshot.fields.map(([label]) => label), [
    "Decision Readiness", "Evidence Coverage", "Confidence", "Rights Coverage", "Current SOLD", "Freshness"
  ]);
  assert.ok(v587IntelligenceCoreContract.decision_states.includes(snapshot.decision));
  assert.equal(snapshot.decision, "RIGHTS BLOCKED");
  assert.match(snapshot.confidence_explanation, /^Confidence unavailable:/);
  assert.equal(snapshot.fields.find(([label]) => label === "Current SOLD")[1], "NOT AVAILABLE");
  assert.equal(snapshot.production, "HOLD");
  assert.equal(snapshot.public, "HOLD");

  const object = buildObjectDecisionModel(k100.items[0], k100, manifest, registry);
  assert.deepEqual(object.hierarchy.map(([label]) => label), [
    "Identity", "Current SOLD", "Evidence", "Confidence", "Rights", "Research", "Projection", "Decision"
  ]);
  assert.deepEqual(Object.keys(object.panel), ["decision", "confidence", "evidence", "rights", "track_b", "risk", "freshness"]);
  assert.equal(object.panel.decision, "RIGHTS BLOCKED");
  assert.match(object.confidence_explanation, /^Confidence unavailable:/);
  assert.equal(object.production_eligible, false);
  assert.equal(object.public_eligible, false);
  assert.equal(object.market_authority, false);
});

test("extends market cards with only approved confidence, rights and freshness badges", () => {
  const meta = buildMarketCardMetadata(signals.signals[0], { signals, connections: { sources: [] } });
  assert.deepEqual(Object.keys(meta), ["confidence", "confidence_explanation", "freshness", "rights", "decision", "market_authority", "decision_eligible"]);
  assert.equal(meta.rights, "HOLD");
  assert.equal(meta.decision, "RIGHTS BLOCKED");
  assert.match(meta.confidence_explanation, /^Confidence unavailable:/);
  assert.equal(meta.market_authority, false);
  assert.equal(meta.decision_eligible, false);
});

test("physically separates synthetic records and rejects any weakened boundary", () => {
  const synthetic = {
    data_bucket: "SYNTHETIC",
    environment: "SYNTHETIC",
    synthetic: true,
    empirical: false,
    production_eligible: false,
    public_eligible: false,
    market_authority: false,
    portal_label: "SYNTHETIC TEST DATA — INTERNAL VALIDATION ONLY"
  };
  assert.equal(assertDecisionDataSeparation(synthetic), "SYNTHETIC");
  const syntheticObject = buildObjectDecisionModel({ ...synthetic, id: "synthetic-object", confidence: 100, evidence_count: 99, rights_status: "CLEARED", current_sold: { verified: true, display_value: "$1" } }, k100, manifest, { assessment: { gate_state: "PASS" } });
  assert.equal(syntheticObject.panel.confidence, "NOT AVAILABLE");
  assert.equal(syntheticObject.panel.evidence, "NOT AVAILABLE");
  assert.equal(syntheticObject.panel.decision, "SYNTHETIC");
  const syntheticMarket = buildMarketCardMetadata({ ...synthetic, confidence: 100, sources: 99 }, { connections: { sources: [{ publicationEligible: true }] } });
  assert.equal(syntheticMarket.confidence, "NOT AVAILABLE");
  assert.equal(syntheticMarket.rights, "HOLD");
  for (const mutation of [
    ["empirical", true], ["production_eligible", true], ["public_eligible", true],
    ["market_authority", true], ["portal_label", "COLLECTIBLE MARKET DATA"]
  ]) {
    const changed = { ...synthetic, [mutation[0]]: mutation[1] };
    assert.throws(() => assertDecisionDataSeparation(changed), /V587_SYNTHETIC/);
  }
});

test("preserves the complete internal workspace decision sequence and non-promotable export", () => {
  const packet = buildWorkspaceDecisionPacket({ k100, registry }, [k100.items[0].id, k100.items[1].id]);
  assert.deepEqual(packet.sequence, ["WATCHLIST", "EVIDENCE_COLLECTION", "COMPARISON", "DECISION_MEMO", "ACTION"]);
  assert.equal(packet.objects.length, 2);
  assert.ok(packet.objects.every(item => item.decision === "RIGHTS BLOCKED"));
  assert.ok(packet.objects.every(item => item.action === "NONE"));
  assert.equal(packet.final_decision_allowed, false);
  assert.equal(packet.action_allowed, false);
  assert.equal(packet.production_eligible, false);
  assert.equal(packet.public_eligible, false);
  const synthetic = { id: "synthetic-export", data_bucket: "SYNTHETIC", environment: "SYNTHETIC", synthetic: true };
  assert.throws(() => buildWorkspaceDecisionPacket({ k100: { items: [...k100.items, synthetic] }, registry }, [synthetic.id]), /V587_SYNTHETIC_EXPORT_PROHIBITED/);
});

test("adds the approved research evidence timeline and canonical preview without popup or new-page evidence UX", () => {
  const flow = buildResearchDecisionFlow({ research, registry });
  assert.deepEqual(Object.keys(flow), ["timeline", "evidence_state", "reasoning", "conclusion", "final_decision_allowed"]);
  assert.equal(flow.conclusion, "RIGHTS BLOCKED");
  assert.equal(flow.final_decision_allowed, false);
  const component = read("public/portal/components/v587-decision-intelligence.js");
  assert.match(component, /document\.createElement\("aside"\)/);
  assert.match(component, /drawer\.hidden = true/);
  assert.match(component, /drawer\.hidden = false/);
  assert.doesNotMatch(component, /showModal\(|window\.open\(/);
  const interactions = read("public/portal/components/interactions.js");
  const store = read("public/portal/components/data-store.js");
  assert.match(interactions, /search-result-evidence/);
  assert.match(interactions, /canonicalState/);
  assert.match(interactions, /evidencePreview/);
  assert.match(store, /canonicalState/);
  assert.match(store, /evidencePreview/);
  assert.match(store, /item\.data_bucket === "SYNTHETIC"/);
});

test("computes confidence from all six governed factors and always binds an explanation", () => {
  const confidence = computeConfidence({ evidence: 100, coverage: 90, freshness: "CURRENT", rights: "CLEARED", consistency: 80, qualification: "PASS" });
  assert.equal(confidence.value, 92);
  assert.equal(confidence.label, "92%");
  assert.match(confidence.explanation, /evidence 100%.*coverage 90%.*freshness 80%.*rights 100%.*consistency 80%.*qualification 100%/);
  const incomplete = computeConfidence({ evidence: 100, coverage: 90, freshness: "CURRENT", rights: "CLEARED", qualification: "PASS" });
  assert.equal(incomplete.value, null);
  assert.match(incomplete.explanation, /missing consistency/);
});

test("rights engine blocks every action until rights, permission and release are all explicit", () => {
  const blocked = evaluateRights({ rights: "CLEARED", permission: "ALLOWED", release_state: "HOLD", allowed_actions: ["VIEW"] }, "VIEW");
  assert.equal(blocked.action_allowed, false);
  assert.deepEqual(blocked.allowed_actions, []);
  const released = evaluateRights({ rights: "CLEARED", permission: "ALLOWED", release_state: "RELEASED", allowed_actions: ["VIEW", "EXPORT"] }, "VIEW");
  assert.equal(released.action_allowed, true);
  assert.deepEqual(released.allowed_actions, ["VIEW", "EXPORT"]);
});

test("decision engine exposes only governed user states", () => {
  const factors = { evidence: 100, coverage: 100, freshness: "FRESH", rights: "CLEARED", consistency: 100, qualification: "PASS" };
  const released = { rights: "CLEARED", permission: "ALLOWED", release_state: "RELEASED", allowed_actions: ["VIEW"] };
  const decide = overrides => buildIntelligenceDecision({ factors, rights: released, requestedAction: "VIEW", ...overrides });
  assert.equal(decide({}).decision, "READY");
  assert.equal(decide({ factors: { ...factors, qualification: "WAIT" } }).decision, "WAIT");
  assert.equal(decide({ factors: { ...factors, evidence: 40, coverage: 40, freshness: "STALE", consistency: 20 } }).decision, "LOW CONFIDENCE");
  assert.equal(decide({ rights: { ...released, release_state: "HOLD" } }).decision, "RIGHTS BLOCKED");
  assert.equal(decide({ factors: { ...factors, evidence: null } }).decision, "INSUFFICIENT EVIDENCE");
  assert.equal(decide({ synthetic: true }).decision, "SYNTHETIC");
  for (const decision of v587IntelligenceCoreContract.decision_states) {
    assert.doesNotMatch(decision, /PASS|FAIL/);
  }
});

test("integrates all extensions after existing renderers without modifying frozen homepage markup", () => {
  const portal = read("public/portal/portal.js");
  const detail = read("public/portal/detail.js");
  const workspace = read("public/portal/workspace-page.js");
  const workspaceFlow = read("public/portal/components/v587-workspace-decision-flow.js");
  assert.match(portal, /startHomepageStructure\(\);\s+startV587DecisionIntelligence\(data\);/);
  assert.match(detail, /enrichObjectDetailV587/);
  assert.match(workspace, /startV587WorkspaceDecisionFlow\(data\)/);
  assert.match(workspaceFlow, /v587-decision-intelligence\.css/);
});
