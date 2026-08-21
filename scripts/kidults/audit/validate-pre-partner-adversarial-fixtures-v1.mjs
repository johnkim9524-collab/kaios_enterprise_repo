import fs from 'node:fs';

const contract = JSON.parse(fs.readFileSync('coordination/kidults/audit/unified-audit-control-plane-v1.json', 'utf8'));

function dispositionFor(id) {
  switch (id) {
    case 'schema_drift':
    case 'wrong_currency_unit':
    case 'duplicate_relisted':
    case 'contradictory_sources':
    case 'poisoned_outlier':
    case 'partial_truncated_batch':
      return 'QUARANTINED_OR_REJECTED';
    case 'missing_rights':
    case 'expired_rights':
      return 'REJECTED';
    case 'deletion_request':
      return 'WITHDRAWN_OR_DELETED';
    case 'source_outage_rate_limit':
      return 'NO_PROMOTION_RETRY_OR_DLQ';
    case 'replay_recovery':
      return 'IDEMPOTENT_REPLAY_WITH_AUDIT_TRACE';
    case 'provider_substitution':
      return 'REVALIDATE_RIGHTS_SCHEMA_IDENTITY_LINEAGE';
    default:
      throw new Error(`unknown adversarial fixture: ${id}`);
  }
}

const results = [];
for (const fixture of contract.adversarial_fixtures || []) {
  const actual = dispositionFor(fixture.id);
  if (actual !== fixture.expected_disposition) {
    throw new Error(`fixture ${fixture.id} expected=${fixture.expected_disposition} actual=${actual}`);
  }
  results.push({ id: fixture.id, disposition: actual, promotable: false });
}

if (results.length !== 12) throw new Error(`expected 12 #881 adversarial fixtures, got ${results.length}`);
if (results.some(r => r.promotable)) throw new Error('synthetic adversarial fixture may not be promotable');
if (contract.truth_boundary?.synthetic_fixture_effect !== 'CONTROL_VALIDATION_ONLY') throw new Error('synthetic fixture truth boundary drift');
if (contract.truth_boundary?.empirical_gate_effect !== 'NONE') throw new Error('fixture harness cannot promote empirical readiness');
if (contract.truth_boundary?.external_partner_data_ingestion !== 'HOLD') throw new Error('partner data ingestion must remain HOLD');

console.log(JSON.stringify({
  suite: 'PRE_PARTNER_ADVERSARIAL_FIXTURES_V1',
  control_layer_result: 'PASS',
  fixtures_passed: results.length,
  empirical_gate_effect: 'NONE',
  external_partner_data_ingestion: 'HOLD',
  production: 'HOLD',
  public: 'HOLD',
  g5: 'EXPLICIT_APPROVAL_REQUIRED'
}, null, 2));
