import type { NormalizedEvidence } from './adapters';

const rows = [
  ['Character Goods', 92, 91, 86, 0.04],
  ['Trading Cards', 89, 88, 82, 0.06],
  ['Art Toys', 85, 79, 84, 0.05],
] as const;

export function goldenPathTransactions(): { items: NormalizedEvidence[]; governance: Record<string, unknown> } {
  const observedAt = new Date().toISOString();
  const items = rows.map(([category, confidence, depth, integrity, anomaly]) => ({
    source: { id: 'staging-golden-path', name: 'Kidults Staging Transactions', family: 'marketplace' as const, region: 'Global', baseUrl: 'internal://kidults/golden-path/transactions', trustTier: 'D' as const },
    entity: { type: 'category', name: category, category, externalKeys: { legacySourceId: 'transactions-primary', mode: 'illustrative' } },
    evidence: { admissionId: 'admission-staging-golden-path-v1', admissionInputSnapshotRef: 'sha256:5f8b182ad788512ec5283b03f0513ffb596f1b27e37c9ace0774e12f645bfbb6', externalId: `illustrative-${category.toLowerCase().replaceAll(' ', '-')}-transactions`, observedAt, provenanceLabel: 'Kidults staging evidence — illustrative only', licenseCode: 'STAGING-NONCOMMERCIAL', grade: 'D' as const, confidence, raw: { source: 'golden-path', transactionDepth: depth, priceIntegrity: integrity, anomalyRate: anomaly } },
    metrics: [
      { key: 'transaction_depth', value: depth, unit: 'index', confidence },
      { key: 'price_integrity', value: integrity, unit: 'index', confidence },
      { key: 'anomaly_rate', value: anomaly, unit: 'ratio', confidence },
    ],
  }));
  return { items, governance: { mode: 'illustrative', environment: 'staging', commercialUse: false, productionEligible: false, originalFamily: 'market-transactions', canonicalFamily: 'marketplace', sourceId: 'transactions-primary', purpose: 'Autonomous Intelligence Golden Path validation only' } };
}
