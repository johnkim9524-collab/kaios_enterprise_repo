export type SourceFamily = 'marketplace' | 'auction' | 'brand_direct' | 'editorial' | 'cultural_signal';

export type NormalizedEvidence = {
  source: { name: string; family: SourceFamily; region?: string; baseUrl?: string; trustTier: 'A'|'B'|'C'|'D' };
  entity: { type: string; name: string; category: string; externalKeys?: Record<string,string> };
  evidence: { externalId?: string; observedAt: string; provenanceUrl?: string; provenanceLabel?: string; licenseCode?: string; grade: 'A'|'B'|'C'|'D'; confidence: number; raw: unknown };
  metrics: Array<{ key: string; value: number; unit?: string; confidence?: number }>;
};

export interface SourceAdapter {
  id: string;
  family: SourceFamily;
  collect(signal?: AbortSignal): Promise<unknown[]>;
  normalize(raw: unknown): Promise<NormalizedEvidence[]>;
}

export const SOURCE_FAMILY_POLICY: Record<SourceFamily,{defaultTrust:'A'|'B'|'C'|'D'; freshnessHours:number}> = {
  marketplace: { defaultTrust: 'B', freshnessHours: 24 },
  auction: { defaultTrust: 'A', freshnessHours: 72 },
  brand_direct: { defaultTrust: 'A', freshnessHours: 168 },
  editorial: { defaultTrust: 'B', freshnessHours: 72 },
  cultural_signal: { defaultTrust: 'C', freshnessHours: 24 },
};

export function validateNormalizedEvidence(item: NormalizedEvidence) {
  if (!item.source?.name || !item.source?.family) throw new Error('adapter source identity is required');
  if (!item.entity?.name || !item.entity?.category) throw new Error('adapter entity identity is required');
  if (!item.evidence?.observedAt || !Number.isFinite(Date.parse(item.evidence.observedAt))) throw new Error('adapter observedAt is invalid');
  if (!item.evidence.provenanceUrl && !item.evidence.provenanceLabel) throw new Error('provenance is required');
  if (!Array.isArray(item.metrics) || !item.metrics.length) throw new Error('adapter metrics are required');
  for (const metric of item.metrics) if (!metric.key || !Number.isFinite(metric.value)) throw new Error('adapter metric is invalid');
  return item;
}
