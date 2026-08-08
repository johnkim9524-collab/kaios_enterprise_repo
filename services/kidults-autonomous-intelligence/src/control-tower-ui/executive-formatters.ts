import type { DecisionAction } from './control-tower-types.js';

const actionLabels: Record<DecisionAction, string> = {
  ACKNOWLEDGE: 'Acknowledge',
  APPROVE: 'Approve',
  APPROVE_LIMITED_SCOPE: 'Approve Limited Scope',
  REJECT: 'Reject',
  DEFER: 'Defer',
  MAINTAIN_FREEZE: 'Maintain Freeze',
  RELEASE_FREEZE: 'Release Freeze',
  ALLOW_DEGRADED_OPERATION: 'Allow Degraded Operation',
  HALT_SCOPE: 'Halt Scope',
  RESUME_SCOPE: 'Resume Scope',
};

export function formatActionLabel(action: DecisionAction): string {
  return actionLabels[action] ?? action.replaceAll('_', ' ');
}

export function formatTimestamp(value: string): string {
  const stamp = Date.parse(value);
  if (!Number.isFinite(stamp)) return value;
  return new Date(stamp).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

export function toBusinessLabel(value: string): string {
  return value
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase());
}
