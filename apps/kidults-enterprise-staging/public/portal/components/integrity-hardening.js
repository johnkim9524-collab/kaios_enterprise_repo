const STYLE_ID = "kidults-v6-integrity-hardening-style";
const VERSION = "0.1.0";

function ensureStylesheet() {
  if (document.getElementById(STYLE_ID)) return;
  const link = document.createElement("link");
  link.id = STYLE_ID;
  link.rel = "stylesheet";
  link.href = "components/integrity-hardening.css?v=651";
  document.head.append(link);
}

function normalizeWhyTriggers() {
  let moved = 0;

  document.querySelectorAll(".why-enabled").forEach(card => {
    const trigger = card.querySelector(".why-trigger");
    const slot = card.querySelector("[data-why-slot]");
    if (!trigger || !slot) return;

    trigger.textContent = "WHY";
    trigger.dataset.integrityLayout = "slot";
    slot.append(trigger);
    moved += 1;
  });

  return moved;
}

function hardenCopilotStatus() {
  const status = document.querySelector(".kidults-copilot__status");
  if (!status) return false;

  status.innerHTML = `
    <span><i aria-hidden="true"></i> Registry-grounded</span>
    <span>Evidence-traceable</span>
    <span>Fail-closed</span>
  `;
  return true;
}

function exposePublicTruth(data) {
  const manifest = data?.manifest ?? {};
  document.documentElement.dataset.integrityHardening = "v651";
  document.documentElement.dataset.publicDataState = manifest.production ? "production" : "registered-preview";
}

export function startIntegrityHardening({ data } = {}) {
  if (!data) throw new Error("Integrity hardening requires portal data.");

  ensureStylesheet();
  exposePublicTruth(data);
  const whyTriggers = normalizeWhyTriggers();
  const copilotStatus = hardenCopilotStatus();

  window.KIDULTS_INTEGRITY = Object.freeze({
    version: VERSION,
    experience: data.manifest?.experience_label ?? "V6 RC",
    dataContract: data.manifest?.version ?? "NOT AVAILABLE",
    publicDataState: data.manifest?.production ? "PRODUCTION" : "REGISTERED_PREVIEW",
    whyTriggers,
    copilotStatus,
    truthRules: Object.freeze({
      absoluteWhyLayout: false,
      unsupportedLiveClaims: false,
      publicInvestmentLanguage: false,
      missingToZero: false
    })
  });
}
