import fs from 'node:fs';

const contract = JSON.parse(fs.readFileSync('coordination/kidults/audit/unified-audit-control-plane-v1.json', 'utf8'));
const pack = JSON.parse(fs.readFileSync('coordination/kidults/audit/pre-partner-adversarial-fixtures-v2.json', 'utf8'));

const ALLOWED_CURRENCIES = new Set(['USD','EUR','GBP','JPY','KRW','CHF','HKD','SGD','AUD','CAD']);
const ALLOWED_UNITS = new Set(['ITEM','LOT']);

const fail = message => {
  console.error(`FAIL #881 adversarial fixture semantic binding: ${message}`);
  process.exit(1);
};

const profile = {
  schema_drift: {
    disposition: 'QUARANTINED_OR_REJECTED',
    required_trigger: 'schema_integrity',
    matches: r => r?.schema?.received_version !== r?.schema?.expected_version || r?.schema?.required_fields_present !== true,
    neutralize: r => {
      r.schema.received_version = r.schema.expected_version;
      r.schema.required_fields_present = true;
    }
  },
  wrong_currency_unit: {
    disposition: 'QUARANTINED_OR_REJECTED',
    required_trigger: 'semantic_integrity',
    matches: r => !ALLOWED_CURRENCIES.has(r?.semantics?.currency) || !ALLOWED_UNITS.has(r?.semantics?.unit),
    neutralize: r => {
      r.semantics.currency = 'USD';
      r.semantics.unit = 'ITEM';
    }
  },
  duplicate_relisted: {
    disposition: 'QUARANTINED_OR_REJECTED',
    required_trigger: 'identity_resolution',
    matches: r => Boolean(r?.identity?.duplicate_of || r?.identity?.relisted_from || r?.semantics?.sale_status === 'RELISTED'),
    neutralize: r => {
      r.identity.duplicate_of = null;
      r.identity.relisted_from = null;
      r.semantics.sale_status = 'SOLD';
    }
  },
  contradictory_sources: {
    disposition: 'QUARANTINED_OR_REJECTED',
    required_trigger: 'identity_resolution',
    matches: r => r?.identity?.contradiction === true,
    neutralize: r => { r.identity.contradiction = false; }
  },
  missing_rights: {
    disposition: 'REJECTED',
    required_trigger: 'rights_missing',
    matches: r => r?.rights?.present !== true,
    neutralize: r => {
      r.rights.present = true;
      r.rights.status = 'PASS';
      r.rights.expires_at = '2099-01-01T00:00:00Z';
    }
  },
  expired_rights: {
    disposition: 'REJECTED',
    required_trigger: 'rights_expired',
    matches: r => {
      const expires = Date.parse(r?.rights?.expires_at);
      const asOf = Date.parse(r?.as_of);
      return Number.isFinite(expires) && Number.isFinite(asOf) && expires <= asOf;
    },
    neutralize: r => { r.rights.expires_at = '2099-01-01T00:00:00Z'; }
  },
  deletion_request: {
    disposition: 'WITHDRAWN_OR_DELETED',
    required_trigger: 'deletion_requested',
    matches: r => r?.lifecycle?.deletion_requested === true && ['DELETE','WITHDRAW'].includes(r?.lifecycle?.control_event?.action),
    neutralize: r => { r.lifecycle.deletion_requested = false; }
  },
  poisoned_outlier: {
    disposition: 'QUARANTINED_OR_REJECTED',
    required_trigger: 'quality_anomaly',
    matches: r => r?.quality?.outlier === true || r?.quality?.impossible_value === true,
    neutralize: r => {
      r.quality.outlier = false;
      r.quality.impossible_value = false;
    }
  },
  partial_truncated_batch: {
    disposition: 'QUARANTINED_OR_REJECTED',
    required_trigger: 'batch_incomplete',
    matches: r => r?.quality?.batch_complete !== true || r?.quality?.batch_expected_count !== r?.quality?.batch_received_count,
    neutralize: r => {
      r.quality.batch_received_count = r.quality.batch_expected_count;
      r.quality.batch_complete = true;
    }
  },
  source_outage_rate_limit: {
    disposition: 'NO_PROMOTION_RETRY_OR_DLQ',
    required_trigger: 'transport_429',
    matches: r => r?.transport?.http_status === 429 || r?.transport?.http_status >= 500 || r?.transport?.retries_exhausted === true,
    neutralize: r => {
      r.transport.http_status = 200;
      r.transport.retries_exhausted = false;
    }
  },
  replay_recovery: {
    disposition: 'IDEMPOTENT_REPLAY_WITH_AUDIT_TRACE',
    required_trigger: 'replay',
    matches: r => r?.replay?.is_replay === true && r?.replay?.same_digest === true && r?.replay?.idempotency_key_match === true,
    neutralize: r => { r.replay.is_replay = false; }
  },
  provider_substitution: {
    disposition: 'REVALIDATE_RIGHTS_SCHEMA_IDENTITY_LINEAGE',
    required_trigger: 'provider_substitution',
    matches: r => r?.provider?.substitution === true && !(
      r?.provider?.adapter_validated === true &&
      r?.provider?.rights_revalidated === true &&
      r?.provider?.identity_revalidated === true &&
      r?.provider?.lineage_revalidated === true
    ),
    neutralize: r => { r.provider.substitution = false; }
  }
};

if (pack.governing_issue !== 881 || contract.governing_issue !== 881) fail('control inputs must remain governed by #881');
if (pack.fixture_type !== 'SYNTHETIC_NON_PROMOTABLE_CONTROL' || pack.empirical_gate_effect !== 'NONE') fail('fixture truth boundary drift');

const fixtures = new Map((pack.fixtures || []).map(item => [item.id, item]));
const contractFixtures = new Map((contract.adversarial_fixtures || []).map(item => [item.id, item.expected_disposition]));
const expectedIds = Object.keys(profile);
if (fixtures.size !== expectedIds.length || contractFixtures.size !== expectedIds.length) fail('fixture cardinality drift');
if (new Set((pack.fixtures || []).map(item => item.id)).size !== (pack.fixtures || []).length) fail('duplicate fixture id');

let bindingChecks = 0;
let neutralizationMutationCases = 0;
for (const id of expectedIds) {
  const fixture = fixtures.get(id);
  const spec = profile[id];
  if (!fixture) fail(`missing fixture ${id}`);
  if (!contractFixtures.has(id)) fail(`missing contract fixture ${id}`);
  if (fixture.synthetic !== true || fixture.promotable !== false) fail(`${id} must remain synthetic and non-promotable`);
  if (fixture.expected_disposition !== spec.disposition) fail(`${id} pack disposition rebound`);
  if (contractFixtures.get(id) !== spec.disposition) fail(`${id} contract disposition rebound`);
  if (!spec.matches(fixture.record)) fail(`${id} no longer exercises its declared attack semantics`);
  bindingChecks += 1;

  const neutralized = structuredClone(fixture.record);
  spec.neutralize(neutralized);
  if (spec.matches(neutralized)) fail(`${id} neutralization mutation was not detected`);
  neutralizationMutationCases += 1;
}

// Same-disposition swaps are especially dangerous because a disposition-only harness can remain green.
// Prove the semantic binding rejects a fixture ID whose payload is replaced with another attack that has
// the same expected disposition.
const sameDispositionIds = [
  'schema_drift',
  'wrong_currency_unit',
  'duplicate_relisted',
  'contradictory_sources',
  'poisoned_outlier',
  'partial_truncated_batch'
];
let sameDispositionSwapMutations = 0;
for (let index = 0; index < sameDispositionIds.length; index += 1) {
  const targetId = sameDispositionIds[index];
  const donorId = sameDispositionIds[(index + 1) % sameDispositionIds.length];
  const targetSpec = profile[targetId];
  const donor = fixtures.get(donorId);
  if (targetSpec.matches(structuredClone(donor.record))) {
    fail(`same-disposition swap ${donorId} -> ${targetId} escaped semantic binding`);
  }
  sameDispositionSwapMutations += 1;
}

for (const id of fixtures.keys()) {
  if (!profile[id]) fail(`unexpected unbound fixture ${id}`);
}

console.log(JSON.stringify({
  suite: 'KIDULTS_PRE_PARTNER_ADVERSARIAL_FIXTURE_SEMANTIC_BINDING_V1',
  result: 'PASS',
  governing_issue: 881,
  fixtures_semantically_bound: bindingChecks,
  neutralization_mutation_cases_rejected: neutralizationMutationCases,
  same_disposition_swap_mutation_cases_rejected: sameDispositionSwapMutations,
  id_to_attack_semantics_bound: true,
  required_trigger_contract: Object.fromEntries(expectedIds.map(id => [id, profile[id].required_trigger])),
  fixture_type: 'SYNTHETIC_NON_PROMOTABLE_CONTROL',
  empirical_gate_effect: 'NONE',
  external_partner_data_ingestion: 'HOLD',
  production: 'HOLD',
  public: 'HOLD',
  g5: 'EXPLICIT_APPROVAL_REQUIRED'
}, null, 2));
