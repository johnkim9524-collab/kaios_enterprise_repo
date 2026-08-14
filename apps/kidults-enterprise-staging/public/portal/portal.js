import { loadPortalData } from "./components/data-store.js";
import { startLivingPulse } from "./components/living-pulse.js";
import { startWhyEngine } from "./components/why-engine.js";
import { startCopilot } from "./components/copilot.js";
import { startCompareEngine } from "./components/compare-engine.js";
import { startDecisionEngine } from "./components/decision-engine.js";
import { startWorkspace } from "./components/workspace.js";
import { startIntegrityHardening } from "./components/integrity-hardening.js";
import { startK100IntegrityReset } from "./components/k100-integrity-reset.js";
import { startMobileReconstruction } from "./components/mobile-reconstruction.js";
import { startMobileHeroVisibility } from "./components/mobile-hero-visibility.js?v=658";
import { startAssetBindingHotfix } from "./components/editorial-assets.js?v=658";
import { startHomepageStructure } from "./components/homepage-structure.js?v=661";
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
} from "./components/renderers.js?v=658";
import {
  setupNavigation,
  setupDialogs,
  setupVerticalFilter,
  setupSearch,
  setupReveal
} from "./components/interactions.js";

function determineDataState(data) {
  if (!data.meta.registryProjectionConnected) return "registry-unavailable";
  if (data.registry.snapshot.candidate_id) return "candidate-registered";
  if (data.meta.verifiedFields > 0) return "verified-overlay";
  return "preview-baseline";
}

function startDedicatedWorkspace(data) {
  if (document.body.dataset.page !== "workspace") return false;
  startCopilot({ data, contract: data.copilot });
  startCompareEngine({ data, contract: data.compare });
  startDecisionEngine({ data, contract: data.decision });
  startWorkspace({ data, contract: data.workspace });
  return true;
}

async function init() {
  document.documentElement.dataset.release = "v502";
  document.documentElement.dataset.experience = "living-intelligence-v6";
  setupNavigation();

  try {
    const data = await loadPortalData();

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
    const workspaceMounted = startDedicatedWorkspace(data);

    startIntegrityHardening({ data });
    startK100IntegrityReset({ data });

    setupDialogs(data);
    setupVerticalFilter();
    setupSearch(data.searchIndex);
    startHomepageStructure();
    setupReveal();

    startMobileReconstruction();
    startMobileHeroVisibility({ manifest: data.manifest });

    document.documentElement.dataset.dataState = determineDataState(data);
    window.KIDULTS_V502 = Object.freeze({
      release: data.manifest.version,
      experience: data.manifest.experience_label ?? "V6 RC",
      snapshotId: data.manifest.snapshot_id,
      candidateSnapshotId: data.manifest.candidate_snapshot_id,
      assessmentId: data.manifest.assessment_id,
      sourceMode: data.manifest.source_mode,
      livingPulse: data.pulse.version,
      whyEngine: data.why.version,
      copilotEngine: workspaceMounted ? data.copilot.version : "DEDICATED_ROUTE",
      compareEngine: workspaceMounted ? data.compare.version : "DEDICATED_ROUTE",
      decisionEngine: workspaceMounted ? data.decision.version : "DEDICATED_ROUTE",
      workspace: data.workspace.version,
      workspaceMounted,
      workspaceRoute: "workspace.html",
      homepageStructure: window.KIDULTS_HOMEPAGE_STRUCTURE?.version ?? "NOT AVAILABLE",
      integrity: window.KIDULTS_INTEGRITY?.version ?? "NOT AVAILABLE",
      k100Integrity: window.KIDULTS_K100_INTEGRITY?.version ?? "NOT AVAILABLE",
      mobileReconstruction: window.KIDULTS_MOBILE?.version ?? "NOT AVAILABLE",
      mobileHeroVisibility: window.KIDULTS_MOBILE_HERO?.version ?? "NOT AVAILABLE",
      assetBindingHotfix: window.KIDULTS_ASSET_BINDING_HOTFIX?.version ?? "NOT AVAILABLE"
    });
  } catch (error) {
    console.error("KIDULTS V6 portal initialization failed.", error);
    document.documentElement.dataset.dataState = "error";
    renderPortalError(error);
  }
}

document.addEventListener("DOMContentLoaded", init);
