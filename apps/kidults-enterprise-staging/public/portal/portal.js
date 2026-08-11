import { loadPortalData } from "./components/data-store.js";
import {
  renderSnapshot,
  renderOperations,
  renderK100,
  renderSignals,
  renderEvidence,
  renderResearch,
  renderArchive
} from "./components/renderers.js";
import { setupNavigation, setupDialogs, setupReveal } from "./components/interactions.js";

async function init() {
  setupNavigation();

  try {
    const data = await loadPortalData();
    renderSnapshot(data.summary);
    renderOperations(data.summary);
    renderK100(data.k100);
    renderSignals(data.signals);
    renderEvidence(data.summary);
    renderResearch(data.research);
    renderArchive(data.archive);
    setupDialogs(data);
    setupReveal();

    document.documentElement.dataset.dataState =
      data.meta.verifiedFields > 0 ? "verified-overlay" : "preview-baseline";
  } catch (error) {
    console.error("KIDULTS portal initialization failed.", error);
    document.documentElement.dataset.dataState = "error";
  }
}

document.addEventListener("DOMContentLoaded", init);
