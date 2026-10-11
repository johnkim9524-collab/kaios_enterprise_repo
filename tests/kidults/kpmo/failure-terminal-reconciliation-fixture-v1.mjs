import {canonicalJson,sha256} from '../../../scripts/kidults/kpmo/lib/canonical-json-v1.mjs';
import {failureAssuranceRecoveryObjectKey} from '../../../scripts/kidults/kpmo/lib/interrupted-reservation-recovery-v1.mjs';
const hold={production:'HOLD',public:'HOLD',g5:'HOLD',provider_activation:'HOLD'};
export function failureTerminalFixture(){
 const request={id:'kidults-interrupted-reservation-postmerge-request-v1',version:'1.0.0',repository:'johnkim9524-collab/kaios_enterprise_repo',repository_id:'1281328888',pull_request:2655,
 base_sha:'a'.repeat(40),head_sha:'b'.repeat(40),head_tree_sha:'c'.repeat(40),merge_sha:'d1b801ebf75dfc2b582c6381771f8194016328ca',source_sha:'e'.repeat(40),original_run_id:'38132692877',original_run_attempt:1,
 original_generation:'pr-2655-original-generation',nonce_digest:'sha256:'+'f'.repeat(64),issued_at:'2026-10-12T00:00:00.000Z',expires_at:'2026-10-12T00:20:00.000Z',...hold};
 const evidence={evidence_profile:'TERMINAL_NULL_ASSURANCE_FAILURE_V1'};
 const terminal={id:'kidults-interrupted-failure-assurance-terminal-v1',state:'RECOVERED_FAILURE_ASSURANCE_TERMINAL_ONLY',request_digest:sha256(canonicalJson(request)),evidence_digest:sha256(canonicalJson(evidence)),recovery_run_id:'500',source_sha:request.source_sha,merge_sha:request.merge_sha,original_state:'CONSUMED',original_terminal_present:false,actual_authority_granted:false,platform_closure:false,...hold};
 const object={bucket:'kidults-autonomous-receipts-staging',key:failureAssuranceRecoveryObjectKey(request),version_id:'one-version',sha256:sha256(canonicalJson(terminal)),retention_mode:'COMPLIANCE',retain_until:'2036-10-12T00:00:00Z',encryption_key_arn:'arn:aws:kms:ap-northeast-2:528314240275:key/receipt-key'};
 const context={state:'FAILURE_ASSURANCE_TERMINAL_ALREADY_RECORDED',request,terminal,evidence,evidence_digest:terminal.evidence_digest,immutable_ack:object,write_performed:false,approvals:['ACCOUNTABLE_TRACK_AGENT','KPMO','INDEPENDENT_VERIFIER'].map((role,i)=>({role,approval_run_id:String(600+i),request_digest:terminal.request_digest,evidence_digest:terminal.evidence_digest}))};
 const result={state:terminal.state,reconciliation_run_id:'500',request,terminal,terminal_digest:object.sha256,immutable:object,immutable_readback:object,consistent_read:context,original_reservation_reconsumed:false,original_terminal_created:false,actual_authority_granted:false,platform_closure:false,promotion_eligible:false,...hold};
 return {result:JSON.parse(JSON.stringify(result)),options:{sourceSha:request.source_sha,runId:500,original:structuredClone(request),observedAt:'2026-10-12T00:30:00Z'}};
}
