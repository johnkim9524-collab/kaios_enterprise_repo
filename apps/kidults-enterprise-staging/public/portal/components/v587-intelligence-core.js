const FACTORS = Object.freeze([
  ["evidence", 0.25],
  ["coverage", 0.20],
  ["freshness", 0.15],
  ["rights", 0.15],
  ["consistency", 0.15],
  ["qualification", 0.10]
]);

const ACTIONS = Object.freeze(["VIEW", "COMPARE", "WORKSPACE", "EXPORT", "PUBLISH"]);
const RELEASED_RIGHTS = new Set(["CLEARED", "APPROVED", "RELEASED"]);
const GRANTED_PERMISSIONS = new Set(["GRANTED", "ALLOWED"]);
const RELEASE_STATES = new Set(["RELEASED", "APPROVED", "PUBLIC"]);

const token = value => String(value ?? "").trim().toUpperCase().replaceAll("_", " ");

function boundedScore(value) {
  if (value === null || value === undefined || value === "") return null;
  const score = Number(value);
  return Number.isFinite(score) && score >= 0 && score <= 100 ? score : null;
}

export function freshnessScore(value) {
  const numeric = boundedScore(value);
  if (numeric !== null) return numeric;
  const state = token(value);
  if (state === "FRESH") return 100;
  if (state === "CURRENT") return 80;
  if (state === "STALE") return 0;
  return null;
}

export function rightsScore(value) {
  const numeric = boundedScore(value);
  if (numeric !== null) return numeric;
  const state = token(value);
  if (RELEASED_RIGHTS.has(state)) return 100;
  if (state === "PARTIAL") return 50;
  if (["HOLD", "BLOCKED", "NONE", "PROHIBITED"].includes(state)) return 0;
  return null;
}

export function qualificationScore(value) {
  const numeric = boundedScore(value);
  if (numeric !== null) return numeric;
  const state = token(value);
  if (["PASS", "QUALIFIED", "READY", "RANKABLE"].includes(state)) return 100;
  if (["WAIT", "WAITING", "HOLD", "NOT AVAILABLE", "NOT REGISTERED"].includes(state)) return 0;
  return null;
}

export function computeConfidence(input = {}) {
  const scores = {
    evidence: boundedScore(input.evidence),
    coverage: boundedScore(input.coverage),
    freshness: freshnessScore(input.freshness),
    rights: rightsScore(input.rights),
    consistency: boundedScore(input.consistency),
    qualification: qualificationScore(input.qualification)
  };
  const missing = FACTORS.map(([name]) => name).filter(name => scores[name] === null);
  if (missing.length) {
    return Object.freeze({
      value: null,
      label: "NOT AVAILABLE",
      explanation: `Confidence unavailable: missing ${missing.join(", ")}.`,
      factors: Object.freeze(scores),
      missing: Object.freeze(missing)
    });
  }
  const value = Math.round(FACTORS.reduce((total, [name, weight]) => total + scores[name] * weight, 0));
  const explanation = `Computed from evidence ${scores.evidence}%, coverage ${scores.coverage}%, freshness ${scores.freshness}%, rights ${scores.rights}%, consistency ${scores.consistency}%, and qualification ${scores.qualification}%.`;
  return Object.freeze({ value, label: `${value}%`, explanation, factors: Object.freeze(scores), missing: Object.freeze([]) });
}

export function evaluateRights(input = {}, requestedAction = "VIEW", synthetic = false) {
  const requested = token(requestedAction).replaceAll(" ", "_");
  const configuredActions = Array.isArray(input.allowed_actions)
    ? input.allowed_actions.map(action => token(action).replaceAll(" ", "_")).filter(action => ACTIONS.includes(action))
    : [];
  const released = !synthetic
    && RELEASED_RIGHTS.has(token(input.rights))
    && GRANTED_PERMISSIONS.has(token(input.permission))
    && RELEASE_STATES.has(token(input.release_state));
  const allowedActions = released ? [...new Set(configuredActions)] : [];
  return Object.freeze({
    rights: synthetic ? "SYNTHETIC" : token(input.rights) || "NOT AVAILABLE",
    permission: synthetic ? "DENIED" : token(input.permission) || "NOT AVAILABLE",
    release_state: synthetic ? "HOLD" : token(input.release_state) || "HOLD",
    allowed_actions: Object.freeze(allowedActions),
    requested_action: requested,
    action_allowed: allowedActions.includes(requested)
  });
}

export function buildIntelligenceDecision({
  synthetic = false,
  factors = {},
  rights = {},
  requestedAction = "VIEW",
  reason = "Evidence-bound review"
} = {}) {
  const confidence = computeConfidence(factors);
  const rightsDecision = evaluateRights(rights, requestedAction, synthetic);
  let decision = "READY";
  if (synthetic) decision = "SYNTHETIC";
  else if (!rightsDecision.action_allowed) decision = "RIGHTS BLOCKED";
  else if (confidence.value === null || confidence.factors.evidence === 0 || confidence.factors.coverage === 0) decision = "INSUFFICIENT EVIDENCE";
  else if (confidence.factors.qualification < 100) decision = "WAIT";
  else if (confidence.value < 60) decision = "LOW CONFIDENCE";

  const action = decision === "READY" ? rightsDecision.requested_action : "NONE";
  return Object.freeze({
    evidence: Object.freeze({
      score: confidence.factors.evidence,
      coverage: confidence.factors.coverage,
      freshness: confidence.factors.freshness,
      consistency: confidence.factors.consistency,
      qualification: confidence.factors.qualification
    }),
    reason,
    confidence,
    rights: rightsDecision,
    decision,
    action
  });
}

export const v587IntelligenceCoreContract = Object.freeze({
  version: "1.0.0",
  flow: Object.freeze(["EVIDENCE", "REASON", "CONFIDENCE", "DECISION", "ACTION"]),
  confidence_factors: Object.freeze(FACTORS.map(([name]) => name.toUpperCase())),
  decision_states: Object.freeze(["READY", "WAIT", "LOW CONFIDENCE", "RIGHTS BLOCKED", "INSUFFICIENT EVIDENCE", "SYNTHETIC"]),
  actions: ACTIONS,
  production: "HOLD",
  public: "HOLD",
  g5: "HOLD"
});
