/**
 * A28 — Autonomous Control Tower & Executive Governance Plane
 * Module: executive-audit.ts
 *
 * Every executive decision/directive produces an immutable audit record.
 */

import type { ActorType, AuthorityLevel } from './authority-model.js';
import type { EvidenceRef } from './signal-aggregator.js';

// ---------------------------------------------------------------------------
// Audit Record
// ---------------------------------------------------------------------------

export interface ExecutiveAuditRecord {
  readonly auditId: string;
  readonly actorType: ActorType;
  readonly authorityLevel: AuthorityLevel;
  readonly decisionId: string | null;
  readonly directiveId: string | null;
  readonly action: string;
  readonly scope: string[];
  readonly policyVersion: string;
  readonly beforeState: string;
  readonly afterState: string;
  readonly evidenceRefs: EvidenceRef[];
  readonly timestamp: string;
  readonly result: 'SUCCESS' | 'REJECTED' | 'FAILED' | 'PARTIAL';
  readonly reason: string;
}

export function buildAuditRecord(
  id: string,
  opts: Omit<ExecutiveAuditRecord, 'auditId' | 'timestamp'>,
): ExecutiveAuditRecord {
  return Object.freeze({
    auditId: id,
    timestamp: new Date().toISOString(),
    ...opts,
  });
}

// ---------------------------------------------------------------------------
// Audit Log (in-memory for simulation; persisted via evidence output)
// ---------------------------------------------------------------------------

export class ExecutiveAuditLog {
  private readonly records: ExecutiveAuditRecord[] = [];

  append(record: ExecutiveAuditRecord): void {
    this.records.push(record);
  }

  getAll(): readonly ExecutiveAuditRecord[] {
    return this.records;
  }

  getByDecision(decisionId: string): readonly ExecutiveAuditRecord[] {
    return this.records.filter((r) => r.decisionId === decisionId);
  }

  getByDirective(directiveId: string): readonly ExecutiveAuditRecord[] {
    return this.records.filter((r) => r.directiveId === directiveId);
  }

  exportSummary(): { count: number; recentRecords: ExecutiveAuditRecord[] } {
    return {
      count: this.records.length,
      recentRecords: this.records.slice(-10),
    };
  }
}
