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

/* V501 is intentionally a small post-release polish layer. Keeping it in a
   separate stylesheet makes the approved V500 design baseline auditable. */
function activateV501Polish() {
  document.documentElement.dataset.release = "v501";

  if (document.querySelector('link[data-kidults-polish="v501"]')) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "portal-v501-polish.css?v=501";
  link.dataset.kidultsPolish = "v501";
  document.head.append(link);
}

async function init() {
  activateV501Polish();
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
