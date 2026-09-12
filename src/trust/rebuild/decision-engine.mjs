const REQUIRED_STRING_FIELDS = ["sessionId", "taskId", "traceId"];

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
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

export function evaluateDispatchGate(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
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
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) {
    return fail("BLOCKED", "RECEIPT_RESULT_MISSING", input);
  }

  if (receipt.traceId !== input.traceId) {
    return fail("BLOCKED", "TRACE_MISMATCH", input);
  }

  if (!nonEmptyString(receipt.payloadDigest)) {
    return fail("BLOCKED", "RECEIPT_DIGEST_MISSING", input);
  }

  if (receipt.verified !== true) {
    return fail("BLOCKED", "RECEIPT_NOT_VERIFIED", input);
  }

  const authority = input.authority;
  if (!authority || typeof authority !== "object" || Array.isArray(authority)) {
    return fail("BLOCKED", "AUTHORITY_RESULT_MISSING", input);
  }

  if (authority.traceId !== input.traceId) {
    return fail("BLOCKED", "TRACE_MISMATCH", input);
  }

  if (authority.decision !== "ALLOW" && authority.decision !== "DENY") {
    return fail("BLOCKED", "AUTHORITY_DECISION_INVALID", input);
  }

  if (authority.decision === "DENY") {
    return fail("BLOCKED", "AUTHORITY_DENIED", input);
  }

  if (input.protectedGate === "HOLD") {
    return fail("HOLD", "PROTECTED_GATE_HOLD", input);
  }

  if (input.protectedGate === "REQUIRED") {
    return fail("HOLD", "PROTECTED_GATE_REQUIRED", input);
  }

  if (input.protectedGate !== "CLEAR") {
    return fail("BLOCKED", "PROTECTED_GATE_INVALID", input);
  }

  return Object.freeze({
    schemaVersion: "1",
    decision: "READY",
    state: "READY_FOR_DISPATCH",
    reasonCode: "ALL_INTERNAL_GATES_SATISFIED",
    sessionId: input.sessionId,
    taskId: input.taskId,
    traceId: input.traceId,
    receiptDigest: receipt.payloadDigest,
    authorityRef: nonEmptyString(authority.authorityRef) ? authority.authorityRef : null,
    promotionEligible: false,
    providerAuthority: false,
    productionAuthority: false,
    publicAuthority: false,
    g5Authority: false,
  });
}

export function evaluateTerminalState(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return Object.freeze({ state: "FAILED", reasonCode: "TERMINAL_INPUT_MISSING" });
  }

  if (input.dispatchAccepted !== true) {
    return Object.freeze({ state: "BLOCKED", reasonCode: "DISPATCH_NOT_ACCEPTED" });
  }

  if (!Array.isArray(input.terminalEvidenceRefs) || input.terminalEvidenceRefs.length === 0) {
    return Object.freeze({ state: "BLOCKED", reasonCode: "TERMINAL_EVIDENCE_MISSING" });
  }

  if (!input.terminalEvidenceRefs.every(nonEmptyString)) {
    return Object.freeze({ state: "BLOCKED", reasonCode: "TERMINAL_EVIDENCE_INVALID" });
  }

  return Object.freeze({
    state: "FINISHED",
    reasonCode: "TERMINAL_EVIDENCE_CONFIRMED",
    terminalEvidenceRefs: Object.freeze([...input.terminalEvidenceRefs]),
  });
}
