/**
 * A29 — Autonomous Executive Decision Orchestration & Approval Lifecycle
 * Module: decision-audit.ts
 *
 * Every lifecycle event produces a canonical audit record.
 */

import type { AuthorityLevel, ActorType } from '../control-tower/authority-model.js';
import type { DecisionLifecycleState } from './decision-lifecycle.js';

// ---------------------------------------------------------------------------
// Audit Event Types
// ---------------------------------------------------------------------------

export type AuditEventType =
  | 'DECISION_CREATED'
  | 'RECOMMENDATION_GENERATED'
  | 'APPROVAL_RECORDED'
  | 'REJECTION_RECORDED'
  | 'DEFER_RECORDED'
  | 'PREFLIGHT_STARTED'
  | 'PREFLIGHT_PASSED'
  | 'PREFLIGHT_FAILED'
  | 'EXECUTION_STARTED'
  | 'EXECUTION_COMPLETED'
  | 'ROLLBACK_STARTED'
  | 'ROLLBACK_COMPLETED'
  | 'VERIFICATION_COMPLETED'
  | 'DECISION_CLOSED'
  | 'DECISION_SUPERSEDED'
  | 'DECISION_EXPIRED'
  | 'AUTHORITY_VALIDATION_FAILED'
  | 'IDEMPOTENCY_HIT'
  | 'LOCK_REJECTED';

// ---------------------------------------------------------------------------
// Audit Record
// ---------------------------------------------------------------------------

export interface AuditRecord {
  auditId: string;
  decisionId: string;
  eventType: AuditEventType;
  actorType: ActorType | 'SYSTEM';
  authorityLevel: AuthorityLevel | 'NONE';
  beforeState: DecisionLifecycleState | null;
  afterState: DecisionLifecycleState;
  scope: string;
  policyVersion: string;
  evidenceRefs: string[];
  timestamp: string;
  result: 'PASS' | 'FAIL' | 'INFO';
  detail: string;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

let auditCounter = 0;

export function buildAuditRecord(params: Omit<AuditRecord, 'auditId'>): AuditRecord {
  auditCounter += 1;
  return {
    auditId: `audit-${params.decisionId}-${auditCounter.toString().padStart(4, '0')}`,
    ...params,
  };
}

// ---------------------------------------------------------------------------
// Audit Log
// ---------------------------------------------------------------------------

export class AuditLog {
  private readonly records: AuditRecord[] = [];

  append(record: AuditRecord): void {
    this.records.push(record);
  }

  all(): readonly AuditRecord[] {
    return this.records;
  }

  forDecision(decisionId: string): AuditRecord[] {
    return this.records.filter(r => r.decisionId === decisionId);
  }

  count(): number {
    return this.records.length;
  }
}
