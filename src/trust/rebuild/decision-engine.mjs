import { createHash } from "node:crypto";

const REQUIRED_STRING_FIELDS = ["sessionId", "taskId", "traceId"];
const SHA256_DIGEST = /^sha256:[0-9a-f]{64}$/;
const INTERNAL_AUTHORITY_SCOPE = "INTERNAL_DISPATCH_ONLY";

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function record(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validDigest(value) {
  return typeof value === "string" && SHA256_DIGEST.test(value);
}

function sameScope(candidate, input) {
  return REQUIRED_STRING_FIELDS.every((field) => candidate[field] === input[field]);
}

function hardFalseAuthority(candidate) {
  return [
    "promotionEligible",
    "providerAuthority",
    "productionAuthority",
    "publicAuthority",
    "g5Authority",
  ].every((field) => candidate[field] === false);
}

function digestDispatchDecision(candidate) {
  const canonical = [
    candidate.schemaVersion,
    candidate.decision,
    candidate.state,
    candidate.sessionId,
    candidate.taskId,
    candidate.traceId,
    candidate.receiptDigest,
    candidate.authorityRef,
    candidate.authorityDigest,
    candidate.authorityScope,
    candidate.protectedGateRef,
    candidate.protectedGateDigest,
    candidate.promotionEligible,
    candidate.providerAuthority,
    candidate.productionAuthority,
    candidate.publicAuthority,
    candidate.g5Authority,
  ];
  return `sha256:${createHash("sha256").update(JSON.stringify(canonical)).digest("hex")}`;
}

function fail(state, reasonCode, input = {}) {
  return Object.freeze({
    schemaVersion: "1",
    decision: "NOT_READY",
    state,
    reasonCode,
    sessionId: nonEmptyString(input.sessionId) ? input.sessionId : null,
    taskId: nonEmptyString(input.taskId) ? input.taskId : null,
    traceId: nonEmptyString(input.traceId) ? input.traceId : null,
    promotionEligible: false,
    providerAuthority: false,
    productionAuthority: false,
    publicAuthority: false,
    g5Authority: false,
  });
}

function terminalFail(reasonCode) {
  return Object.freeze({ state: "BLOCKED", reasonCode });
}

export function evaluateDispatchGate(input) {
  if (!record(input)) {
    return fail("BLOCKED", "MISSING_REQUIRED_INPUT");
  }

  if (input.schemaVersion !== "1") {
    return fail("BLOCKED", "UNSUPPORTED_SCHEMA_VERSION", input);
  }

  for (const field of REQUIRED_STRING_FIELDS) {
    if (!nonEmptyString(input[field])) {
      return fail("BLOCKED", `INVALID_${field.toUpperCase()}`, input);
    }
  }

  const receipt = input.receipt;
  if (!record(receipt)) {
    return fail("BLOCKED", "RECEIPT_RESULT_MISSING", input);
  }
  if (!sameScope(receipt, input)) {
    return fail("BLOCKED", "RECEIPT_SCOPE_MISMATCH", input);
  }
  if (!validDigest(receipt.payloadDigest)) {
    return fail("BLOCKED", "RECEIPT_DIGEST_INVALID", input);
  }
  if (receipt.verified !== true) {
    return fail("BLOCKED", "RECEIPT_NOT_VERIFIED", input);
  }

  const authority = input.authority;
  if (!record(authority)) {
    return fail("BLOCKED", "AUTHORITY_RESULT_MISSING", input);
  }
  if (!sameScope(authority, input)) {
    return fail("BLOCKED", "AUTHORITY_SCOPE_MISMATCH", input);
  }
  if (authority.decision !== "ALLOW" && authority.decision !== "DENY") {
    return fail("BLOCKED", "AUTHORITY_DECISION_INVALID", input);
  }
  if (authority.decision === "DENY") {
    return fail("BLOCKED", "AUTHORITY_DENIED", input);
  }
  if (!nonEmptyString(authority.authorityRef)) {
    return fail("BLOCKED", "AUTHORITY_REF_MISSING", input);
  }
  if (!validDigest(authority.authorityDigest)) {
    return fail("BLOCKED", "AUTHORITY_DIGEST_INVALID", input);
  }
  if (authority.scope !== INTERNAL_AUTHORITY_SCOPE) {
    return fail("BLOCKED", "AUTHORITY_SCOPE_INVALID", input);
  }

  const protectedGate = input.protectedGateReceipt;
  if (!record(protectedGate)) {
    return fail("BLOCKED", "PROTECTED_GATE_RECEIPT_MISSING", input);
  }
  if (!sameScope(protectedGate, input)) {
    return fail("BLOCKED", "PROTECTED_GATE_SCOPE_MISMATCH", input);
  }
  if (!nonEmptyString(protectedGate.gateRef) || !validDigest(protectedGate.gateDigest)) {
    return fail("BLOCKED", "PROTECTED_GATE_RECEIPT_INVALID", input);
  }
  if (protectedGate.state === "HOLD") {
    return fail("HOLD", "PROTECTED_GATE_HOLD", input);
  }
  if (protectedGate.state === "REQUIRED") {
    return fail("HOLD", "PROTECTED_GATE_REQUIRED", input);
  }
  if (protectedGate.state !== "CLEAR") {
    return fail("BLOCKED", "PROTECTED_GATE_INVALID", input);
  }

  const decision = {
    schemaVersion: "1",
    decision: "READY",
    state: "READY_FOR_INTERNAL_DISPATCH",
    reasonCode: "ALL_INTERNAL_GATES_SATISFIED",
    sessionId: input.sessionId,
    taskId: input.taskId,
    traceId: input.traceId,
    receiptDigest: receipt.payloadDigest,
    authorityRef: authority.authorityRef,
    authorityDigest: authority.authorityDigest,
    authorityScope: authority.scope,
    protectedGateRef: protectedGate.gateRef,
    protectedGateDigest: protectedGate.gateDigest,
    promotionEligible: false,
    providerAuthority: false,
    productionAuthority: false,
    publicAuthority: false,
    g5Authority: false,
  };
  decision.decisionDigest = digestDispatchDecision(decision);
  return Object.freeze(decision);
}

export function evaluateTerminalState(input) {
  if (!record(input)) {
    return terminalFail("TERMINAL_INPUT_MISSING");
  }
  if (input.schemaVersion !== "1") {
    return terminalFail("TERMINAL_SCHEMA_INVALID");
  }
  if (REQUIRED_STRING_FIELDS.some((field) => !nonEmptyString(input[field]))) {
    return terminalFail("TERMINAL_SCOPE_INVALID");
  }

  const dispatch = input.dispatchDecision;
  if (!record(dispatch)) {
    return terminalFail("DISPATCH_DECISION_MISSING");
  }
  if (!sameScope(dispatch, input)) {
    return terminalFail("DISPATCH_SCOPE_MISMATCH");
  }
  if (dispatch.decision !== "READY" || dispatch.state !== "READY_FOR_INTERNAL_DISPATCH") {
    return terminalFail("DISPATCH_NOT_READY");
  }
  if (!hardFalseAuthority(dispatch)) {
    return terminalFail("DISPATCH_AUTHORITY_ESCALATION");
  }
  if (
    dispatch.schemaVersion !== "1" ||
    !validDigest(dispatch.receiptDigest) ||
    !nonEmptyString(dispatch.authorityRef) ||
    !validDigest(dispatch.authorityDigest) ||
    dispatch.authorityScope !== INTERNAL_AUTHORITY_SCOPE ||
    !nonEmptyString(dispatch.protectedGateRef) ||
    !validDigest(dispatch.protectedGateDigest)
  ) {
    return terminalFail("DISPATCH_DECISION_INVALID");
  }
  if (!validDigest(dispatch.decisionDigest) || dispatch.decisionDigest !== digestDispatchDecision(dispatch)) {
    return terminalFail("DISPATCH_DECISION_DIGEST_MISMATCH");
  }

  if (!Array.isArray(input.terminalEvidence) || input.terminalEvidence.length === 0) {
    return terminalFail("TERMINAL_EVIDENCE_MISSING");
  }
  for (const evidence of input.terminalEvidence) {
    if (!record(evidence) || !nonEmptyString(evidence.ref) || !validDigest(evidence.digest)) {
      return terminalFail("TERMINAL_EVIDENCE_INVALID");
    }
    if (!sameScope(evidence, input)) {
      return terminalFail("TERMINAL_EVIDENCE_SCOPE_MISMATCH");
    }
  }

  const terminalEvidence = input.terminalEvidence.map((evidence) =>
    Object.freeze({ ref: evidence.ref, digest: evidence.digest }),
  );
  return Object.freeze({
    schemaVersion: "1",
    state: "FINISHED",
    reasonCode: "TERMINAL_EVIDENCE_CONFIRMED",
    sessionId: input.sessionId,
    taskId: input.taskId,
    traceId: input.traceId,
    dispatchDecisionDigest: dispatch.decisionDigest,
    terminalEvidence: Object.freeze(terminalEvidence),
  });
}
