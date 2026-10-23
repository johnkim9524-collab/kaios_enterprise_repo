import {canonicalJson,sha256,buildTerminalReceipt} from '../../../scripts/kidults/kpmo/lib/autonomous-internal-landing-v1.mjs';
export function atomicOriginalFixture(){
 const b={repository:'johnkim9524-collab/kaios_enterprise_repo',repository_id:'1281328888',pull_request:42,base_sha:'a'.repeat(40),head_sha:'b'.repeat(40),head_tree_sha:'c'.repeat(40),scope_digest:sha256('scope'),test_evidence_digest:sha256('test'),rollback_digest:sha256('rollback'),authorization_generation:'pr-42-original-generation',nonce_digest:sha256('nonce'),issued_at:'2026-10-11T00:00:00.000Z',expires_at:'2026-10-11T00:20:00.000Z',dispatch_id:sha256('dispatch'),dispatch_idempotency_key:sha256('idempotency')};
 const approvals=['KPMO','INDEPENDENT_VERIFIER'].map((role,i)=>{const workloadIndex=i+1;return {...b,role,workload:{run_id:String(100+i),workload_id:'w'+workloadIndex,environment:'STAGING-'+workloadIndex,signing_key_arn:'k'+workloadIndex}}});
 const quorum={binding:b,workloads:approvals.map(a=>({role:a.role,stable_id:a.workload.workload_id,signing_key_arn:a.workload.signing_key_arn})),quorum_digest:sha256(approvals.map(a=>sha256(canonicalJson(a))).sort().join('\n'))};
 const merge={merge_sha:'d'.repeat(40),main_sha:'d'.repeat(40),head_sha:b.head_sha,tree_sha:b.head_tree_sha},postmerge={state:'VERIFIED_PASS'};
 const remote={contract_version:'3.0.0',action:'CONSUME_RESERVATION',authorization_generation:b.authorization_generation,nonce_digest:b.nonce_digest,run_id:'100',head_sha:b.head_sha,merge_sha:merge.merge_sha,state:'CONSUMED',conditional_write:true};
 const reservation={state:'CONSUMED',conditional_write:true,backend:'AWS_DYNAMODB',remote_binding:remote,ledger_key:{pk:'RESERVE#'+b.authorization_generation,sk:'NONCE#'+b.nonce_digest}};
 const terminal=buildTerminalReceipt({quorum,reservation,merge,postmerge,now:'2026-10-11T00:01:00.000Z'});
 return {envelope:b,runId:'100',quorum,merge,postmerge,now:'2026-10-11T00:01:00.000Z',terminal,approvals};
}
