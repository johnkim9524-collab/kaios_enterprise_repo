import type { DecisionAction, DecisionActionState } from './control-tower-types.js';

export const SUPPORTED_EXECUTIVE_ACTIONS: readonly DecisionAction[] = [
  'ACKNOWLEDGE',
  'APPROVE',
  'APPROVE_LIMITED_SCOPE',
  'REJECT',
  'DEFER',
  'MAINTAIN_FREEZE',
  'RELEASE_FREEZE',
  'ALLOW_DEGRADED_OPERATION',
  'HALT_SCOPE',
  'RESUME_SCOPE',
] as const;

export interface ActionBoundaryInput {
  authorityKnown: boolean;
  evidenceMissing: boolean;
  evidenceStale: boolean;
  policyKnown: boolean;
  decisionExpired: boolean;
  decisionSuperseded: boolean;
  freezeBlocksAction: boolean;
  riskUnknown: boolean;
  securityValidationResolved: boolean;
  permittedActions: DecisionAction[];
}

export function evaluateDecisionActionState(input: ActionBoundaryInput): DecisionActionState {
  const reasons: string[] = [];
  if (!input.authorityKnown) reasons.push('Authority unknown');
  if (input.evidenceMissing) reasons.push('Evidence missing');
  if (input.evidenceStale) reasons.push('Evidence stale');
  if (!input.policyKnown) reasons.push('Policy unknown');
  if (input.decisionExpired) reasons.push('Decision expired');
  if (input.decisionSuperseded) reasons.push('Decision superseded');
  if (input.freezeBlocksAction) reasons.push('Change freeze blocks action');
  if (input.riskUnknown) reasons.push('Risk state unknown');
  if (!input.securityValidationResolved) reasons.push('Security validation unresolved');
  const permittedActions = input.permittedActions.filter((action) => SUPPORTED_EXECUTIVE_ACTIONS.includes(action));
  if (permittedActions.length === 0) reasons.push('No permitted actions');
  return {
    enabled: reasons.length === 0,
    reason: reasons.length ? reasons.join('; ') : null,
    permittedActions,
  };
}

export function buildBoundedExecutiveActionRequest(decisionId: string, action: DecisionAction) {
  if (!SUPPORTED_EXECUTIVE_ACTIONS.includes(action)) {
    throw new Error(`Unsupported action: ${action}`);
  }
  return Object.freeze({
    decisionId,
    action,
    bounded: true,
    unrestrictedPayloadAllowed: false,
  });
}
