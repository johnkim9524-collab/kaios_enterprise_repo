import {canonicalJson,sha256} from './canonical-json-v1.mjs';
import {SPECS} from '../resolve-continuous-assurance-sentinel-health-v1.mjs';
import {REPOSITORY} from '../validate-sentinel-producer-content-v1.mjs';
const requireEvidence=(ok,code)=>{if(!ok)throw new Error(`WHOLE_RUNTIME_${code}`);};
export function verifyHealthReceipt(health,run,sourceSha){
  requireEvidence(health?.receipt_id==='kpmo-continuous-assurance-sentinel-health-v1'&&health.source_sha===sourceSha&&health.repository===REPOSITORY,'HEALTH_SOURCE');
  const {receipt_digest,...body}=health;
  requireEvidence(receipt_digest===sha256(canonicalJson(body)),'HEALTH_DIGEST');
  requireEvidence(health.observer_run_id===run.id&&health.observer_run_attempt===run.run_attempt,'HEALTH_OBSERVER');
  requireEvidence(health.state==='VERIFIED_PASS'&&health.semantic_content_verified===true&&health.coverage_scope==='CORE_FOUR_ONLY_NOT_WHOLE_PLATFORM','HEALTH_STATE');
  requireEvidence(Array.isArray(health.producers)&&health.producers.length===4,'HEALTH_COVERAGE');
  requireEvidence(SPECS.every(s=>health.producers.filter(p=>p.id===s.id).length===1),'HEALTH_PRODUCER_IDS');
  requireEvidence(health.producers.every(p=>p.state==='VERIFIED_PASS'&&p.artifact_content_validated===true&&p.artifact_transport_verified===true),'HEALTH_CONTENT');
  requireEvidence(health.production==='HOLD'&&health.public==='HOLD'&&health.g5==='HOLD'&&health.promotion_eligible===false,'HEALTH_HOLD');
  return health;
}
export function distinctNaturalGenerations(healths){
  if(healths.length<2)return false;
  const [newer,older]=healths;
  // Observer IDs and a changed single producer are not a second whole chain.
  return SPECS.every(s=>{
    const a=newer.producers.find(p=>p.id===s.id),b=older.producers.find(p=>p.id===s.id);
    return a.selected_run_id!==b.selected_run_id&&Date.parse(a.selected_created_at)>Date.parse(b.selected_created_at)
      &&a.selected_event!=='workflow_dispatch'&&b.selected_event!=='workflow_dispatch';
  });
}
export function verifyMissionTerminal(receipt,sourceSha,commit){
  requireEvidence(receipt?.id==='kidults-autonomous-internal-landing-terminal-receipt-v1'&&receipt.state==='RECEIPT_SEALED','TERMINAL_TYPE');
  const {immutable_copy,receipt_digest,...body}=receipt;
  requireEvidence(receipt_digest===sha256(canonicalJson(body)),'TERMINAL_DIGEST');
  requireEvidence(receipt.merge?.merge_sha===sourceSha&&receipt.merge.main_sha===sourceSha&&receipt.merge.tree_sha===commit.tree.sha,'TERMINAL_SOURCE');
  requireEvidence(commit.parents?.length===2&&commit.parents[0].sha===receipt.binding?.base_sha&&commit.parents[1].sha===receipt.binding?.head_sha,'TERMINAL_PARENTS');
  requireEvidence(receipt.durable_reservation?.state==='CONSUMED'&&receipt.durable_reservation.conditional_write===true&&receipt.postmerge?.state==='VERIFIED_PASS','TERMINAL_CONSUMPTION');
  requireEvidence(immutable_copy?.state==='OBJECT_LOCK_COMPLIANCE_VERIFIED'&&immutable_copy.body_readback_verified===true&&immutable_copy.conditional_write===true,'TERMINAL_IMMUTABILITY');
  requireEvidence(immutable_copy.receipt_sha256===sha256(canonicalJson(bodyWithDigest(body,receipt_digest))),'TERMINAL_IMMUTABLE_BINDING');
  requireEvidence(['production','public','g5'].every(k=>receipt[k]==='HOLD'),'TERMINAL_HOLD');
  requireEvidence(receipt.workloads?.length===3&&new Set(receipt.workloads.map(w=>w.stable_id)).size===3&&new Set(receipt.workloads.map(w=>w.signing_key_arn)).size===3,'TERMINAL_QUORUM');
  return receipt;
}
function bodyWithDigest(body,receipt_digest){return {...body,receipt_digest};}

export function verifyValueChainDomainReceipt(receipt,domain,run,sourceSha){
  requireEvidence(receipt?.id==='kidults-value-chain-runtime-domain-receipt-v1'&&receipt.domain_id===domain&&receipt.source_sha===sourceSha,'DOMAIN_SOURCE');
  const {receipt_digest,...body}=receipt;
  requireEvidence(receipt_digest===sha256(canonicalJson(body)),'DOMAIN_DIGEST');
  requireEvidence(receipt.repository===REPOSITORY&&receipt.run_id===run.id&&receipt.run_attempt===run.run_attempt,'DOMAIN_RUN');
  requireEvidence(receipt.state==='VERIFIED_PASS'&&receipt.execution_mode==='LIVE_RUNTIME'&&receipt.fixture_evidence===false&&receipt.empirical_inputs_verified===true,'DOMAIN_RUNTIME');
  requireEvidence(Array.isArray(receipt.primary_evidence)&&receipt.primary_evidence.length>0&&receipt.primary_evidence.length<=100
    &&receipt.primary_evidence.every(e=>/^sha256:[a-f0-9]{64}$/.test(e.digest||'')&&typeof e.protected_source_ref==='string'&&e.protected_source_ref.length>0),'DOMAIN_PRIMARY_EVIDENCE');
  requireEvidence(['production','public','g5','provider_activation'].every(k=>receipt[k]==='HOLD'),'DOMAIN_HOLD');
  return receipt;
}
