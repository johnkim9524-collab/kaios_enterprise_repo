import fs from 'node:fs';
import {canonicalJson,sha256} from '../../../../scripts/kidults/kpmo/lib/canonical-json-v1.mjs';
import {createAssuranceRuntimeProofHandoff} from '../../../../scripts/kidults/kpmo/lib/assurance-runtime-proof-handoff-v1.mjs';
import {SPECS} from '../../../../scripts/kidults/kpmo/resolve-continuous-assurance-sentinel-health-v1.mjs';

export const repo='johnkim9524-collab/kaios_enterprise_repo';
export const source='a'.repeat(40);
export const seal=value=>({...value,receipt_digest:sha256(canonicalJson(value))});

export function fixture({producerRunId=300}={}){
  const contract=JSON.parse(fs.readFileSync('coordination/kidults/kpmo/whole-platform-operating-proof-v1.json','utf8'));
  const assuranceRun={id:100,run_attempt:1,path:'.github/workflows/kidults-platform-continuous-assurance-v1.yml',
    repository:{full_name:repo},head_repository:{full_name:repo},head_sha:source,head_branch:'main',status:'completed',conclusion:'success',event:'workflow_run'};
  const auditBody={receipt_type:'KIDULTS_PLATFORM_CONTINUOUS_ASSURANCE',source:{sha:source,actual_sha:source,expected_sha:source,match:true},
    execution:{workflow_run_id:'100',workflow_run_attempt:'1'},states:{internal_control_state:'VERIFIED_PASS'}};
  const auditReceipt={...auditBody,observed_at:'2026-10-23T00:00:00Z',receipt_digest:sha256(canonicalJson(auditBody))};
  const auditText=JSON.stringify(auditReceipt);
  const assuranceArtifact={id:200,digest:'sha256:'+'b'.repeat(64),expired:false,workflow_run:{id:100,head_sha:source}};
  const assuranceArchive={archive_digest:assuranceArtifact.digest,members:[{name:'audit-receipt.json',encoding:'utf-8',text:auditText,sha256:sha256(auditText)}]};
  const assuranceAuditJob={id:101,run_id:100,run_attempt:1,name:'audit',status:'completed',conclusion:'success'};
  const producerRun={id:producerRunId,name:'KIDULTS Autonomous KPMO Authorization V1',run_attempt:1,path:'.github/workflows/kidults-autonomous-kpmo-authorization-v1.yml',
    repository:{full_name:repo},head_repository:{full_name:repo},head_sha:source,head_branch:'main',status:'completed',conclusion:'success',event:'workflow_run'};
  const producerArtifact={id:301,digest:'sha256:'+'c'.repeat(64),expired:false,workflow_run:{id:producerRunId,head_sha:source}};
  const sentinelRun={id:900,run_attempt:1,path:'.github/workflows/kpmo-continuous-assurance-sentinel-health-v1.yml',
    repository:{full_name:repo},head_repository:{full_name:repo},head_sha:source,head_branch:'main',status:'completed',conclusion:'success',event:'workflow_run'};
  const sentinelArtifact={id:910,digest:'sha256:'+'9'.repeat(64),expired:false,workflow_run:{id:900,head_sha:source}};
  const healthReceipt=seal({receipt_id:'kpmo-continuous-assurance-sentinel-health-v1',source_sha:source,repository:repo,
    observer_run_id:900,observer_run_attempt:1,state:'VERIFIED_PASS',semantic_content_verified:true,
    coverage_scope:'CORE_FOUR_ONLY_NOT_WHOLE_PLATFORM',producers:SPECS.map((spec,i)=>({id:spec.id,state:'VERIFIED_PASS',
      artifact_content_validated:true,artifact_transport_verified:true,selected_run_id:920+i,selected_run_attempt:1,
      selected_event:spec.events[0],selected_created_at:`2026-10-23T00:${String(i*5).padStart(2,'0')}:00Z`})),
    production:'HOLD',public:'HOLD',g5:'HOLD',promotion_eligible:false});
  const domain=contract.autonomous_operating_readiness.mandatory_runtime_domains[0];
  const valueChain=contract.value_chain_dimensions.map(id=>id===domain
    ?{id,run_id:700,runtime_state:'VERIFIED_PASS',runtime_receipt_digest:'sha256:'+'d'.repeat(64)}
    :{id,runtime_state:'FUTURE_EXPANSION'});
  const proofBody={id:contract.id,repository:repo,source_sha:source,value_chain:valueChain,
    runtime_domain_registry:{state:'HOLD',registered_domain_count:1,required_domain_count:14},
    operating_checks:[{id:'CORE_FOUR_CONTENT',state:'VERIFIED_PASS',evidence_refs:[900,901]}],
    autonomous_runtime_readiness_proven:true,autonomous_runtime_readiness:{state:'VERIFIED_PASS',
      scope:'AUTONOMOUS_CONTROL_PLANE_NOT_WHOLE_PLATFORM',verified_domain_count:1,required_domain_count:1,
      domain_ids:[domain],future_expansion_domain_ids:[...contract.autonomous_operating_readiness.future_expansion_domains].sort()},
    protected_evidence:[{workflow_path:'.github/workflows/kidults-security-assurance-empirical-r1.yml',run_id:700,run_attempt:1,
      source_sha:source,artifact_id:701,artifact_digest:'sha256:'+'e'.repeat(64)},
      {workflow_path:sentinelRun.path,run_id:900,run_attempt:1,source_sha:source,artifact_id:910,artifact_digest:sentinelArtifact.digest}]};
  const proof=seal(proofBody);
  const handoff=createAssuranceRuntimeProofHandoff({proof,assuranceRun,assuranceAudit:auditReceipt,
    assuranceArtifact,producerRun:{id:producerRun.id,run_attempt:1,path:producerRun.path,head_sha:source,head_branch:'main',event:'workflow_run'}});
  return {producerRun,producerArtifact,proof,handoff,assuranceRun,assuranceAuditJob,assuranceArtifact,auditReceipt,
    assuranceArchive,currentMainSha:source,sentinelRun,sentinelArtifact,healthReceipt};
}
