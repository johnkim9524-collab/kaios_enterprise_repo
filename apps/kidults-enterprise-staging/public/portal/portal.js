import { loadPortalData } from "./components/data-store.js";
import { startLivingPulse } from "./components/living-pulse.js";
import { startWhyEngine } from "./components/why-engine.js";
import { startIntegrityHardening } from "./components/integrity-hardening.js";
import { startK100IntegrityReset } from "./components/k100-integrity-reset.js";
import { startMobileReconstruction } from "./components/mobile-reconstruction.js";
import { startMobileHeroVisibility } from "./components/mobile-hero-visibility.js?v=662-visual95-final";
import { startAssetBindingHotfix } from "./components/editorial-assets.js?v=662-visual95-final";
import { startHomepageStructure } from "./components/homepage-structure.js?v=662-visual95-final";
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
  if (data.registry.snapshot.candidate_id) return "candidate-registered";
  if (data.meta.verifiedFields > 0) return "verified-overlay";
  return "preview-baseline";
}

function formatGlobalSnapshotTime(value) {
  const parsed = Date.parse(value ?? "");
  if (!Number.isFinite(parsed)) return "NOT AVAILABLE";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
    timeZoneName: "short"
  }).format(new Date(parsed));
}

function applyPublicExperiencePolish(data) {
  document.documentElement.dataset.visualFreeze = "v665";

  const whyTitle = document.querySelector("#why-title");
  if (whyTitle) {
    whyTitle.innerHTML = "We do not just show objects.<br>We prove why they matter.";
  }

  const snapshotTime = formatGlobalSnapshotTime(data.signals.updated_at);
  document.querySelectorAll(".signal-meta").forEach(meta => {
    const value = meta.querySelector("div:last-child b");
    if (value) value.textContent = snapshotTime;
  });
}

async function init() {
  document.documentElement.dataset.release = "v502";
  document.documentElement.dataset.experience = "living-intelligence-v6";
  document.documentElement.dataset.homepageStructure = "v662";
  document.documentElement.dataset.visualFreeze = "v665";
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
    applyPublicExperiencePolish(data);

    startLivingPulse({ data, reload: loadPortalData, contract: data.pulse });
    startWhyEngine({ data, contract: data.why });
    startIntegrityHardening({ data });
    startK100IntegrityReset({ data });

    setupDialogs(data);
    setupVerticalFilter();
    setupSearch(data.searchIndex);
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
      livingPulse: data.pulse.version,
      whyEngine: data.why.version,
      copilotEngine: "DEDICATED_ROUTE",
      compareEngine: "DEDICATED_ROUTE",
      decisionEngine: "DEDICATED_ROUTE",
      workspace: data.workspace.version,
      workspaceMounted: false,
      workspaceRoute: "workspace.html",
      homepageStructure: "v662",
      visualFreeze: "v665",
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
