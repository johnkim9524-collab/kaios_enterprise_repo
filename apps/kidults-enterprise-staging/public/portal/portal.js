import { loadPortalData } from "./components/data-store.js";
import { startLivingPulse } from "./components/living-pulse.js";
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
} from "./components/renderers.js";
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

async function init() {
  document.documentElement.dataset.release = "v502";
  document.documentElement.dataset.experience = "living-pulse-v0-1";
  setupNavigation();

  try {
    const data = await loadPortalData();

    renderHero(data.manifest);
    renderRegistryRibbon(data.registry, data.manifest);
    renderSnapshot(data.summary);
    renderOperations(data.summary);
    renderVerticals(data.verticals);
    renderK100(data.k100);
    renderSignals(data.signals);
    renderEvidence(data.summary);
    renderResearch(data.research);
    renderArchive(data.archive);
    renderReleaseBaseline(data.registry, data.manifest);

    startLivingPulse({
      data,
      reload: loadPortalData,
      contract: data.pulse
    });

    setupDialogs(data);
    setupVerticalFilter();
    setupSearch(data.searchIndex);
    setupReveal();

    document.documentElement.dataset.dataState = determineDataState(data);
    window.KIDULTS_V502 = Object.freeze({
      release: data.manifest.version,
      snapshotId: data.manifest.snapshot_id,
      candidateSnapshotId: data.manifest.candidate_snapshot_id,
      assessmentId: data.manifest.assessment_id,
      sourceMode: data.manifest.source_mode,
      livingPulse: data.pulse.version
    });
  } catch (error) {
    console.error("KIDULTS V502 portal initialization failed.", error);
    document.documentElement.dataset.dataState = "error";
    renderPortalError(error);
  }
}

document.addEventListener("DOMContentLoaded", init);
