import { loadPortalData } from "./components/data-store.js";
import { startLivingPulse } from "./components/living-pulse.js";
import { startWhyEngine } from "./components/why-engine.js";
import { startIntegrityHardening } from "./components/integrity-hardening.js";
import { startK100IntegrityReset } from "./components/k100-integrity-reset.js";
import { startMobileReconstruction } from "./components/mobile-reconstruction.js";
import { startMobileHeroVisibility } from "./components/mobile-hero-visibility.js?v=662-visual95-final";
import { startAssetBindingHotfix } from "./components/editorial-assets.js?v=662-visual95-final";
import { startHomepageStructure } from "./components/homepage-structure.js?v=662-visual95-final";
import { startAccessibilityR1 } from "./components/accessibility-r1.js";
import {
  renderHero,
  renderRegistryRibbon,
  renderSnapshot,
  renderOperations,
  renderVerticals,
  renderK100,
  renderSignals,
  renderEvidence,
  renderResearch,
  renderArchive,
  renderReleaseBaseline,
  renderPortalError
} from "./components/renderers.js?v=662";
import {
  setupNavigation,
  setupDialogs,
  setupVerticalFilter,
  setupSearch,
  setupReveal
} from "./components/interactions.js";

function determineDataState(data) {
  if (!data.meta.registryProjectionConnected) return "registry-unavailable";
  if (data.connections.summary.requiredFailure) return "connection-degraded";
  if (data.registry.snapshot.candidate_id) return "candidate-registered";
  if (data.meta.verifiedFields > 0) return "verified-overlay";
  return "preview-baseline";
}

function publishConnectionProjection(connections) {
  const projection = Object.freeze({
    manifestId: connections.manifest.id,
    manifestVersion: connections.manifest.version,
    state: connections.summary.state,
    verifiedCount: connections.summary.verifiedCount,
    productionEligible: false,
    sources: Object.freeze(connections.sources.map(source => Object.freeze({
      id: source.id,
      role: source.role,
      state: source.state,
      contractValid: source.contractValid,
      publicationEligible: source.publicationEligible
    })))
  });

  window.KIDULTS_DATA_CONNECTIONS = projection;
  document.dispatchEvent(new CustomEvent("kidults:data-connections-ready", {
    detail: projection
  }));
  return projection;
}

async function init() {
  document.documentElement.dataset.release = "v502";
  document.documentElement.dataset.experience = "living-intelligence-v6";
  document.documentElement.dataset.homepageStructure = "v662";
  setupNavigation();
  startAccessibilityR1();

  try {
    const data = await loadPortalData();
    const connectionProjection = publishConnectionProjection(data.connections);
    document.documentElement.dataset.dataConnectionState = connectionProjection.state;

    renderHero(data.manifest);
    startAssetBindingHotfix();
    renderRegistryRibbon(data.registry, data.manifest);
    renderSnapshot(data.summary);
    renderOperations(data.summary);
    renderVerticals(data.verticals);
    renderK100(data.k100);
    renderSignals(data.signals);
    renderEvidence(data.summary, data.k100);
    renderResearch(data.research);
    renderArchive(data.archive);
    renderReleaseBaseline(data.registry, data.manifest);

    startLivingPulse({ data, reload: loadPortalData, contract: data.pulse });
    startWhyEngine({ data, contract: data.why });
    startIntegrityHardening({ data });
    startK100IntegrityReset({ data });

    setupDialogs(data);
    setupVerticalFilter();
    setupSearch(data.searchIndex);
    startAccessibilityR1();
    setupReveal();

    startMobileReconstruction();
    startMobileHeroVisibility({ manifest: data.manifest });
    startHomepageStructure();

    document.documentElement.dataset.dataState = determineDataState(data);
    window.KIDULTS_V502 = Object.freeze({
      release: data.manifest.version,
      experience: data.manifest.experience_label ?? "V6 RC",
      snapshotId: data.manifest.snapshot_id,
      candidateSnapshotId: data.manifest.candidate_snapshot_id,
      assessmentId: data.manifest.assessment_id,
      sourceMode: data.manifest.source_mode,
      dataConnectionState: connectionProjection.state,
      dataConnectionManifest: connectionProjection.manifestId,
      providerConnectionState: data.registry.provider?.connection_state ?? "NOT_REGISTERED",
      runtimeObservationState: data.registry.runtime?.digitalocean_state ?? "NOT_VERIFIED",
      livingPulse: data.pulse.version,
      whyEngine: data.why.version,
      copilotEngine: "DEDICATED_ROUTE",
      compareEngine: "DEDICATED_ROUTE",
      decisionEngine: "DEDICATED_ROUTE",
      workspace: data.workspace.version,
      workspaceMounted: false,
      workspaceRoute: "workspace.html",
      homepageStructure: "v662",
      integrity: window.KIDULTS_INTEGRITY?.version ?? "NOT AVAILABLE",
      k100Integrity: window.KIDULTS_K100_INTEGRITY?.version ?? "NOT AVAILABLE",
      mobileReconstruction: window.KIDULTS_MOBILE?.version ?? "NOT AVAILABLE",
      mobileHeroVisibility: window.KIDULTS_MOBILE_HERO?.version ?? "NOT AVAILABLE",
      assetBindingHotfix: window.KIDULTS_ASSET_BINDING_HOTFIX?.version ?? "NOT AVAILABLE"
    });
  } catch (error) {
    console.error("KIDULTS V6 portal initialization failed.", error);
    document.documentElement.dataset.dataState = "error";
    document.documentElement.dataset.dataConnectionState = "DEGRADED";
    renderPortalError(error);
  }
}

document.addEventListener("DOMContentLoaded", init);