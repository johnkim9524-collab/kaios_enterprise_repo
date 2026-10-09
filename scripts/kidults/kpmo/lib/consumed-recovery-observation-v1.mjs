import {POSTMERGE_RECOVERY_INCIDENT as I,validatePostmergeRecoveryRequest,validateStoredRecoveryTerminal,recoveryObjectKey} from './autonomous-postmerge-recovery-v1.mjs';

// Input comes exclusively from the authenticated signed-ledger client.
// A consumed historical record can suppress work, never grant current authority.
export function consumedRecoveryObservation(context){
  if(context?.state!=='CONSUMED'||!context.recovery_immutable)return null;
  const fail=()=>{throw new Error('RECOVERY_CONSUMED_OBSERVATION_BINDING');};
  if(context.authorization_generation!==I.original_generation||context.nonce_digest!==I.original_nonce_digest
    ||context.head_sha!==I.original_head_sha||context.run_id!==I.original_run_id)fail();
  validatePostmergeRecoveryRequest(context.recovery_request,{requireFresh:false});
  const terminal=validateStoredRecoveryTerminal(context.recovery_terminal,context.recovery_request);
  const object=context.recovery_immutable;
  if(context.recovery_run_id!==terminal.recovery_run_id||object.receipt_digest!==terminal.receipt_digest
    ||object.object_lock_mode!=='COMPLIANCE'||object.key!==recoveryObjectKey(context.recovery_request)
    ||typeof object.version_id!=='string'||!object.version_id
    ||!/^sha256:[a-f0-9]{64}$/.test(object.checksum_sha256||'')
    ||!Number.isFinite(Date.parse(object.retain_until))||typeof object.encryption_key_arn!=='string'||!object.encryption_key_arn)fail();
  const minimum=new Date(context.recovery_request.issued_at);minimum.setUTCFullYear(minimum.getUTCFullYear()+10);
  if(Date.parse(object.retain_until)<minimum.getTime()||!/^arn:aws:kms:[a-z0-9-]+:[0-9]{12}:key\/[a-f0-9-]+$/.test(object.encryption_key_arn))fail();
  return {state:'HISTORICAL_RECOVERY_ALREADY_SEALED_NO_CURRENT_AUTHORITY',historical_pull_request:I.pull_request,
    historical_receipt_digest:terminal.receipt_digest,write_performed:false,github_reads_skipped:true,
    current_main_operating_proven:false,promotion_eligible:false,production:'HOLD',public:'HOLD',g5:'HOLD'};
}
