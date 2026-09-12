import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateDispatchGate,
  evaluateTerminalState,
} from "../../../src/trust/rebuild/decision-engine.mjs";

function validInput() {
  return {
    schemaVersion: "1",
    sessionId: "session-1",
    taskId: "task-1",
    traceId: "trace-1",
    receipt: {
      traceId: "trace-1",
      payloadDigest: "sha256:abc123",
      verified: true,
    },
    authority: {
      traceId: "trace-1",
      authorityRef: "owner-approval-1",
      decision: "ALLOW",
    },
    protectedGate: "CLEAR",
  };
}

test("missing input fails closed", () => {
  assert.deepEqual(evaluateDispatchGate(), {
    schemaVersion: "1",
    decision: "NOT_READY",
    state: "BLOCKED",
    reasonCode: "MISSING_REQUIRED_INPUT",
    sessionId: null,
    taskId: null,
    traceId: null,
    promotionEligible: false,
    providerAuthority: false,
    productionAuthority: false,
    publicAuthority: false,
    g5Authority: false,
  });
});

test("unverified receipt blocks dispatch", () => {
  const input = validInput();
  input.receipt.verified = false;
  assert.equal(evaluateDispatchGate(input).reasonCode, "RECEIPT_NOT_VERIFIED");
});

test("authority deny blocks dispatch", () => {
  const input = validInput();
  input.authority.decision = "DENY";
  assert.equal(evaluateDispatchGate(input).reasonCode, "AUTHORITY_DENIED");
});

test("protected HOLD dominates internal readiness", () => {
  const input = validInput();
  input.protectedGate = "HOLD";
  const result = evaluateDispatchGate(input);
  assert.equal(result.state, "HOLD");
  assert.equal(result.reasonCode, "PROTECTED_GATE_HOLD");
});

test("protected REQUIRED cannot be treated as ready", () => {
  const input = validInput();
  input.protectedGate = "REQUIRED";
  const result = evaluateDispatchGate(input);
  assert.equal(result.state, "HOLD");
  assert.equal(result.reasonCode, "PROTECTED_GATE_REQUIRED");
});

test("trace mismatch blocks dispatch", () => {
  const input = validInput();
  input.authority.traceId = "other-trace";
  assert.equal(evaluateDispatchGate(input).reasonCode, "TRACE_MISMATCH");
});

test("all internal gates satisfied yields readiness but no promotion/provider authority", () => {
  const result = evaluateDispatchGate(validInput());
  assert.equal(result.decision, "READY");
  assert.equal(result.state, "READY_FOR_DISPATCH");
  assert.equal(result.promotionEligible, false);
  assert.equal(result.providerAuthority, false);
  assert.equal(result.productionAuthority, false);
  assert.equal(result.publicAuthority, false);
  assert.equal(result.g5Authority, false);
});

test("same immutable input produces deterministic output", () => {
  const input = validInput();
  assert.deepEqual(evaluateDispatchGate(input), evaluateDispatchGate(input));
});

test("dispatch cannot become FINISHED without terminal evidence", () => {
  assert.deepEqual(
    evaluateTerminalState({ dispatchAccepted: true, terminalEvidenceRefs: [] }),
    { state: "BLOCKED", reasonCode: "TERMINAL_EVIDENCE_MISSING" },
  );
});

test("terminal evidence closes the session", () => {
  assert.deepEqual(
    evaluateTerminalState({
      dispatchAccepted: true,
      terminalEvidenceRefs: ["receipt://terminal/1"],
    }),
    {
      state: "FINISHED",
      reasonCode: "TERMINAL_EVIDENCE_CONFIRMED",
      terminalEvidenceRefs: ["receipt://terminal/1"],
    },
  );
});
