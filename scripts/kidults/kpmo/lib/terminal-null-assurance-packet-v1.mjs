import {canonicalJson,sha256} from './canonical-json-v1.mjs';

const repository='johnkim9524-collab/kaios_enterprise_repo';
export const ORIGINAL_TERMINAL_NULL_REFS=Object.freeze([38132692877,11700046124,
  'sha256:b29d657aabd33895864a838dd84b836579a3febd9a4bd1299437580578f07ab4']);
export const TERMINAL_NULL_PUSH_CONTROL_IDS=Object.freeze([
  'SOURCE_SHA_BINDING','CONTINUOUS_ASSURANCE_CANONICAL_IDENTITY','CONTINUOUS_ASSURANCE_EPHEMERAL_GUARD',
  'CONTINUOUS_ASSURANCE_CONTRACT','WORKFLOW_REPOSITORY_MUTATION_BOUNDARY','UNIFIED_AUDIT_CONTROL_PLANE',
  'CRITICAL_GATE_BINDINGS','TRUSTED_CONTROL_DEPENDENCY_CLOSURE','PROVIDER_RIGHTS_DECISION_GATE',
  'FULL_VALUE_CHAIN_REDTEAM','STAGE_MACHINE_COVERAGE','OPERATING_PRINCIPLES_RESILIENCE','ESTATE_ACTION_PINNING',
  'DEPENDENCY_BOOTSTRAP_LOCK','PORTAL_LAUNCH_ASSURANCE','SERVER_PROJECTION_CAPABILITY','DIGITALOCEAN_READONLY_TRUTH',
  'CANONICAL_PRODUCT_VERTICAL_SLICE','GLOBAL_STANDARD_PREPRODUCTION','VALUE_CHAIN_COMPLETION_SCORECARD',
  'SOURCE_POOL_FOUNDATION_BUILD','SOURCE_POOL_FOUNDATION_VALIDATE','SYNTHETIC_FAIL_CLOSED_E2E_BUILD',
  'SYNTHETIC_FAIL_CLOSED_E2E_VALIDATE','POST_AUDIT_SOURCE_SHA_BINDING','AUDIT_INPUT_TREE_IMMUTABILITY',
  'AUDIT_EXECUTION_INPUT_IMMUTABILITY']);
const check=(ok)=>{if(!ok)throw new Error('TERMINAL_NULL_ASSURANCE_PACKET_INVALID');};
// Content validation only: native run, job and physical ZIP authentication must
// precede this call. An accepted failure stays a failure and grants no authority.
export function validateTerminalNullAssurancePacket({run,audit,proof,sourceSha}){
  const auditBody=Object.fromEntries(Object.entries(audit||{}).filter(([k])=>!['observed_at','receipt_digest'].includes(k)));
  const {receipt_digest:proofDigest,...proofBody}=proof||{};
  const checks=proof?.operating_checks,failed=checks?.filter(c=>c.state==='VERIFIED_FAIL');
  const terminal=checks?.filter(c=>c.id==='FINALIZER_RESERVATION_AND_IMMUTABLE_TERMINAL');
  check(/^[a-f0-9]{40}$/.test(sourceSha||'')&&run?.head_sha===sourceSha&&run.head_branch==='main'
    &&run.path==='.github/workflows/kidults-platform-continuous-assurance-v1.yml'
    &&run.repository?.full_name===repository&&String(run.repository?.id)==='1281328888'
    &&run.run_attempt===1&&run.status==='completed'&&run.conclusion==='failure'
    &&run.event==='push'
    &&audit?.receipt_type==='KIDULTS_PLATFORM_CONTINUOUS_ASSURANCE'
    &&audit.source?.sha===sourceSha&&audit.source.actual_sha===sourceSha&&audit.source.expected_sha===sourceSha&&audit.source.match===true
    &&audit.execution?.trigger===run.event&&audit.execution.workflow_run_id===String(run.id)&&audit.execution.workflow_run_attempt==='1'
    &&audit.execution.profile==='deep'&&audit.execution.upstream===null&&audit.source.kind==='PROTECTED_MAIN_PUSH'
    &&audit.receipt_digest===sha256(canonicalJson(auditBody))
    &&audit.states?.internal_control_state==='VERIFIED_PASS'&&audit.states.promotion_eligible===false
    &&Array.isArray(audit.checks)&&audit.checks.length===TERMINAL_NULL_PUSH_CONTROL_IDS.length
    &&new Set(audit.checks.map(c=>c.id)).size===audit.checks.length
    &&audit.checks.every(c=>c.required===true&&c.state==='VERIFIED_PASS')
    &&TERMINAL_NULL_PUSH_CONTROL_IDS.every(id=>audit.checks.some(c=>c.id===id))
    &&proof?.id==='kidults-whole-platform-operating-proof-v1'&&proof.repository===repository&&proof.source_sha===sourceSha
    &&proof.state==='VERIFIED_FAIL'&&proof.whole_platform_runtime_proven===false
    &&proofDigest===sha256(canonicalJson(proofBody))
    &&Array.isArray(checks)&&new Set(checks.map(c=>c.id)).size===checks.length
    &&failed.length===1&&terminal.length===1&&terminal[0]===failed[0]
    &&terminal[0].reason==='ORIGINAL_RESERVATION_AND_IMMUTABLE_TERMINAL_UNAVAILABLE'
    &&canonicalJson(terminal[0].evidence_refs)===canonicalJson(ORIGINAL_TERMINAL_NULL_REFS)
    &&['production','public','g5','provider_activation'].every(k=>proof[k]==='HOLD'));
  return {state:'VERIFIED_FAIL',structural_run_accepted:true,producer_health_authority:false,
    actual_authority_granted:false,promotion_eligible:false,whole_platform_runtime_proven:false,
    audit_receipt_digest:audit.receipt_digest,operating_proof_digest:proofDigest,
    original_terminal_evidence_refs:ORIGINAL_TERMINAL_NULL_REFS,production:'HOLD',public:'HOLD',g5:'HOLD'};
}
