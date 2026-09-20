import { requireValue } from '../common-control/canonical-v1.mjs';

const WRITER_ID = 'kpmo-approval-consumption-writer-v1';

export async function persistAutonomousContainmentFenceInTransaction(client, input, verifyFence,
  expectedPreviousFenceDigest = null) {
  const fence = verifyFence(input);
  requireValue(new Set(['APPROVED_CONTAINMENT_FENCE_ACTIVE', 'APPROVED_CONTAINMENT_RELEASED'])
    .has(fence.state),
    'AUTONOMOUS_CONTAINMENT_FENCE_PERSIST_CLEAR_PROHIBITED');
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',
    ['kidults.autonomous-containment-fence.v1']);
  if (expectedPreviousFenceDigest !== null) {
    const current = await resolveCurrentAutonomousContainmentFence(client, {
      verifyFence, createClearFence: () => null,
    });
    requireValue(current?.state === 'APPROVED_CONTAINMENT_FENCE_ACTIVE'
      && current.fenceDigest === expectedPreviousFenceDigest,
    'AUTONOMOUS_CONTAINMENT_RELEASE_STALE_FENCE');
  }
  await client.query(`INSERT INTO kidults_control.autonomous_containment_fence_events
      (fence_digest, action, source_evidence_digest, action_package_digest,
       approval_receipt_digest, previous_fence_digest, fence_json, writer_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)
      ON CONFLICT (fence_digest) DO NOTHING`, [fence.fenceDigest, fence.action,
      fence.sourceEvidenceDigest, fence.actionPackageDigest, fence.approvalReceiptDigest,
      fence.previousFenceDigest, JSON.stringify(fence), WRITER_ID]);
  const readback = await client.query(`SELECT fence_json, fence_digest
    FROM kidults_control.autonomous_containment_fence_events
    WHERE fence_digest=$1`, [fence.fenceDigest]);
  requireValue(readback.rows?.length === 1
    && readback.rows[0].fence_digest === fence.fenceDigest,
    'AUTONOMOUS_CONTAINMENT_FENCE_READBACK_INVALID');
  const verified = verifyFence(readback.rows[0].fence_json);
  requireValue(verified.fenceDigest === fence.fenceDigest,
    'AUTONOMOUS_CONTAINMENT_FENCE_READBACK_INVALID');
  return verified;
}

export async function resolveCurrentAutonomousContainmentFence(client, {
  verifyFence, createClearFence,
}) {
  const result = await client.query(`SELECT fence_json, fence_digest
    FROM kidults_control.autonomous_containment_fence_events
    ORDER BY event_sequence DESC LIMIT 1 /* AUTONOMOUS_CONTAINMENT_FENCE_CURRENT_V1 */`);
  if (result.rows?.length === 0) return createClearFence();
  requireValue(result.rows.length === 1,
    'AUTONOMOUS_CONTAINMENT_FENCE_CURRENT_CARDINALITY_INVALID');
  const fence = verifyFence(result.rows[0].fence_json);
  requireValue(fence.fenceDigest === result.rows[0].fence_digest
    && new Set(['APPROVED_CONTAINMENT_FENCE_ACTIVE', 'APPROVED_CONTAINMENT_RELEASED'])
      .has(fence.state),
  'AUTONOMOUS_CONTAINMENT_FENCE_CURRENT_BINDING_INVALID');
  return fence;
}
