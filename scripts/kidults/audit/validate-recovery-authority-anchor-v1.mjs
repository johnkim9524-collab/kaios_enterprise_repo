import crypto from 'node:crypto';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const AUTHORITY_SOURCE = 'RECOVERY_AUTHORITY_REGISTRY';
const AUTHORITY_RECORD_ID = 'kidults-recovery-authority-v1';
const TRUSTED_NOW = '2026-08-22T10:35:00Z';

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  }
  return value;
}

function canonical(value) {
  return JSON.stringify(stable(value));
}

function sha256(value) {
  const input = typeof value === 'string' ? value : canonical(value);
  return crypto.createHash('sha256').update(input).digest('hex');
}

function publicKeyId(publicKey) {
  const der = publicKey.export({ type: 'spki', format: 'der' });
  return `ed25519:${crypto.createHash('sha256').update(der).digest('hex')}`;
}

function digestWithout(value, field) {
  const body = structuredClone(value);
  delete body[field];
  return sha256(body);
}

function makeLedger({
  ledgerId = 'kidults-destructive-ledger-v1',
  recoveryDomainId = 'kidults-prepartner-intake',
  recoveryEpoch = 7
} = {}) {
  return {
    synthetic: true,
    promotable: false,
    empirical_gate_effect: 'NONE',
    ledger_id: ledgerId,
    recovery_domain_id: recoveryDomainId,
    recovery_epoch: recoveryEpoch,
    events: []
  };
}

function appendEvent(ledger, action = 'RECOVERY_CHECKPOINT') {
  const previous = ledger.events.at(-1)?.event_digest || 'GENESIS';
  const event = {
    sequence_number: ledger.events.length + 1,
    previous_event_digest: previous,
    action,
    event_time: '2026-08-22T10:30:00Z'
  };
  event.event_digest = digestWithout(event, 'event_digest');
  ledger.events.push(event);
  return event;
}

function eventDigestAtSequence(ledger, sequence) {
  assert(Number.isInteger(sequence) && sequence >= 0, 'capture sequence invalid');
  assert(sequence <= ledger.events.length, 'capture sequence exceeds ledger');
  return sequence === 0 ? 'GENESIS' : ledger.events[sequence - 1].event_digest;
}

function validateLedger(ledger) {
  assert(ledger?.synthetic === true, 'ledger must be synthetic');
  assert(ledger?.promotable === false, 'ledger must be non-promotable');
  assert(ledger?.empirical_gate_effect === 'NONE', 'ledger empirical effect must be NONE');
  assert(typeof ledger.ledger_id === 'string' && ledger.ledger_id.length > 0, 'ledger id required');
  assert(typeof ledger.recovery_domain_id === 'string' && ledger.recovery_domain_id.length > 0, 'recovery domain required');
  assert(Number.isInteger(ledger.recovery_epoch) && ledger.recovery_epoch >= 0, 'recovery epoch invalid');
  assert(Array.isArray(ledger.events), 'ledger events required');
  let previous = 'GENESIS';
  for (let index = 0; index < ledger.events.length; index += 1) {
    const event = ledger.events[index];
    assert(event.sequence_number === index + 1, 'ledger sequence gap');
    assert(event.previous_event_digest === previous, 'ledger previous digest mismatch');
    assert(event.event_digest === digestWithout(event, 'event_digest'), 'ledger event digest mismatch');
    previous = event.event_digest;
  }
}

function makeCheckpoint(ledger, sequence = ledger.events.length) {
  validateLedger(ledger);
  const checkpoint = {
    checkpoint_source: 'CONTROL_PLANE',
    ledger_id: ledger.ledger_id,
    recovery_domain_id: ledger.recovery_domain_id,
    recovery_epoch: ledger.recovery_epoch,
    capture_sequence: sequence,
    captured_prefix_digest: eventDigestAtSequence(ledger, sequence)
  };
  checkpoint.checkpoint_digest = digestWithout(checkpoint, 'checkpoint_digest');
  return checkpoint;
}

function makeSnapshot(checkpoint, objectStates = { 'claim-1': 'ACTIVE' }) {
  const snapshot = {
    synthetic: true,
    promotable: false,
    empirical_gate_effect: 'NONE',
    recovery_checkpoint: structuredClone(checkpoint),
    object_states: structuredClone(objectStates)
  };
  snapshot.snapshot_digest = digestWithout(snapshot, 'snapshot_digest');
  return snapshot;
}

function anchorPayload(snapshot, { issuedAt = '2026-08-22T10:31:00Z', validUntil = '2026-08-23T10:31:00Z' } = {}) {
  const checkpoint = snapshot.recovery_checkpoint;
  return {
    authority_source: AUTHORITY_SOURCE,
    authority_record_id: AUTHORITY_RECORD_ID,
    ledger_id: checkpoint.ledger_id,
    recovery_domain_id: checkpoint.recovery_domain_id,
    recovery_epoch: checkpoint.recovery_epoch,
    capture_sequence: checkpoint.capture_sequence,
    captured_prefix_digest: checkpoint.captured_prefix_digest,
    checkpoint_digest: checkpoint.checkpoint_digest,
    snapshot_digest: snapshot.snapshot_digest,
    issued_at: issuedAt,
    valid_until: validUntil
  };
}

function signAnchor(snapshot, privateKey, trustedPublicKey, options = {}) {
  const payload = anchorPayload(snapshot, options);
  const anchor = {
    ...payload,
    authority_key_id: publicKeyId(trustedPublicKey)
  };
  anchor.signature = crypto.sign(null, Buffer.from(canonical(anchor)), privateKey).toString('base64');
  return anchor;
}

function verifyAnchorSignature(anchor, trustedPublicKey) {
  assert(anchor && typeof anchor === 'object', 'independent recovery authority anchor required');
  assert(typeof anchor.signature === 'string' && anchor.signature.length > 0, 'recovery authority signature required');
  const signed = structuredClone(anchor);
  const signature = Buffer.from(signed.signature, 'base64');
  delete signed.signature;
  assert(anchor.authority_key_id === publicKeyId(trustedPublicKey), 'recovery authority key id mismatch');
  assert(crypto.verify(null, Buffer.from(canonical(signed)), trustedPublicKey, signature), 'recovery authority signature invalid');
}

function validateRecovery(snapshot, ledger, anchor, trustedPublicKey, trustedNow = TRUSTED_NOW) {
  validateLedger(ledger);
  assert(snapshot?.synthetic === true, 'snapshot must be synthetic');
  assert(snapshot?.promotable === false, 'snapshot must be non-promotable');
  assert(snapshot?.empirical_gate_effect === 'NONE', 'snapshot empirical effect must be NONE');
  assert(snapshot.snapshot_digest === digestWithout(snapshot, 'snapshot_digest'), 'snapshot digest mismatch');

  const checkpoint = snapshot.recovery_checkpoint;
  assert(checkpoint && typeof checkpoint === 'object', 'snapshot recovery checkpoint required');
  assert(checkpoint.checkpoint_source === 'CONTROL_PLANE', 'snapshot checkpoint source invalid');
  assert(checkpoint.checkpoint_digest === digestWithout(checkpoint, 'checkpoint_digest'), 'snapshot checkpoint digest mismatch');

  // Authority must be supplied separately from the snapshot/ledger backup set and must
  // verify against a trusted public key whose private key is outside those stores.
  verifyAnchorSignature(anchor, trustedPublicKey);
  assert(anchor.authority_source === AUTHORITY_SOURCE, 'recovery authority source invalid');
  assert(anchor.authority_record_id === AUTHORITY_RECORD_ID, 'recovery authority record id invalid');

  const nowMs = Date.parse(trustedNow);
  const issuedMs = Date.parse(anchor.issued_at);
  const validUntilMs = Date.parse(anchor.valid_until);
  assert(Number.isFinite(nowMs) && Number.isFinite(issuedMs) && Number.isFinite(validUntilMs), 'recovery authority time invalid');
  assert(issuedMs <= nowMs, 'recovery authority anchor issued in the future');
  assert(validUntilMs > nowMs, 'recovery authority anchor stale');

  assert(anchor.ledger_id === checkpoint.ledger_id, 'anchor/checkpoint ledger id mismatch');
  assert(anchor.recovery_domain_id === checkpoint.recovery_domain_id, 'anchor/checkpoint recovery domain mismatch');
  assert(anchor.recovery_epoch === checkpoint.recovery_epoch, 'anchor/checkpoint recovery epoch mismatch');
  assert(anchor.capture_sequence === checkpoint.capture_sequence, 'anchor/checkpoint capture sequence mismatch');
  assert(anchor.captured_prefix_digest === checkpoint.captured_prefix_digest, 'anchor/checkpoint captured prefix mismatch');
  assert(anchor.checkpoint_digest === checkpoint.checkpoint_digest, 'anchor/checkpoint digest binding mismatch');
  assert(anchor.snapshot_digest === snapshot.snapshot_digest, 'anchor/snapshot digest binding mismatch');

  assert(ledger.ledger_id === anchor.ledger_id, 'anchor/ledger id mismatch');
  assert(ledger.recovery_domain_id === anchor.recovery_domain_id, 'anchor/ledger recovery domain mismatch');
  assert(ledger.recovery_epoch >= anchor.recovery_epoch, 'ledger recovery epoch older than authority anchor');
  assert(ledger.events.length >= anchor.capture_sequence, 'ledger older than authority capture sequence');
  assert(eventDigestAtSequence(ledger, anchor.capture_sequence) === anchor.captured_prefix_digest, 'ledger prefix differs from authority anchor');
  return true;
}

function expectFailure(id, fn) {
  let failed = false;
  try { fn(); } catch { failed = true; }
  assert(failed, `mutation did not fail closed: ${id}`);
}

const trustedKeys = crypto.generateKeyPairSync('ed25519');
const attackerKeys = crypto.generateKeyPairSync('ed25519');

const ledger = makeLedger();
appendEvent(ledger, 'RECOVERY_CHECKPOINT');
const checkpoint = makeCheckpoint(ledger, 1);
const snapshot = makeSnapshot(checkpoint, {
  'source-1': 'WITHDRAWN',
  'claim-1': 'INVALIDATED',
  'projection-1': 'HOLD_RECOMPUTE_REQUIRED'
});
const anchor = signAnchor(snapshot, trustedKeys.privateKey, trustedKeys.publicKey);
assert(validateRecovery(snapshot, ledger, anchor, trustedKeys.publicKey) === true, 'baseline independent recovery authority validation failed');

const mutations = [
  ['missing_anchor', () => validateRecovery(snapshot, ledger, null, trustedKeys.publicKey)],
  ['wrong_trusted_public_key', () => validateRecovery(snapshot, ledger, anchor, attackerKeys.publicKey)],
  ['anchor_signature_tamper', () => {
    const candidate = structuredClone(anchor);
    candidate.signature = Buffer.from('not-a-valid-signature').toString('base64');
    validateRecovery(snapshot, ledger, candidate, trustedKeys.publicKey);
  }],
  ['anchor_authority_source_rebound', () => {
    const candidate = signAnchor(snapshot, trustedKeys.privateKey, trustedKeys.publicKey);
    candidate.authority_source = 'PAYLOAD';
    validateRecovery(snapshot, ledger, candidate, trustedKeys.publicKey);
  }],
  ['anchor_record_id_rebound', () => {
    const candidate = signAnchor(snapshot, trustedKeys.privateKey, trustedKeys.publicKey);
    candidate.authority_record_id = 'foreign-recovery-authority';
    validateRecovery(snapshot, ledger, candidate, trustedKeys.publicKey);
  }],
  ['stale_authority_anchor', () => {
    const candidate = signAnchor(snapshot, trustedKeys.privateKey, trustedKeys.publicKey, {
      issuedAt: '2026-08-20T00:00:00Z', validUntil: '2026-08-21T00:00:00Z'
    });
    validateRecovery(snapshot, ledger, candidate, trustedKeys.publicKey);
  }],
  ['snapshot_digest_tamper', () => {
    const candidate = structuredClone(snapshot);
    candidate.object_states['claim-1'] = 'ACTIVE';
    validateRecovery(candidate, ledger, anchor, trustedKeys.publicKey);
  }],
  ['checkpoint_digest_tamper', () => {
    const candidate = structuredClone(snapshot);
    candidate.recovery_checkpoint.captured_prefix_digest = 'forged';
    candidate.snapshot_digest = digestWithout(candidate, 'snapshot_digest');
    validateRecovery(candidate, ledger, anchor, trustedKeys.publicKey);
  }],
  ['anchor_snapshot_rebound_with_valid_trusted_signature', () => {
    const otherSnapshot = structuredClone(snapshot);
    otherSnapshot.object_states['claim-1'] = 'ACTIVE';
    otherSnapshot.snapshot_digest = digestWithout(otherSnapshot, 'snapshot_digest');
    const otherAnchor = signAnchor(otherSnapshot, trustedKeys.privateKey, trustedKeys.publicKey);
    validateRecovery(snapshot, ledger, otherAnchor, trustedKeys.publicKey);
  }],
  ['anchor_ledger_id_rebound_with_valid_trusted_signature', () => {
    const candidate = signAnchor(snapshot, trustedKeys.privateKey, trustedKeys.publicKey);
    const signed = structuredClone(candidate);
    delete signed.signature;
    signed.ledger_id = 'foreign-ledger';
    signed.signature = crypto.sign(null, Buffer.from(canonical(signed)), trustedKeys.privateKey).toString('base64');
    validateRecovery(snapshot, ledger, signed, trustedKeys.publicKey);
  }],
  ['paired_forged_backup_same_ids_rejected', () => {
    const forgedLedger = makeLedger({ ledgerId: ledger.ledger_id, recoveryDomainId: ledger.recovery_domain_id, recoveryEpoch: ledger.recovery_epoch });
    appendEvent(forgedLedger, 'FORGED_ALTERNATE_HISTORY');
    const forgedCheckpoint = makeCheckpoint(forgedLedger, 1);
    const forgedSnapshot = makeSnapshot(forgedCheckpoint, {
      'source-1': 'ACTIVE',
      'claim-1': 'ACTIVE',
      'projection-1': 'ACTIVE'
    });
    const forgedAnchor = signAnchor(forgedSnapshot, attackerKeys.privateKey, trustedKeys.publicKey);
    // Attacker can copy the trusted key identifier string, but cannot create a signature
    // that verifies under the independently trusted recovery-authority public key.
    validateRecovery(forgedSnapshot, forgedLedger, forgedAnchor, trustedKeys.publicKey);
  }],
  ['original_anchor_rejects_forged_same_id_ledger', () => {
    const forgedLedger = makeLedger({ ledgerId: ledger.ledger_id, recoveryDomainId: ledger.recovery_domain_id, recoveryEpoch: ledger.recovery_epoch });
    appendEvent(forgedLedger, 'FORGED_ALTERNATE_HISTORY');
    validateRecovery(snapshot, forgedLedger, anchor, trustedKeys.publicKey);
  }]
];

for (const [id, fn] of mutations) expectFailure(id, fn);

console.log(JSON.stringify({
  suite: 'KIDULTS_RECOVERY_AUTHORITY_ANCHOR_V1',
  governing_issue: 1068,
  parent_pre_partner_gate: 881,
  predecessor_recovery_issue: 1060,
  result: 'PASS',
  independent_authority_anchor_required: true,
  authority_signature_algorithm: 'Ed25519',
  trusted_public_key_separate_from_backup_set: true,
  ledger_identity_domain_epoch_bound: true,
  checkpoint_and_snapshot_digest_bound: true,
  exact_captured_prefix_bound: true,
  authority_freshness_fail_closed: true,
  paired_forged_snapshot_and_ledger_rejected: true,
  mutations_fail_closed: mutations.length,
  production_key_storage_requirement: 'KMS_OR_SECRET_MANAGER_OUTSIDE_BACKUP_SET',
  empirical_gate_effect: 'NONE',
  external_partner_data_ingestion: 'HOLD',
  production: 'HOLD',
  public: 'HOLD',
  g5: 'EXPLICIT_APPROVAL_REQUIRED'
}, null, 2));
