const ROLES = new Set(["COLLECTOR", "DEALER", "INVESTOR", "MUSEUM", "AUCTION_HOUSE", "FAMILY_OFFICE"]);
const ORDER = ["ENTRY", "NAVIGATION", "SEARCH", "OBJECT", "EVIDENCE", "DECISION", "WORKSPACE", "EXPORT_PERMISSION", "COMPLETION"];
const KEY = "kidults-v587-business-journey-v2";
const ROLE_REQUIREMENTS = Object.freeze({
  COLLECTOR: ["identity", "evidence", "confidence", "rights", "decision", "workspace_context"],
  DEALER: ["availability", "current_sold", "qualification", "evidence", "decision", "export_permission"],
  INVESTOR: ["market_context", "confidence", "current_sold", "evidence", "decision"],
  MUSEUM: ["identity", "provenance_state", "evidence_availability", "qualification", "research_availability"],
  AUCTION_HOUSE: ["current_sold", "market_context", "evidence", "rights", "qualification"],
  FAMILY_OFFICE: ["confidence", "risk", "evidence", "rights", "qualification", "decision"]
});

const normalizeRole = value => String(value ?? "").trim().toUpperCase().replaceAll(" ", "_");
const clean = value => String(value ?? "").replace(/\s+/g, " ").trim();

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

function labeledFields(selector) {
  return [...document.querySelectorAll(selector)].reduce((fields, node) => {
    const label = clean(node.querySelector("span")?.textContent).toLowerCase().replaceAll(" ", "_");
    const value = clean(`${node.querySelector("strong")?.textContent ?? ""} ${node.querySelector("small")?.textContent ?? ""}`);
    if (label && value) fields[label] = value;
    return fields;
  }, {});
}

function captureSurface(surface, exportAllowed) {
  if (surface === "HOME") return {
    presence: clean(document.querySelector(".v587-intelligence-strip")?.textContent),
    decision_snapshot: clean(document.querySelector(".v587-decision-snapshot")?.textContent)
  };
  if (surface === "DETAIL") {
    const hierarchy = labeledFields(".v587-object-hierarchy li");
    const panel = labeledFields(".v587-decision-panel > div");
    const provenance = clean(document.querySelector(".v587-museum-context")?.textContent);
    return {
      ...hierarchy,
      ...panel,
      identity: clean(document.querySelector(".detail-hero h1")?.textContent),
      market_context: clean(document.querySelector('[aria-label="Market context"]')?.textContent),
      evidence_availability: hierarchy.evidence,
      research_availability: hierarchy.research,
      provenance_state: provenance,
      evidence_drawer: clean(document.querySelector(".v587-evidence-drawer")?.textContent)
    };
  }
  if (surface === "WORKSPACE") return {
    workspace_context: clean(document.querySelector(".workspace-page-context-copy")?.textContent),
    workspace_decision: clean(document.querySelector(".v587-workspace-flow__memo")?.textContent),
    export_permission: exportAllowed === true ? "ALLOWED" : "BLOCKED_BY_RIGHTS"
  };
  return {};
}

export function validateRoleJourneyControl(role, evidence) {
  const normalizedRole = normalizeRole(role);
  const required = ROLE_REQUIREMENTS[normalizedRole] ?? [];
  const missing = required.filter(key => !clean(evidence?.[key]));
  const journey_questions = Object.freeze({
    what_happened: clean(evidence.market_context || evidence.presence),
    why: clean(evidence.risk || evidence.decision),
    can_i_trust: clean([evidence.evidence, evidence.confidence, evidence.rights, evidence.qualification].filter(Boolean).join(" · ")),
    can_i_use: clean([evidence.availability, evidence.export_permission, evidence.decision].filter(Boolean).join(" · ")),
    what_should_i_do: clean(evidence.risk || evidence.workspace_decision || evidence.decision)
  });
  const unanswered = Object.entries(journey_questions).filter(([, value]) => !value).map(([key]) => key);
  return Object.freeze({
    role: normalizedRole,
    required_evidence: Object.freeze(required.reduce((output, key) => ({ ...output, [key]: clean(evidence?.[key]) }), {})),
    journey_questions,
    missing: Object.freeze([...missing, ...unanswered]),
    control_complete: missing.length === 0 && unanswered.length === 0
  });
}

export function startBusinessJourneyQualification({ surface, integrationBus, exportAllowed = null }) {
  const requestedRole = normalizeRole(new URL(location.href).searchParams.get("audit_role"));
  let state = readState();
  if (requestedRole) {
    if (!ROLES.has(requestedRole)) return null;
    state = { role: requestedRole, started_at: new Date().toISOString(), steps: [], integration_states: [], evidence: {} };
  }
  if (!state || !ROLES.has(state.role)) return null;
  state.evidence = { ...(state.evidence ?? {}), ...captureSurface(surface, exportAllowed) };

  const mark = step => {
    const expected = ORDER[state.steps.length];
    if (step !== expected) return false;
    state.steps.push(step);
    state.integration_states.push(integrationBus?.state ?? "NOT_EVALUATED");
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
        window.setTimeout(() => {
          const current = readState();
          if (!current) return;
          current.evidence = { ...(current.evidence ?? {}), ...captureSurface("DETAIL", null) };
          writeState(current);
        }, 0);
      }
    }, { capture: true });
  }
  if (surface === "WORKSPACE") {
    mark("WORKSPACE");
    mark("EXPORT_PERMISSION");
    mark("COMPLETION");
  }

  state = readState() ?? state;
  const complete = state.steps.length === ORDER.length;
  const validation = validateRoleJourneyControl(state.role, state.evidence ?? {});
  const core = {
    receipt_id: `v587-role-journey-control-${state.role.toLowerCase()}-${Date.parse(state.started_at)}`,
    role: state.role,
    observed_at: new Date().toISOString(),
    state: complete ? (validation.control_complete ? "CONTROL_SIMULATION_PASS" : "VERIFIED_FAIL") : "CONTROL_SIMULATION_RUNNING",
    evidence_class: "CONTROL_SIMULATION",
    human_acceptance: false,
    independent_human_review_required: true,
    promotion_eligible: false,
    steps: [...state.steps],
    integration_states: [...state.integration_states],
    role_evidence: validation.required_evidence,
    journey_questions: validation.journey_questions,
    missing_evidence: validation.missing,
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

export const businessJourneyQualificationContract = Object.freeze({
  roles: [...ROLES],
  steps: ORDER,
  questions: ["what_happened", "why", "can_i_trust", "can_i_use", "what_should_i_do"],
  role_requirements: ROLE_REQUIREMENTS,
  evidence_class: "CONTROL_SIMULATION",
  human_acceptance: false,
  independent_human_review_required: true,
  promotion_eligible: false,
  production: "HOLD",
  public: "HOLD",
  g5: "HOLD"
});
