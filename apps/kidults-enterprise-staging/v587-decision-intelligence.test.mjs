import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import test from "node:test";
import {
  assertDecisionDataSeparation,
  buildDecisionSnapshot,
  buildMarketCardMetadata,
  buildObjectDecisionModel,
  buildResearchDecisionFlow,
  buildResearchPresentation,
  buildAvailabilityState,
  gateResearchSearchIndex,
  buildPresenceContext,
  operationalPortalValue
} from "./public/portal/components/v587-decision-intelligence.js";
import { buildWorkspaceDecisionPacket } from "./public/portal/components/v587-workspace-decision-flow.js";
import { validateRoleJourneyControl } from "./public/portal/components/v587-business-journey-qualification.js";
import {
  buildIntelligenceDecision,
  computeConfidence,
  evaluateRights,
  v587IntelligenceCoreContract
} from "./public/portal/components/v587-intelligence-core.js";
import { applyGovernedProjection } from "./public/portal/components/data-store.js";
import { authorizeProjection, toPortalView, toSyntheticPortalControl } from "./projection-capability-v1.mjs";
import { approvedObjectPassportFixture } from "../../scripts/kidults/portal/proof-product-test-fixtures-v1.mjs";

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
    "Identity", "Current SOLD", "Availability", "Evidence", "Confidence", "Rights", "Research", "Projection", "Decision"
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
  const implementation = read("public/portal/components/v587-decision-intelligence.js");
  assert.match(implementation, /Evidence · \$\{esc\(operationalPortalValue\("Evidence", flow\.evidence_state\)\)\}/);
  assert.match(implementation, /Reason · \$\{esc\(flow\.reasoning\.reason\)\}/);
  assert.match(implementation, /Decision · \$\{esc\(operationalPortalValue\("Decision", flow\.conclusion\)\)\}/);
  assert.match(implementation, /workspace\.html\?mode=ask/);
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
  assert.match(workspace, /startWhyEngine\(\{ data, contract: data\.why \}\)/);
  assert.match(workspaceFlow, /v587-decision-intelligence\.css/);
});

test("workspace engines invoke the shared WHY engine without depending on homepage-only DOM triggers", () => {
  const why = read("public/portal/components/why-engine.js");
  const copilot = read("public/portal/components/copilot.js");
  const compare = read("public/portal/components/compare-engine.js");
  const decision = read("public/portal/components/decision-engine.js");
  assert.match(why, /const open = \(type, index, trigger = null\)/);
  assert.match(why, /truthRules: \{ \.\.\.normalizedContract\.truth_rules \},\s+open/);
  assert.match(copilot, /KIDULTS_WHY\?\.open\?\.\(action\.targetType, Number\(action\.targetIndex\)\)/);
  assert.match(compare, /KIDULTS_WHY\?\.open\?\.\("vertical", index\)/);
  assert.match(decision, /KIDULTS_WHY\?\.open\?\.\("vertical", index\)/);
});

test("routes V587 through the governed API integration bus and preserves fail-closed state", () => {
  const projection = {
    source: "CONTROL_FALLBACK",
    projection: { state: "NO_PROJECTION", projection_id: null, assessment_id: null, rights_state: "WAITING", freshness: "NOT_AVAILABLE", as_of: null },
    release: { state: "HOLD" }, signals: [], objects: [], evidence: [], actions: [],
    decision_intelligence: null, audit: { exact_pair_digest: null }
  };
  const verticals = json("public/portal/data/verticals.json");
  const integrated = applyGovernedProjection({ registry, signals, k100, verticals }, projection);
  assert.equal(integrated.integrationBus.api_path, "/api/v1/projection");
  assert.equal(integrated.integrationBus.state, "NO_PROJECTION");
  assert.equal(integrated.integrationBus.canonical_bound, false);
  assert.equal(integrated.registry.release.status, "HOLD");
  assert.equal(integrated.signals.signals.length, 0);
  assert.ok(integrated.verticals.verticals.every(vertical => vertical.right_data_coverage_pct === null && vertical.demand_evidence_pct === null));
  const store = read("public/portal/components/data-store.js");
  const detail = read("public/portal/detail.js");
  assert.match(store, /readPortalProjection/);
  assert.match(store, /api_path: "\/api\/v1\/projection"/);
  assert.match(detail, /loadPortalData\(\)/);
  assert.doesNotMatch(detail, /getJson\("data\//);
});

test("renders all 120 synthetic Current SOLD controls through the shared decision model without promotion", () => {
  const control = json("../../coordination/kidults/synthetic/generated/synthetic-portal-projection-v1.json");
  const projection = toSyntheticPortalControl(control);
  const integrated = applyGovernedProjection({ registry, signals, k100, verticals: json("public/portal/data/verticals.json") }, projection);
  const syntheticObjects = integrated.k100.items.filter(item => item.synthetic === true);
  assert.equal(syntheticObjects.length, 120);
  for (const object of syntheticObjects) {
    const model = buildObjectDecisionModel(object, integrated.k100, manifest, integrated.registry);
    assert.equal(model.panel.decision, "SYNTHETIC");
    assert.match(model.hierarchy.find(([label]) => label === "Current SOLD")[1], /^SYNTHETIC CONTROL ·/);
    assert.equal(model.production_eligible, false);
    assert.equal(model.public_eligible, false);
    assert.equal(model.market_authority, false);
  }
  assert.equal(buildDecisionSnapshot(integrated).fields.find(([label]) => label === "Current SOLD")[1], "120 SYNTHETIC CONTROL");
});

test("maps the signed governed API Current SOLD object into the identical V587 decision path", () => {
  const raw = approvedObjectPassportFixture();
  raw.payload.fields.market_observations.value = [{ event_class: "CURRENT_SOLD_TRANSACTION", event_id: "fixture-current-sold-v587", amount: 12500, currency: "USD", event_at: "2026-08-22T09:00:00Z", empirical: true, synthetic: false, current_market_claim_eligible: true }];
  const authorized = authorizeProjection({ projection: raw, surface: "PORTAL_RENDER", secret: "v587-integration-capability-secret-32-bytes", now: new Date("2026-08-22T10:30:00Z") });
  const projection = toPortalView(raw, authorized.admission.receipt);
  const integrated = applyGovernedProjection({ registry, signals, k100, verticals: json("public/portal/data/verticals.json") }, projection);
  const object = integrated.k100.items.find(item => item.id === raw.payload.canonical_object_id);
  assert.equal(integrated.integrationBus.state, "LIVE_APPROVED");
  assert.equal(integrated.integrationBus.canonical_bound, true);
  assert.equal(object.current_sold.state, "CURRENT_SOLD_VERIFIED");
  assert.equal(buildObjectDecisionModel(object, integrated.k100, manifest, integrated.registry).hierarchy.find(([label]) => label === "Current SOLD")[1], "12500 USD");
});

test("registers real browser performance qualification on Home, Detail and Workspace", () => {
  const performance = read("public/portal/components/v587-performance-qualification.js");
  for (const metric of ["render_ms", "first_paint_ms", "memory_js_heap_bytes", "layout_shift", "reflow_probe_ms", "longest_task_ms", "max_interaction_delay_ms", "navigation_ms"]) {
    assert.match(performance, new RegExp(metric));
  }
  for (const path of ["public/portal/portal.js", "public/portal/detail.js", "public/portal/workspace-page.js"]) {
    assert.match(read(path), /beginPerformanceQualification/);
    assert.match(read(path), /KIDULTS_PERFORMANCE_RECEIPT_READY/);
  }
});

test("registers exact role-specific browser journey control receipts without generic or human substitution", async () => {
  const module = await import("./public/portal/components/v587-business-journey-qualification.js");
  assert.deepEqual(module.businessJourneyQualificationContract.roles, ["COLLECTOR", "DEALER", "INVESTOR", "MUSEUM", "AUCTION_HOUSE", "FAMILY_OFFICE"]);
  assert.deepEqual(module.businessJourneyQualificationContract.steps, ["ENTRY", "NAVIGATION", "SEARCH", "OBJECT", "EVIDENCE", "DECISION", "WORKSPACE", "EXPORT_PERMISSION", "COMPLETION"]);
  const source = read("public/portal/components/v587-business-journey-qualification.js");
  assert.match(source, /BLOCKED_BY_RIGHTS/);
  assert.match(source, /receipt_digest/);
  assert.match(source, /evidence_class: "CONTROL_SIMULATION"/);
  assert.match(source, /human_acceptance: false/);
  assert.match(source, /independent_human_review_required: true/);
  assert.match(source, /promotion_eligible: false/);
  assert.doesNotMatch(source, /v587-human-acceptance|validateHumanAcceptance/);
  assert.doesNotMatch(source, /state: complete[^\n]*"VERIFIED_PASS"/);
  assert.doesNotMatch(source, /INSTITUTIONAL|GENERIC/);
});

test("translates unavailable states into calm operational guidance without changing engine truth", () => {
  assert.equal(operationalPortalValue("Evidence", "NOT AVAILABLE"), "Evidence not yet available");
  assert.equal(operationalPortalValue("Current SOLD", "NOT AVAILABLE"), "Current SOLD not yet qualified");
  assert.equal(operationalPortalValue("Rights", "HOLD"), "Rights not yet released");
  assert.equal(operationalPortalValue("Qualification", "WAITING_FOR_EXACT_IMMUTABLE_PACKAGE"), "Awaiting provider qualification");
  assert.equal(operationalPortalValue("Qualification", "WAIT"), "Awaiting provider qualification");
  assert.equal(operationalPortalValue("Research", "NOT_YET_REGISTERED"), "Research not yet available");
  assert.equal(operationalPortalValue("Decision", "RIGHTS BLOCKED"), "Action unavailable — Rights not yet released");
  assert.equal(operationalPortalValue("Sources", "NOT AVAILABLE"), "Evidence not yet available");
  assert.equal(operationalPortalValue("Quality", "NOT AVAILABLE — Confidence unavailable"), "Waiting for Evidence and Qualification");
  assert.equal(operationalPortalValue("Provider", "NONE ACTIVATED"), "Awaiting provider qualification");
  assert.equal(operationalPortalValue("Freshness", "2026-09-08T00:00:00Z", Date.parse("2026-09-08T00:08:00Z")), "Updated 8 minutes ago");
});

test("keeps final experience polish inside existing V587 extension surfaces", () => {
  const decision = read("public/portal/components/v587-decision-intelligence.js");
  const workspace = read("public/portal/components/v587-workspace-decision-flow.js");
  const search = read("public/portal/components/interactions.js");
  const detail = read("public/portal/detail.js");
  const portalError = read("public/portal/components/renderers.js");
  const objectPage = read("public/portal/object.html");
  const verticalPage = read("public/portal/vertical.html");
  const workspacePage = read("public/portal/workspace.html");
  assert.match(decision, /WHY THIS MATTERS/);
  assert.match(decision, /Rights and Qualification determine which actions are available/);
  assert.match(workspace, /<strong>Decision Summary<\/strong><dl>/);
  for (const label of ["Decision", "Evidence", "Qualification", "Rights"]) assert.match(workspace, new RegExp(`<dt>${label}<\\/dt>`));
  assert.match(search, /Matched because/);
  assert.match(search, /Canonical Name, Edition, Variant or Collector Alias/);
  assert.match(detail, /This record could not be verified/);
  assert.doesNotMatch(detail, /<p class="detail-intro">\$\{esc\(error\.message\)\}<\/p>/);
  assert.match(portalError, /Action unavailable/);
  assert.doesNotMatch(portalError, /Required portal data could not be loaded\. \$\{esc\(message\)\}/);
  assert.match(objectPage, /Checking Evidence and Rights/);
  assert.match(verticalPage, /Checking Evidence and Rights/);
  assert.match(workspacePage, /Checking Qualification/);
  assert.doesNotMatch(`${objectPage}${verticalPage}${workspacePage}`, />Loading(?: verified detail)?…</);
});

test("reveals only existing governed state through the thin V587 presence layer", () => {
  const presence = buildPresenceContext({
    integrationBus: { state: "NO_PROJECTION" },
    registry: {
      evidence: { status: "WAITING_FOR_NEW_BOUNDED_POC_EVIDENCE_PACKAGE" },
      assessment: { gate_state: "WAITING_FOR_EXACT_IMMUTABLE_PACKAGE" },
      release: { status: "HOLD" },
      freshness: { as_of: "NOT AVAILABLE" }
    }
  });
  assert.equal(presence.intelligenceStrip, "Latest verified intelligence · Awaiting a governed Evidence update");
  assert.equal(presence.marketPulse, "Market Pulse · Governed projection unavailable · Awaiting verified Evidence");
  assert.match(presence.workspace, /Qualification · Awaiting provider qualification/);
  assert.deepEqual(presence.research, ["Evidence Window · Evidence not yet available", "Qualification Window · Awaiting provider qualification"]);
  assert.equal(presence.confidenceBasis, "Confidence · Evidence → Freshness → Rights → Qualification");
  const implementation = read("public/portal/components/v587-decision-intelligence.js");
  const styles = read("public/portal/components/v587-decision-intelligence.css");
  assert.match(styles, /height:54px/);
  assert.doesNotMatch(implementation, /predict|recommend|forecast/i);
});

test("graduates the remaining role experience defects without changing intelligence truth", () => {
  const data = {
    integrationBus: { state: "NO_PROJECTION" },
    searchIndex: [{ type: "Research", title: research.title, description: research.summary, keywords: [], searchText: research.summary.toLowerCase() }],
    research,
    registry: {
      evidence: { status: "WAITING_FOR_NEW_BOUNDED_POC_EVIDENCE_PACKAGE" },
      assessment: { gate_state: "WAITING_FOR_EXACT_IMMUTABLE_PACKAGE" },
      release: { status: "HOLD" }
    }
  };
  const gated = buildResearchPresentation(data);
  assert.equal(gated.available, false);
  assert.deepEqual([gated.subtitle, gated.summary, gated.title], ["Evidence pending", "Qualification pending", "Research unavailable"]);
  assert.doesNotMatch(JSON.stringify(gated), /Demand remains|strongest in|market conclusion/i);
  assert.match(gateResearchSearchIndex(data)[0].description, /^Evidence pending\. Qualification pending\./);

  const object = buildObjectDecisionModel(k100.items[0], k100, manifest, registry);
  assert.equal(buildAvailabilityState(object), "Awaiting Qualification — Current SOLD cannot be used yet");
  assert.match(object.hierarchy.find(([label]) => label === "Availability")[1], /^Awaiting Qualification/);

  const completeEvidence = {
    identity: "Archive Sneaker 01",
    market_context: "Current Market unavailable",
    availability: "Awaiting Qualification",
    current_sold: "Current SOLD not yet qualified",
    evidence: "Evidence not yet available",
    evidence_availability: "Evidence not yet available",
    confidence: "Waiting for Evidence and Qualification",
    rights: "Rights not yet released",
    qualification: "Awaiting provider qualification",
    research_availability: "Research not yet available",
    provenance_state: "Editorial provenance available",
    risk: "Why · release gates are unresolved · Next Action · wait for qualification",
    decision: "Action unavailable",
    workspace_context: "Workspace Context",
    workspace_decision: "Complete Rights and Qualification",
    export_permission: "BLOCKED_BY_RIGHTS"
  };
  for (const role of ["COLLECTOR", "DEALER", "INVESTOR", "MUSEUM", "AUCTION_HOUSE", "FAMILY_OFFICE"]) {
    const control = validateRoleJourneyControl(role, completeEvidence);
    assert.equal(control.control_complete, true, role);
    assert.deepEqual(control.missing, [], role);
    assert.equal(Object.values(control.journey_questions).every(Boolean), true, role);
  }

  const pages = `${read("public/portal/index.html")}${read("public/portal/object.html")}${read("public/portal/vertical.html")}${read("public/portal/workspace.html")}`;
  assert.doesNotMatch(pages, /Back to V502|> V502 RC</);
});
