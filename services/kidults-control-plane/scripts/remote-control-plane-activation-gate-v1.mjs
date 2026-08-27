/**
 * Fail-closed remote activation gate. This script only evaluates evidence;
 * it never provisions infrastructure, uses credentials, or changes runtime.
 *
 * Solo Owner governance: human reviewer approval is not a required gate.
 * Exact-head automated checks and immutable runtime receipts are authoritative.
 */
const required = [
  ['KPMO_REMOTE_POSTGRES_PROVISIONED', 'REMOTE_POSTGRESQL_PROVISIONING'],
  ['KPMO_REMOTE_POSTGRES_RLS_VERIFIED', 'REMOTE_POSTGRESQL_RLS_AND_CONCURRENCY'],
  ['KPMO_REMOTE_PITR_VERIFIED', 'REMOTE_POSTGRESQL_PITR'],
  ['KPMO_REMOTE_PROJECTOR_DEPLOYED', 'GOVERNED_D1_PROJECTOR_DEPLOYMENT'],
  ['KPMO_LEGACY_D1_WRITER_DISABLED', 'LEGACY_D1_WRITER_CUTOVER'],
  ['KPMO_REMOTE_ROLLBACK_RECEIPT', 'REMOTE_ROLLBACK_RECEIPT'],
  ['KPMO_EXACT_HEAD_CHECKS_PASS', 'EXACT_HEAD_AUTOMATED_CHECKS'],
  ['KPMO_POST_MERGE_MAIN_REVALIDATED', 'POST_MERGE_MAIN_REVALIDATION'],
];

const missing = required
  .filter(([env]) => process.env[env] !== '1')
  .map(([, label]) => label);

const receipt = {
  id: 'kidults-remote-control-plane-activation-gate-v1',
  governance_mode: 'SOLO_OWNER_AUTOMATED_EVIDENCE',
  required_human_reviewers: 0,
  state: missing.length ? 'HOLD' : 'ELIGIBLE_FOR_GOVERNED_CANARY',
  missing,
  mutation_performed: false,
  credentials_used: false,
  production: 'HOLD',
  public_release: 'HOLD',
  g5: 'HOLD',
};

console.log(JSON.stringify(receipt, null, 2));
if (missing.length) process.exit(1);
