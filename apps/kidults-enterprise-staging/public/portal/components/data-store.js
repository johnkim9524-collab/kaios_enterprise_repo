import { loadDataConnections, sourceIsOverlayEligible } from "./data-source-gateway.js";
import { buildIntelligenceDecision } from "./v587-intelligence-core.js";
import { readPortalProjection } from "../portal-r001/projection-store.js";

const LOCAL = {
  manifest: "data/v502-manifest.json?v=502",
  registry: "data/registry-view.json?v=phase2-1",
  release: "data/portal-release-manifest-v502.json?v=502",
  pulse: "data/living-pulse-contract.json?v=600",
  why: "data/why-engine-contract.json?v=610",
  copilot: "data/copilot-contract.json?v=620",
  compare: "data/compare-engine-contract.json?v=630",
  decision: "data/decision-engine-contract.json?v=640",
  workspace: "data/workspace-contract.json?v=650",
  verticals: "data/verticals.json?v=502",
  summary: "data/portal-summary.json?v=502",
  k100: "data/kidult100.json?v=502",
  signals: "data/market-signals.json?v=502",
  research: "data/research.json?v=502",
  archive: "data/archive.json?v=502",
  provenance: "data/provenance.json?v=502",
  connections: "data/data-source-manifest-v1.json?v=phase2-1"
};

async function getJson(path, { optional = false } = {}) {
  try {
    const response = await fetch(path, {
      cache: "no-store",
      headers: { Accept: "application/json" }
    });
    if (!response.ok) throw new Error(`${response.status} ${path}`);
    return await response.json();
  } catch (error) {
    if (optional) return null;
    throw error;
  }
}

function searchDecision(record, registry) {
  return buildIntelligenceDecision({
    synthetic: record?.data_bucket === "SYNTHETIC" || record?.environment === "SYNTHETIC" || record?.synthetic === true,
    factors: {
      evidence: record?.evidence_coverage_pct,
      coverage: record?.coverage_pct ?? record?.right_data_coverage_pct,
      freshness: record?.freshness_score ?? record?.freshness_state,
      rights: record?.rights_status,
      consistency: record?.consistency_pct,
      qualification: registry?.assessment?.gate_state
    },
    rights: {
      rights: record?.rights_status,
      permission: record?.rights_permission ?? record?.permission,
      release_state: record?.rights_release_state ?? record?.release_state,
      allowed_actions: record?.allowed_actions ?? []
    },
    requestedAction: "VIEW",
    reason: "Canonical search preview is bound to entity, evidence, rights and qualification state."
  });
}

function buildSearchIndex({ verticals, k100, research, archive, registry }) {
  const records = [];

  for (const vertical of verticals.verticals) {
    const intelligence = searchDecision(vertical, registry);
    records.push({
      type: "Vertical",
      title: vertical.name,
      description: `${vertical.summary} ${vertical.representative_scope.join(" ")}`,
      href: `vertical.html?id=${encodeURIComponent(vertical.id)}`,
      canonicalState: "CANONICAL VERTICAL",
      evidencePreview: `${intelligence.decision} · confidence ${intelligence.confidence.label} — ${intelligence.confidence.explanation}`,
      keywords: [vertical.short_name, vertical.slug, ...vertical.representative_scope]
    });
  }

  for (const item of k100.items) {
    if (item.data_bucket === "SYNTHETIC" || item.environment === "SYNTHETIC" || item.synthetic === true) continue;
    const intelligence = searchDecision(item, registry);
    records.push({
      type: "Object",
      title: item.title,
      description: `${item.category}. ${item.status}. ${item.provenance}`,
      href: `object.html?id=${encodeURIComponent(item.id)}`,
      canonicalState: item.entity_image_verified === true ? "CANONICAL VERIFIED" : "EDITORIAL IDENTITY ONLY",
      evidencePreview: `${intelligence.decision} · confidence ${intelligence.confidence.label} — ${intelligence.confidence.explanation}`,
      keywords: [item.category, item.vertical_id, item.status]
    });
  }

  records.push({
    type: "Research",
    title: research.title,
    description: `${research.subtitle}. ${research.summary}`,
    href: "#research",
    canonicalState: "RESEARCH",
    evidencePreview: "Evidence timeline · reasoning · market context · conclusion",
    keywords: research.sections.flatMap(section => [section.title, section.summary])
  });

  for (const edition of archive.editions) {
    records.push({
      type: "Archive",
      title: edition.title,
      description: `${edition.edition}. ${edition.subtitle}. ${edition.status}`,
      href: "#archive",
      canonicalState: "HISTORICAL",
      evidencePreview: `${edition.status} · preserved edition context`,
      keywords: [edition.edition, edition.status]
    });
  }

  return records.map(record => ({
    ...record,
    searchText: [record.title, record.description, ...(record.keywords || [])]
      .join(" ")
      .toLocaleLowerCase()
  }));
}

const governedSignal = (signal, index, projection) => ({
  id: signal.signal_id ?? `governed-signal-${index + 1}`,
  category: "GOVERNED PROJECTION",
  title: signal.label ?? "Governed signal",
  value: signal.value ?? "NOT AVAILABLE",
  unit: signal.value === null || signal.value === undefined ? "WAITING" : "CURRENT",
  change: signal.state ?? projection.projection.state,
  confidence: signal.confidence ?? null,
  sources: Array.isArray(signal.evidence_refs) ? signal.evidence_refs.length : 0,
  updated: signal.as_of ?? projection.projection.as_of ?? "NOT AVAILABLE",
  series: [],
  evidence_coverage_pct: Array.isArray(signal.evidence_refs) && signal.evidence_refs.length > 0 ? 100 : 0,
  coverage_pct: Array.isArray(signal.evidence_refs) && signal.evidence_refs.length > 0 ? 100 : 0,
  consistency_pct: Array.isArray(signal.evidence_refs) && signal.evidence_refs.length > 0 ? 100 : 0,
  freshness_state: projection.projection.freshness,
  rights_status: projection.projection.rights_state,
  rights_permission: projection.release.state === "READY" ? "ALLOWED" : "DENIED",
  rights_release_state: projection.release.state === "READY" ? "RELEASED" : "HOLD",
  allowed_actions: projection.release.state === "READY" ? ["VIEW"] : [],
  market_authority: false
});

function governedObject(object, projection, rank) {
  const decision = projection.decision_intelligence ?? {};
  const synthetic = object.synthetic === true || object.environment === "SYNTHETIC";
  return {
    id: object.canonical_object_id,
    record_id: object.canonical_object_id,
    canonical_entity: { display_name: object.title },
    title: object.title,
    category: synthetic ? "SYNTHETIC CONTROL" : "GOVERNED OBJECT",
    vertical_id: "technology-cameras",
    rank,
    status: synthetic ? "SYNTHETIC TEST DATA" : projection.projection.state,
    provenance: synthetic ? "Synthetic control routed through the governed integration path." : "Signed governed Projection.",
    asset: null,
    asset_status: "EDITORIAL_VISUAL_NOT_BOUND",
    score: null,
    freshness: projection.projection.as_of ?? "NOT AVAILABLE",
    freshness_state: projection.projection.freshness,
    evidence_count: Array.isArray(object.evidence_refs) ? object.evidence_refs.length : 0,
    evidence_coverage_pct: decision.evidence?.score ?? null,
    coverage_pct: decision.evidence?.coverage ?? null,
    consistency_pct: decision.evidence?.consistency ?? null,
    confidence: object.confidence,
    rights_status: object.rights_state,
    rights_permission: projection.release.state === "READY" ? "ALLOWED" : "DENIED",
    rights_release_state: projection.release.state === "READY" ? "RELEASED" : "HOLD",
    allowed_actions: (object.actions ?? []).map(action => action.action_id).filter(action => ["VIEW", "COMPARE", "WORKSPACE", "EXPORT"].includes(action)),
    current_sold: object.current_sold ?? null,
    data_bucket: synthetic ? "SYNTHETIC" : "CURRENT",
    environment: synthetic ? "SYNTHETIC" : "STAGING",
    synthetic,
    empirical: !synthetic,
    production_eligible: false,
    public_eligible: false,
    market_authority: false,
    portal_label: synthetic ? "SYNTHETIC TEST DATA — INTERNAL VALIDATION ONLY" : null
  };
}

export function applyGovernedProjection(data, projection) {
  const signals = (projection.signals ?? []).map((signal, index) => governedSignal(signal, index, projection));
  const projectedObjects = (projection.objects ?? []).map((object, index) => governedObject(object, projection, data.k100.items.length + index + 1));
  const verticals = {
    ...data.verticals,
    interpretation: `${data.verticals.interpretation} Current numeric intelligence remains unavailable unless supplied by the governed Projection API.`,
    verticals: data.verticals.verticals.map(vertical => ({
      ...vertical,
      right_data_coverage_pct: null,
      demand_evidence_pct: null,
      relevant: "NOT AVAILABLE",
      scarcity_evidence_count: "NOT AVAILABLE"
    }))
  };
  const registry = structuredClone(data.registry);
  registry.projection_id = projection.projection.projection_id;
  registry.snapshot.candidate_id = projection.projection.state === "LIVE_APPROVED" ? projection.projection.projection_id : null;
  registry.assessment.current_id = projection.projection.assessment_id;
  registry.assessment.gate_state = projection.decision_intelligence?.evidence?.qualification === 100 ? "PASS" : "WAIT";
  registry.evidence.status = projection.evidence?.length ? "PAIRED" : "NOT AVAILABLE";
  registry.evidence.coverage_pct = projection.decision_intelligence?.evidence?.score ?? null;
  registry.evidence.consistency_pct = projection.decision_intelligence?.evidence?.consistency ?? null;
  registry.freshness.status = projection.projection.freshness;
  registry.freshness.as_of = projection.projection.as_of;
  registry.release.status = projection.release.state === "READY" ? "RELEASED" : "HOLD";
  registry.release.portal_permission = projection.release.state === "READY" ? "ALLOWED" : "DENIED";
  registry.release.allowed_actions = projection.decision_intelligence?.rights?.allowed_actions ?? [];

  return {
    ...data,
    verticals,
    registry,
    signals: { ...data.signals, updated_at: projection.projection.as_of, status: projection.projection.state, signals },
    k100: { ...data.k100, items: [...data.k100.items, ...projectedObjects] },
    governedProjection: projection,
    integrationBus: Object.freeze({
      version: "v587-governed-integration-bus-v1",
      source: projection.source,
      state: projection.projection.state,
      projection_id: projection.projection.projection_id,
      assessment_id: projection.projection.assessment_id,
      exact_pair_digest: projection.audit?.exact_pair_digest ?? null,
      api_path: "/api/v1/projection",
      canonical_bound: projection.projection.state === "LIVE_APPROVED",
      registry_bound: true,
      qualification_bound: true,
      production: "HOLD",
      public: "HOLD",
      g5: "HOLD"
    })
  };
}

export async function loadPortalData() {
  const [required, governedProjection] = await Promise.all([Promise.all([
    getJson(LOCAL.manifest),
    getJson(LOCAL.registry),
    getJson(LOCAL.release),
    getJson(LOCAL.pulse),
    getJson(LOCAL.why),
    getJson(LOCAL.copilot),
    getJson(LOCAL.compare),
    getJson(LOCAL.decision),
    getJson(LOCAL.workspace),
    getJson(LOCAL.verticals),
    getJson(LOCAL.summary),
    getJson(LOCAL.k100),
    getJson(LOCAL.signals),
    getJson(LOCAL.research),
    getJson(LOCAL.archive),
    getJson(LOCAL.provenance)
  ]), readPortalProjection({ controlUrl: "portal-r001/data/projection-control-fixture.json" })]);

  const [
    manifest,
    registry,
    release,
    pulse,
    why,
    copilot,
    compare,
    decision,
    workspace,
    verticals,
    summary,
    k100,
    signals,
    research,
    archive,
    provenance
  ] = required;

  const connections = await loadDataConnections({
    manifestPath: LOCAL.connections,
    baselineSnapshotId: manifest.snapshot_id
  });

  // Connection payloads remain observable, but V587 intelligence is admitted
  // only through the governed Projection API below. No side-feed may overlay it.
  const verifiedFields = 0;
  const searchIndex = buildSearchIndex({ verticals, k100, research, archive, registry });

  const baseline = {
    manifest,
    registry,
    release,
    pulse,
    why,
    copilot,
    compare,
    decision,
    workspace,
    verticals,
    summary,
    k100,
    signals,
    research,
    archive,
    provenance,
    connections,
    searchIndex,
    meta: {
      verifiedFields,
      qualityConnected: connections.sources.some(source => source.id === "quality_feed" && !["ERROR", "UNAVAILABLE"].includes(source.state)),
      qualityOverlayEligible: sourceIsOverlayEligible(connections, "quality_feed"),
      monthlyConnected: connections.sources.some(source => source.id === "monthly_intelligence" && !["ERROR", "UNAVAILABLE"].includes(source.state)),
      monthlyOverlayEligible: sourceIsOverlayEligible(connections, "monthly_intelligence"),
      registryProjectionConnected: Boolean(registry),
      dataConnectionState: connections.summary.state,
      releaseCandidate: manifest.status === "RELEASE_CANDIDATE"
    }
  };
  const integrated = applyGovernedProjection(baseline, governedProjection);
  integrated.searchIndex = buildSearchIndex({
    verticals: integrated.verticals,
    k100: integrated.k100,
    research: integrated.research,
    archive: integrated.archive,
    registry: integrated.registry
  });
  integrated.meta.registryProjectionConnected = governedProjection.projection.state === "LIVE_APPROVED";
  integrated.meta.governedApiState = governedProjection.projection.state;
  return integrated;
}
