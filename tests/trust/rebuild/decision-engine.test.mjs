import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateDispatchGate,
  evaluateTerminalState,
} from "../../../src/trust/rebuild/decision-engine.mjs";

const DIGEST_A = `sha256:${"a".repeat(64)}`;
const DIGEST_B = `sha256:${"b".repeat(64)}`;
const DIGEST_C = `sha256:${"c".repeat(64)}`;
const DIGEST_D = `sha256:${"d".repeat(64)}`;

function validInput() {
  const scope = { sessionId: "session-1", taskId: "task-1", traceId: "trace-1" };
  return {
    schemaVersion: "1",
    ...scope,
    receipt: { ...scope, payloadDigest: DIGEST_A, verified: true },
    authority: {
      ...scope,
      authorityRef: "owner-approval-1",
      authorityDigest: DIGEST_B,
      scope: "INTERNAL_DISPATCH_ONLY",
      decision: "ALLOW",
    },
    protectedGateReceipt: {
      ...scope,
      gateRef: "protected-gate-1",
      gateDigest: DIGEST_C,
      state: "CLEAR",
    },
  };
}

function validTerminalInput() {
  const input = validInput();
  return {
    schemaVersion: "1",
    sessionId: input.sessionId,
    taskId: input.taskId,
    traceId: input.traceId,
    dispatchDecision: evaluateDispatchGate(input),
    terminalEvidence: [{
      sessionId: input.sessionId,
      taskId: input.taskId,
      traceId: input.traceId,
      ref: "receipt://terminal/1",
      digest: DIGEST_D,
    }],
  };
}

test("missing input fails closed with all authority flags false", () => {
  const result = evaluateDispatchGate();
  assert.equal(result.reasonCode, "MISSING_REQUIRED_INPUT");
  assert.equal(result.promotionEligible, false);
  assert.equal(result.providerAuthority, false);
  assert.equal(result.productionAuthority, false);
  assert.equal(result.publicAuthority, false);
  assert.equal(result.g5Authority, false);
});

test("malformed receipt digest cannot be admitted", () => {
  const input = validInput();
  input.receipt.payloadDigest = "sha256:abc123";
  assert.equal(evaluateDispatchGate(input).reasonCode, "RECEIPT_DIGEST_INVALID");
});

test("cross-session receipt replay fails closed", () => {
  const input = validInput();
  input.receipt.sessionId = "other-session";
  assert.equal(evaluateDispatchGate(input).reasonCode, "RECEIPT_SCOPE_MISMATCH");
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

test("ALLOW without an authority reference fails closed", () => {
  const input = validInput();
  delete input.authority.authorityRef;
  assert.equal(evaluateDispatchGate(input).reasonCode, "AUTHORITY_REF_MISSING");
});

test("malformed authority digest fails closed", () => {
  const input = validInput();
  input.authority.authorityDigest = "not-a-digest";
  assert.equal(evaluateDispatchGate(input).reasonCode, "AUTHORITY_DIGEST_INVALID");
});

test("cross-task authority replay fails closed", () => {
  const input = validInput();
  input.authority.taskId = "other-task";
  assert.equal(evaluateDispatchGate(input).reasonCode, "AUTHORITY_SCOPE_MISMATCH");
});

test("authority cannot widen beyond internal dispatch", () => {
  const input = validInput();
  input.authority.scope = "PRODUCTION";
  assert.equal(evaluateDispatchGate(input).reasonCode, "AUTHORITY_SCOPE_INVALID");
});

test("bare caller-controlled protected gate string is rejected", () => {
  const input = validInput();
  delete input.protectedGateReceipt;
  input.protectedGate = "CLEAR";
  assert.equal(evaluateDispatchGate(input).reasonCode, "PROTECTED_GATE_RECEIPT_MISSING");
});

test("cross-trace protected gate replay fails closed", () => {
  const input = validInput();
  input.protectedGateReceipt.traceId = "other-trace";
  assert.equal(evaluateDispatchGate(input).reasonCode, "PROTECTED_GATE_SCOPE_MISMATCH");
});

test("protected HOLD dominates internal readiness", () => {
  const input = validInput();
  input.protectedGateReceipt.state = "HOLD";
  const result = evaluateDispatchGate(input);
  assert.equal(result.state, "HOLD");
  assert.equal(result.reasonCode, "PROTECTED_GATE_HOLD");
});

test("protected REQUIRED cannot be treated as ready", () => {
  const input = validInput();
  input.protectedGateReceipt.state = "REQUIRED";
  const result = evaluateDispatchGate(input);
  assert.equal(result.state, "HOLD");
  assert.equal(result.reasonCode, "PROTECTED_GATE_REQUIRED");
});

test("all bound internal gates yield internal-only readiness", () => {
  const result = evaluateDispatchGate(validInput());
  assert.equal(result.decision, "READY");
  assert.equal(result.state, "READY_FOR_INTERNAL_DISPATCH");
  assert.match(result.decisionDigest, /^sha256:[0-9a-f]{64}$/);
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

test("legacy boolean acceptance cannot spoof FINISHED", () => {
  assert.deepEqual(
    evaluateTerminalState({ dispatchAccepted: true, terminalEvidenceRefs: ["receipt://terminal/1"] }),
    { state: "BLOCKED", reasonCode: "TERMINAL_SCHEMA_INVALID" },
  );
});

test("dispatch cannot become FINISHED without terminal evidence", () => {
  const input = validTerminalInput();
  input.terminalEvidence = [];
  assert.equal(evaluateTerminalState(input).reasonCode, "TERMINAL_EVIDENCE_MISSING");
});

test("tampered dispatch decision cannot close the session", () => {
  const input = validTerminalInput();
  input.dispatchDecision = { ...input.dispatchDecision, authorityRef: "forged-authority" };
  assert.equal(evaluateTerminalState(input).reasonCode, "DISPATCH_DECISION_DIGEST_MISMATCH");
});

test("authority escalation in a dispatch decision cannot close the session", () => {
  const input = validTerminalInput();
  input.dispatchDecision = { ...input.dispatchDecision, productionAuthority: true };
  assert.equal(evaluateTerminalState(input).reasonCode, "DISPATCH_AUTHORITY_ESCALATION");
});

test("malformed terminal evidence digest fails closed", () => {
  const input = validTerminalInput();
  input.terminalEvidence[0].digest = "sha256:short";
  assert.equal(evaluateTerminalState(input).reasonCode, "TERMINAL_EVIDENCE_INVALID");
});

test("cross-trace terminal evidence replay fails closed", () => {
  const input = validTerminalInput();
  input.terminalEvidence[0].traceId = "other-trace";
  assert.equal(evaluateTerminalState(input).reasonCode, "TERMINAL_EVIDENCE_SCOPE_MISMATCH");
});

test("bound terminal evidence closes only the matching session", () => {
  const input = validTerminalInput();
  const result = evaluateTerminalState(input);
  assert.equal(result.state, "FINISHED");
  assert.equal(result.dispatchDecisionDigest, input.dispatchDecision.decisionDigest);
  assert.deepEqual(result.terminalEvidence, [{ ref: "receipt://terminal/1", digest: DIGEST_D }]);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.terminalEvidence), true);
  assert.equal(Object.isFrozen(result.terminalEvidence[0]), true);
});
