import { describe, expect, it } from 'vitest';
import { createRollbackEvent, evaluatePublication, orchestratePublication, type ProductInput } from './index.js';

const base: ProductInput = {
  vertical: 'kidults',
  kind: 'index',
  productId: 'kidult-100',
  scheduledFor: '2026-07-30T00:00:00Z',
  methodologyStatus: 'active',
  rightsStatus: 'approved',
  confidence: 94,
  evidenceCount: 12,
  sourceCoverage: 8,
  freshness: 'current',
  checksum: 'abc123',
};

describe('publication orchestrator', () => {
  it('publishes eligible governed products', () => {
    expect(evaluatePublication(base)).toEqual({ state: 'publishing', eligible: true, reasons: [], retryable: false });
  });

  it('schedules retry only for recoverable gaps', () => {
    const result = evaluatePublication({ ...base, evidenceCount: 0 });
    expect(result.state).toBe('retry_scheduled');
    expect(result.retryable).toBe(true);
  });

  it('hard blocks rights and provenance failures', () => {
    const rights = evaluatePublication({ ...base, rightsStatus: 'restricted' });
    expect(rights.state).toBe('blocked');
    expect(rights.retryable).toBe(false);

    const artfund = evaluatePublication({ ...base, vertical: 'artfund', provenanceDisputed: true });
    expect(artfund.reasons).toContain('provenance_disputed');
  });

  it('isolates vertical incidents and preserves deterministic order', () => {
    const results = orchestratePublication('run-1', '2026-07-30T00:00:00Z', '2026-07-30T00:01:00Z', [
      { ...base, vertical: 'artfund', kind: 'report', productId: 'art-report', rightsStatus: 'unknown' },
      base,
      { ...base, kind: 'alert', productId: 'risk-alert', evidenceCount: 0 },
    ]);
    const kidults = results.find((result) => result.vertical === 'kidults');
    const artfund = results.find((result) => result.vertical === 'artfund');
    expect(kidults?.incidentRequired).toBe(false);
    expect(artfund?.incidentRequired).toBe(true);
    expect(kidults?.decisions.map((item) => item.productId)).toEqual(['risk-alert', 'kidult-100']);
  });

  it('creates deterministic rollback events', () => {
    const input = {
      vertical: 'kidults' as const,
      productId: 'kidult-100',
      publicationId: 'publication-1',
      originalChecksum: 'abc123',
      reason: 'quality regression',
      requestedAt: '2026-07-30T01:00:00Z',
    };
    expect(createRollbackEvent(input)).toEqual(createRollbackEvent(input));
    expect(createRollbackEvent(input).state).toBe('rolled_back');
  });
});
