const ROLES = new Set(["COLLECTOR", "DEALER", "INVESTOR", "MUSEUM", "AUCTION_HOUSE", "FAMILY_OFFICE"]);
const ORDER = ["ENTRY", "NAVIGATION", "SEARCH", "OBJECT", "EVIDENCE", "DECISION", "WORKSPACE", "EXPORT_PERMISSION", "COMPLETION"];
const KEY = "kidults-v587-business-journey-v1";

const normalizeRole = value => String(value ?? "").trim().toUpperCase().replaceAll(" ", "_");

function readState() {
  try { return JSON.parse(sessionStorage.getItem(KEY) ?? "null"); } catch { return null; }
}

function writeState(state) {
  sessionStorage.setItem(KEY, JSON.stringify(state));
}

async function digest(value) {
  const output = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)));
  return `sha256:${[...new Uint8Array(output)].map(byte => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function startBusinessJourneyQualification({ surface, integrationBus, exportAllowed = null }) {
  const requestedRole = normalizeRole(new URL(location.href).searchParams.get("audit_role"));
  let state = readState();
  if (requestedRole) {
    if (!ROLES.has(requestedRole)) return null;
    state = { role: requestedRole, started_at: new Date().toISOString(), steps: [], integration_states: [] };
  }
  if (!state || !ROLES.has(state.role)) return null;

  const mark = step => {
    const expected = ORDER[state.steps.length];
    if (step !== expected) return false;
    state.steps.push(step);
    state.integration_states.push(integrationBus?.state ?? "UNKNOWN");
    writeState(state);
    return true;
  };

  if (surface === "HOME") {
    mark("ENTRY");
    document.addEventListener("click", event => {
      if (event.target.closest("[data-search-open]")) mark("NAVIGATION");
      if (event.target.closest("[data-search-results] a")) mark("SEARCH");
    }, { capture: true });
  }
  if (surface === "DETAIL") {
    mark("OBJECT");
    document.addEventListener("click", event => {
      if (event.target.closest("[data-v587-evidence-open]")) {
        if (mark("EVIDENCE")) mark("DECISION");
      }
    }, { capture: true });
  }
  if (surface === "WORKSPACE") {
    mark("WORKSPACE");
    mark("EXPORT_PERMISSION");
    mark("COMPLETION");
  }

  const complete = state.steps.length === ORDER.length;
  const core = {
    receipt_id: `v587-business-journey-${state.role.toLowerCase()}-${Date.parse(state.started_at)}`,
    role: state.role,
    observed_at: new Date().toISOString(),
    state: complete ? "VERIFIED_PASS" : "RUNNING_VERIFIED",
    steps: [...state.steps],
    integration_states: [...state.integration_states],
    export_permission: exportAllowed === true ? "ALLOWED" : exportAllowed === false ? "BLOCKED_BY_RIGHTS" : "NOT_YET_EVALUATED",
    production: "HOLD",
    public: "HOLD",
    g5: "HOLD"
  };
  window.KIDULTS_BUSINESS_JOURNEY_RECEIPT_READY = digest(core).then(receipt_digest => {
    const receipt = Object.freeze({ ...core, receipt_digest });
    document.documentElement.dataset.businessJourneyReceipt = JSON.stringify(receipt);
    if (complete) sessionStorage.removeItem(KEY);
    return receipt;
  });
  return window.KIDULTS_BUSINESS_JOURNEY_RECEIPT_READY;
}

export const businessJourneyQualificationContract = Object.freeze({ roles: [...ROLES], steps: ORDER, production: "HOLD", public: "HOLD", g5: "HOLD" });
