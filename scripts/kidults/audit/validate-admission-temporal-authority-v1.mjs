import crypto from 'node:crypto';
import { parseRfc3339Millis } from './rfc3339-v1.mjs';

const TRUSTED_SOURCE = 'CONTROL_PLANE';
const PASS = 'TEMPORAL_RIGHTS_VALID';
const REVALIDATE = 'REVALIDATE_RIGHTS_AT_TRUSTED_ADMISSION_TIME';

const stable = value => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
};
const sha256 = value => crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');

function digestRightsDecision(decision) {
  const body = structuredClone(decision);
  delete body.decision_digest;
  return sha256(body);
}

function digestTemporalCheckpoint(checkpoint) {
  const body = structuredClone(checkpoint);
  delete body.checkpoint_digest;
  return sha256(body);
}

function sourceIdentity(record = {}) {
  const identity = record.identity || {};
  return {
    source_record_id: identity.source_record_id,
    source_owner_id: identity.source_owner_id,
    source_namespace: identity.source_namespace
  };
}

function buildRightsDecision(record, { epoch = 1, policy_version = 'RIGHTS_PURPOSE_POLICY_V1' } = {}) {
  const rights = record.rights || {};
  const decision = {
    trusted_source: TRUSTED_SOURCE,
    epoch,
    policy_version,
    source_identity_digest: sha256(sourceIdentity(record)),
    source_record_id: record?.identity?.source_record_id,
    source_owner_id: record?.identity?.source_owner_id,
    source_namespace: record?.identity?.source_namespace,
    rights_present: rights.present,
    rights_status: rights.status,
    collect: rights.collect,
    store: rights.store,
    derive: rights.derive,
    expires_at: rights.expires_at
  };
  decision.decision_digest = digestRightsDecision(decision);
  return decision;
}

function buildTemporalCheckpoint(record, rightsDecision, checkpointTime, { epoch = 1 } = {}) {
  const checkpoint = {
    trusted_source: TRUSTED_SOURCE,
    epoch,
    checkpoint_time: checkpointTime,
    source_record_id: record?.identity?.source_record_id,
    source_owner_id: record?.identity?.source_owner_id,
    source_namespace: record?.identity?.source_namespace,
    source_identity_digest: sha256(sourceIdentity(record)),
    rights_decision_digest: rightsDecision.decision_digest,
    rights_decision_epoch: rightsDecision.epoch,
    rights_policy_version: rightsDecision.policy_version
  };
  checkpoint.checkpoint_digest = digestTemporalCheckpoint(checkpoint);
  return checkpoint;
}

function evaluateAdmissionTemporalAuthority(record = {}, trustedContext = {}) {
  const failures = [];
  const rights = record.rights || {};
  const decision = trustedContext.trusted_rights_decision;
  const checkpoint = trustedContext.trusted_admission_temporal_checkpoint;
  const minimumRightsEpoch = trustedContext.minimum_rights_decision_epoch;
  const minimumCheckpointEpoch = trustedContext.minimum_temporal_checkpoint_epoch;
  const identity = sourceIdentity(record);
  const identityDigest = sha256(identity);

  if (!identity.source_record_id || !identity.source_owner_id || !identity.source_namespace) {
    failures.push('source_identity_incomplete');
  }

  if (!decision || typeof decision !== 'object') {
    failures.push('trusted_rights_decision_missing');
  } else {
    if (decision.trusted_source !== TRUSTED_SOURCE) failures.push('rights_decision_untrusted_source');
    if (!Number.isInteger(decision.epoch) || decision.epoch < 1) failures.push('rights_decision_epoch_invalid');
    if (Number.isInteger(minimumRightsEpoch) && decision.epoch < minimumRightsEpoch) failures.push('rights_decision_stale_epoch');
    if (!decision.policy_version || typeof decision.policy_version !== 'string') failures.push('rights_decision_policy_version_missing');
    if (decision.decision_digest !== digestRightsDecision(decision)) failures.push('rights_decision_digest_mismatch');
    if (decision.source_identity_digest !== identityDigest) failures.push('rights_decision_identity_digest_mismatch');
    if (decision.source_record_id !== identity.source_record_id) failures.push('rights_decision_record_rebinding');
    if (decision.source_owner_id !== identity.source_owner_id) failures.push('rights_decision_owner_rebinding');
    if (decision.source_namespace !== identity.source_namespace) failures.push('rights_decision_namespace_rebinding');

    const expectedRights = {
      rights_present: rights.present,
      rights_status: rights.status,
      collect: rights.collect,
      store: rights.store,
      derive: rights.derive,
      expires_at: rights.expires_at
    };
    for (const [field, expected] of Object.entries(expectedRights)) {
      if (decision[field] !== expected) failures.push(`rights_decision_${field}_mismatch`);
    }
  }

  let checkpointMs = null;
  if (!checkpoint || typeof checkpoint !== 'object') {
    failures.push('trusted_admission_temporal_checkpoint_missing');
  } else {
    if (checkpoint.trusted_source !== TRUSTED_SOURCE) failures.push('temporal_checkpoint_untrusted_source');
    if (!Number.isInteger(checkpoint.epoch) || checkpoint.epoch < 1) failures.push('temporal_checkpoint_epoch_invalid');
    if (Number.isInteger(minimumCheckpointEpoch) && checkpoint.epoch < minimumCheckpointEpoch) failures.push('temporal_checkpoint_stale_epoch');
    if (checkpoint.checkpoint_digest !== digestTemporalCheckpoint(checkpoint)) failures.push('temporal_checkpoint_digest_mismatch');
    if (checkpoint.source_identity_digest !== identityDigest) failures.push('temporal_checkpoint_identity_digest_mismatch');
    if (checkpoint.source_record_id !== identity.source_record_id) failures.push('temporal_checkpoint_record_rebinding');
    if (checkpoint.source_owner_id !== identity.source_owner_id) failures.push('temporal_checkpoint_owner_rebinding');
    if (checkpoint.source_namespace !== identity.source_namespace) failures.push('temporal_checkpoint_namespace_rebinding');
    if (decision && typeof decision === 'object') {
      if (checkpoint.rights_decision_digest !== decision.decision_digest) failures.push('temporal_checkpoint_rights_decision_digest_mismatch');
      if (checkpoint.rights_decision_epoch !== decision.epoch) failures.push('temporal_checkpoint_rights_decision_epoch_mismatch');
      if (checkpoint.rights_policy_version !== decision.policy_version) failures.push('temporal_checkpoint_rights_policy_version_mismatch');
    }
    try {
      checkpointMs = parseRfc3339Millis(checkpoint.checkpoint_time, 'trusted_admission_temporal_checkpoint.checkpoint_time');
    } catch (error) {
      failures.push(`temporal_checkpoint_time_invalid:${error.message}`);
    }
  }

  let sourceAsOfMs = null;
  try {
    sourceAsOfMs = parseRfc3339Millis(record.as_of, 'record.as_of');
  } catch (error) {
    failures.push(`source_as_of_invalid:${error.message}`);
  }
  if (checkpointMs !== null && sourceAsOfMs !== null && sourceAsOfMs > checkpointMs) {
    failures.push('source_as_of_future_relative_to_trusted_checkpoint');
  }

  if (rights.present !== true) failures.push('current_rights_not_present');
  if (rights.status !== 'PASS') failures.push('current_rights_not_pass');
  for (const field of ['collect', 'store', 'derive']) {
    if (rights[field] !== 'ALLOW') failures.push(`current_rights_${field}_not_allow`);
  }

  if (rights.expires_at === null || rights.expires_at === undefined) {
    failures.push('current_pass_rights_expiry_missing');
  } else {
    try {
      const expiresMs = parseRfc3339Millis(rights.expires_at, 'rights.expires_at');
      if (checkpointMs !== null && expiresMs <= checkpointMs) failures.push('current_rights_expired_at_trusted_checkpoint');
    } catch (error) {
      failures.push(`rights_expiry_invalid:${error.message}`);
    }
  }

  return failures.length
    ? { disposition: REVALIDATE, failures: [...new Set(failures)] }
    : { disposition: PASS, failures: [] };
}

const record = {
  identity: {
    source_record_id: 'record-1057-a',
    source_owner_id: 'owner-1057',
    source_namespace: 'partner-1057'
  },
  as_of: '2026-08-22T07:45:00Z',
  rights: {
    present: true,
    status: 'PASS',
    collect: 'ALLOW',
    store: 'ALLOW',
    derive: 'ALLOW',
    expires_at: '2026-08-22T09:00:00Z'
  }
};

const decision = buildRightsDecision(record, { epoch: 7 });
const checkpoint = buildTemporalCheckpoint(record, decision, '2026-08-22T08:00:00Z', { epoch: 11 });
const validContext = {
  trusted_rights_decision: decision,
  trusted_admission_temporal_checkpoint: checkpoint,
  minimum_rights_decision_epoch: 7,
  minimum_temporal_checkpoint_epoch: 11
};

const accepted = evaluateAdmissionTemporalAuthority(record, validContext);
if (accepted.disposition !== PASS) throw new Error(`trusted admission temporal authority positive case failed: ${JSON.stringify(accepted)}`);

const mutations = [
  ['backdated_payload_after_real_expiry', seed => {
    seed.record.as_of = '2026-08-21T00:00:00Z';
    seed.record.rights.expires_at = '2026-08-22T08:30:00Z';
    seed.context.trusted_rights_decision = buildRightsDecision(seed.record, { epoch: 8 });
    seed.context.trusted_admission_temporal_checkpoint = buildTemporalCheckpoint(seed.record, seed.context.trusted_rights_decision, '2026-08-22T08:45:00Z', { epoch: 12 });
    seed.context.minimum_rights_decision_epoch = 8;
    seed.context.minimum_temporal_checkpoint_epoch = 12;
    return seed;
  }, 'current_rights_expired_at_trusted_checkpoint'],
  ['same_digest_replay_after_expiry', seed => {
    seed.context.trusted_admission_temporal_checkpoint = buildTemporalCheckpoint(seed.record, seed.context.trusted_rights_decision, '2026-08-22T09:30:00Z', { epoch: 12 });
    seed.context.minimum_temporal_checkpoint_epoch = 12;
    return seed;
  }, 'current_rights_expired_at_trusted_checkpoint'],
  ['missing_checkpoint', seed => { delete seed.context.trusted_admission_temporal_checkpoint; return seed; }, 'trusted_admission_temporal_checkpoint_missing'],
  ['checkpoint_untrusted_source', seed => {
    seed.context.trusted_admission_temporal_checkpoint.trusted_source = 'PARTNER_PAYLOAD';
    seed.context.trusted_admission_temporal_checkpoint.checkpoint_digest = digestTemporalCheckpoint(seed.context.trusted_admission_temporal_checkpoint);
    return seed;
  }, 'temporal_checkpoint_untrusted_source'],
  ['checkpoint_digest_tamper', seed => { seed.context.trusted_admission_temporal_checkpoint.checkpoint_digest = 'forged'; return seed; }, 'temporal_checkpoint_digest_mismatch'],
  ['source_record_rebinding', seed => {
    seed.context.trusted_admission_temporal_checkpoint.source_record_id = 'record-other';
    seed.context.trusted_admission_temporal_checkpoint.checkpoint_digest = digestTemporalCheckpoint(seed.context.trusted_admission_temporal_checkpoint);
    return seed;
  }, 'temporal_checkpoint_record_rebinding'],
  ['malformed_checkpoint_time', seed => {
    seed.context.trusted_admission_temporal_checkpoint.checkpoint_time = '2026-08-22 08:00:00';
    seed.context.trusted_admission_temporal_checkpoint.checkpoint_digest = digestTemporalCheckpoint(seed.context.trusted_admission_temporal_checkpoint);
    return seed;
  }, 'temporal_checkpoint_time_invalid'],
  ['future_payload_as_of', seed => { seed.record.as_of = '2026-08-22T08:30:00Z'; return seed; }, 'source_as_of_future_relative_to_trusted_checkpoint'],
  ['missing_rights_decision', seed => { delete seed.context.trusted_rights_decision; return seed; }, 'trusted_rights_decision_missing'],
  ['rights_decision_untrusted_source', seed => {
    seed.context.trusted_rights_decision.trusted_source = 'PARTNER_PAYLOAD';
    seed.context.trusted_rights_decision.decision_digest = digestRightsDecision(seed.context.trusted_rights_decision);
    return seed;
  }, 'rights_decision_untrusted_source'],
  ['rights_decision_digest_tamper', seed => { seed.context.trusted_rights_decision.decision_digest = 'forged'; return seed; }, 'rights_decision_digest_mismatch'],
  ['rights_decision_record_rebinding', seed => {
    seed.context.trusted_rights_decision.source_record_id = 'record-other';
    seed.context.trusted_rights_decision.decision_digest = digestRightsDecision(seed.context.trusted_rights_decision);
    return seed;
  }, 'rights_decision_record_rebinding'],
  ['stale_rights_epoch', seed => { seed.context.minimum_rights_decision_epoch = 8; return seed; }, 'rights_decision_stale_epoch'],
  ['stale_checkpoint_epoch', seed => { seed.context.minimum_temporal_checkpoint_epoch = 12; return seed; }, 'temporal_checkpoint_stale_epoch'],
  ['conditional_collect', seed => {
    seed.record.rights.collect = 'CONDITIONAL';
    seed.context.trusted_rights_decision = buildRightsDecision(seed.record, { epoch: 8 });
    seed.context.trusted_admission_temporal_checkpoint = buildTemporalCheckpoint(seed.record, seed.context.trusted_rights_decision, '2026-08-22T08:00:00Z', { epoch: 12 });
    seed.context.minimum_rights_decision_epoch = 8;
    seed.context.minimum_temporal_checkpoint_epoch = 12;
    return seed;
  }, 'current_rights_collect_not_allow']
];

for (const [id, mutate, expectedFailurePrefix] of mutations) {
  const seed = {
    record: structuredClone(record),
    context: {
      trusted_rights_decision: structuredClone(decision),
      trusted_admission_temporal_checkpoint: structuredClone(checkpoint),
      minimum_rights_decision_epoch: 7,
      minimum_temporal_checkpoint_epoch: 11
    }
  };
  const candidate = mutate(seed);
  const result = evaluateAdmissionTemporalAuthority(candidate.record, candidate.context);
  if (result.disposition !== REVALIDATE) throw new Error(`temporal-authority mutation ${id} failed open: ${JSON.stringify(result)}`);
  if (!result.failures.some(item => item.startsWith(expectedFailurePrefix))) {
    throw new Error(`temporal-authority mutation ${id} missed expected failure ${expectedFailurePrefix}: ${JSON.stringify(result)}`);
  }
}

console.log(JSON.stringify({
  suite: 'PRE_PARTNER_ADMISSION_TEMPORAL_AUTHORITY_V1',
  governing_issue: 1057,
  control_family: 'RIGHTS_PURPOSE_SEGREGATION_X_REPLAY_RECOVERY_ROLLBACK_X_PROVENANCE',
  trusted_source: TRUSTED_SOURCE,
  source_event_time_not_authoritative_for_rights_validity: true,
  trusted_admission_checkpoint_digest_bound: true,
  rights_decision_digest_bound: true,
  source_identity_bound: true,
  replay_revalidates_against_new_trusted_checkpoint: true,
  future_payload_as_of_rejected: true,
  current_pass_rights_require_exact_allow: true,
  fail_closed_mutation_cases: mutations.length,
  empirical_gate_effect: 'NONE',
  external_partner_data_ingestion: 'HOLD',
  production: 'HOLD',
  public: 'HOLD',
  g5: 'EXPLICIT_APPROVAL_REQUIRED'
}, null, 2));
