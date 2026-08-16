import { loadPortalData } from "./components/data-store.js";
import { startLivingPulse } from "./components/living-pulse.js?v=667";
import { startWhyEngine } from "./components/why-engine.js";
import { startIntegrityHardening } from "./components/integrity-hardening.js";
import { startK100IntegrityReset } from "./components/k100-integrity-reset.js";
import { startMobileReconstruction } from "./components/mobile-reconstruction.js";
import { startMobileHeroVisibility } from "./components/mobile-hero-visibility.js?v=666";
import { startAssetBindingHotfix } from "./components/editorial-assets.js?v=666";
import { startHomepageStructure } from "./components/homepage-structure.js?v=666";
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
} from "./components/renderers.js?v=666";
import {
  setupNavigation,
  setupDialogs,
  setupVerticalFilter,
  setupSearch,
  setupReveal
} from "./components/interactions.js";

const EXPERIENCE_STYLE_ID = "kidults-v666-experience-closure-style";

function ensureExperienceClosureStylesheet() {
  const href = "components/v666-experience-closure.css?v=666";
  let link = document.getElementById(EXPERIENCE_STYLE_ID);
  if (!link) {
    link = document.createElement("link");
    link.id = EXPERIENCE_STYLE_ID;
    link.rel = "stylesheet";
  }
  link.href = href;
  document.head.append(link);
  return link;
}

function determineDataState(data) {
  if (!data.meta.registryProjectionConnected) return "registry-unavailable";
  if (data.registry.snapshot.candidate_id) return "candidate-registered";
  if (data.meta.verifiedFields > 0) return "verified-overlay";
  return "preview-baseline";
}

async function init() {
  document.documentElement.dataset.release = "v502";
  document.documentElement.dataset.experience = "living-intelligence-v6";
  document.documentElement.dataset.homepageStructure = "v662";
  document.documentElement.dataset.portalHotfix = "v666";
  document.documentElement.dataset.experienceClosure = "v666";
  document.documentElement.dataset.mobileLivingIntelligence = "v667";
  ensureExperienceClosureStylesheet();
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
    startIntegrityHardening({ data });
    startK100IntegrityReset({ data });

    setupDialogs(data);
    setupVerticalFilter();
    setupSearch(data.searchIndex);
    setupReveal();

    startMobileReconstruction();
    startMobileHeroVisibility({ manifest: data.manifest });
    startHomepageStructure();
    ensureExperienceClosureStylesheet();
    requestAnimationFrame(ensureExperienceClosureStylesheet);

    document.documentElement.dataset.dataState = determineDataState(data);
    window.KIDULTS_V502 = Object.freeze({
      release: data.manifest.version,
      experience: data.manifest.experience_label ?? "V6 RC",
      snapshotId: data.manifest.snapshot_id,
      candidateSnapshotId: data.manifest.candidate_snapshot_id,
      assessmentId: data.manifest.assessment_id,
      sourceMode: data.manifest.source_mode,
      livingPulse: data.pulse.version,
      livingPulseDesign: window.KIDULTS_LIVING_PULSE?.design ?? "NOT AVAILABLE",
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
      assetBindingHotfix: window.KIDULTS_ASSET_BINDING_HOTFIX?.version ?? "NOT AVAILABLE",
      experienceClosure: "v666"
    });
  } catch (error) {
    console.error("KIDULTS V6 portal initialization failed.", error);
    document.documentElement.dataset.dataState = "error";
    renderPortalError(error);
  }
}

document.addEventListener("DOMContentLoaded", init);