import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {connectAuthenticatedBusinessInput} from './authenticated-business-input-v1.mjs';
import {canonicalJson,sha256} from '../kpmo/lib/canonical-json-v1.mjs';
import {executeRuntimeDomainWorkloads} from '../runtime/runtime-domain-workloads-v1.mjs';
import {reconcileRuntimeDomainOutputs} from './authenticated-runtime-domain-outputs-v1.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const [manifestArgument,outputArgument]=process.argv.slice(2);
if(!manifestArgument||!outputArgument)throw new Error('RUNTIME_INPUT_CONNECTION_ARGUMENTS');
const resolve=argument=>{
  const target=path.resolve(root,argument);
  if(!target.startsWith(root+path.sep))throw new Error('RUNTIME_INPUT_CONNECTION_PATH');
  return target;
};
const read=filename=>{
  const stat=fs.lstatSync(filename);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size<1||stat.size>2*1024*1024
    ||fs.realpathSync(filename)!==filename)throw new Error('RUNTIME_INPUT_CONNECTION_FILE');
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(fs.readFileSync(filename)));
};
const manifestPath=resolve(manifestArgument),outputPath=resolve(outputArgument);
const manifest=fs.existsSync(manifestPath)?read(manifestPath):null;
const contract=read(path.join(root,'coordination/kidults/integration/authenticated-business-input-connection-v1.json'));
const definition=read(path.join(root,'coordination/kidults/kpmo/runtime-domain-evidence-demand-v1.json'));
const sourceSha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const connection=await connectAuthenticatedBusinessInput({reference:manifest?.native_business_input_reference,
  contract,sourceSha,token:process.env.GH_TOKEN||process.env.GITHUB_TOKEN});
const workloads=executeRuntimeDomainWorkloads({connection,definition,sourceSha});
const outputContract=read(path.join(root,'coordination/kidults/kpmo/whole-platform-operating-proof-v1.json'));
const nativeOutputs=await reconcileRuntimeDomainOutputs({references:manifest?.native_domain_output_references,
  connection,definition,contract:outputContract,sourceSha,token:process.env.GH_TOKEN||process.env.GITHUB_TOKEN});
// A separate registered native producer is still necessary for each domain.
// Never publish raw business data, rights documents or credentials in this receipt.
const required={
  VALUE_TRACEABILITY:['PROTECTED_INPUT_TO_DECISION_LINEAGE'],
  SOURCE_RIGHTS:['INDEPENDENT_SOURCE_PURPOSE_RETENTION_ADMISSION'],
  ENTITY_RESOLUTION:['ADMITTED_INPUT','INDEPENDENT_CANONICAL_ENTITY_VALIDATION'],
  MARKET_EVIDENCE:['ADMITTED_DATED_TRANSACTIONS','CURRENT_PRICE_AND_LIQUIDITY'],
  ASI_EXECUTION:['ADMITTED_INPUT','COMPLETE_PROCESSOR_OUTPUTS'],
  IMMUTABLE_CANDIDATE:['OBJECT_LOCK_PAIR_VERSIONS','PAIR_READBACK'],
  TRACK_B_VALIDATION:['EXACT_IMMUTABLE_PAIR','NATIVE_TRACK_B_ASSESSMENT'],
  PROJECTION_TRUTH:['EXACT_ASSESSED_PAIR','APPROVED_PROJECTION'],
  PORTAL_TRANSPARENCY_ACCESSIBILITY:['RENDERED_APPROVED_PROJECTION','USER_FLOW_AND_ACCESSIBILITY_RESULTS'],
  EOS_FOUNDER_WORKFLOW:['APPROVED_PROJECTION','ACTUAL_EOS_DECISION'],
  RUNTIME_RELIABILITY:['AUTHENTICATED_STAGING_EXECUTION','FAILURE_RECOVERY_AND_DB_READBACK'],
  PRIVACY_RETENTION:['ADMITTED_RECORD_CLASSIFICATION','RETENTION_DELETION_READBACK'],
  INTEGRATION_GATE:['ALL_14_INDEPENDENT_NATIVE_DOMAIN_RECEIPTS']
};
const domains=definition.domains.filter(d=>d.id!=='SECURITY_SUPPLY_CHAIN');
if(domains.length!==13||new Set(domains.map(d=>d.id)).size!==13
  ||Object.keys(required).length!==13||domains.some(d=>!required[d.id]))throw new Error('RUNTIME_INPUT_CONNECTION_DOMAIN_SET');
const body={id:'kidults-runtime-domain-input-connections-v1',source_sha:sourceSha,state:'VERIFIED_INCOMPLETE',
  workload_execution:workloads,
  native_output_connections:nativeOutputs,
  evidence_scope:'INPUT_CONNECTION_OBSERVATION_NOT_RUNTIME_DOMAIN_CERTIFICATION',
  native_input_transport_state:connection.state,native_input_blocker:connection.blocker??null,
  native_input_reference:connection.state==='INPUT_TRANSPORT_AND_CONTENT_VERIFIED'?{
    producer_id:connection.producer_id,run_id:connection.run_id,run_attempt:connection.run_attempt,
    artifact_id:connection.artifact_id,artifact_digest:connection.artifact_digest,binding_digest:connection.binding_digest}:null,
  domain_connections:domains.map(d=>({domain_id:d.id,owner:d.owner,requires:d.requires,
    required_evidence:required[d.id],state:'HOLD',native_domain_proven:false,
    input_transport_connected:connection.state==='INPUT_TRANSPORT_AND_CONTENT_VERIFIED'
      &&['VALUE_TRACEABILITY','SOURCE_RIGHTS','ENTITY_RESOLUTION','MARKET_EVIDENCE','ASI_EXECUTION','PRIVACY_RETENTION'].includes(d.id)})),
  native_domain_receipt_emitted:false,whole_platform_runtime_proven:false,
  legal_admission_independently_verified:false,immutable_pair_created:false,remote_workload_verified:false,
  production:'HOLD',public:'HOLD',g5:'HOLD',provider_activation:'HOLD',
  autonomous_effect:'Bounded native input reconciliation precedes business processing; absent authority remains HOLD.',
  global_effect:'All 13 outstanding domains retain explicit source-neutral input requirements.',
  irreplaceable_value_effect:'Input and output provenance remains bound to platform-owned processing.',
  transparency_effect:'Authenticated transport, legal admission, storage and actual runtime remain distinct.'};
const result={...body,receipt_digest:sha256(canonicalJson(body))};
let parent=root;
for(const segment of path.relative(root,path.dirname(outputPath)).split(path.sep).filter(Boolean)){
  parent=path.join(parent,segment);
  if(!fs.existsSync(parent))fs.mkdirSync(parent,{mode:0o700});
  const stat=fs.lstatSync(parent);
  if(!stat.isDirectory()||stat.isSymbolicLink()||fs.realpathSync(parent)!==parent)throw new Error('RUNTIME_INPUT_CONNECTION_OUTPUT_DIRECTORY');
}
fs.writeFileSync(outputPath,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({state:result.state,domain_count:result.domain_connections.length,
  native_input_transport_state:result.native_input_transport_state,native_input_blocker:result.native_input_blocker,
  native_domain_receipt_emitted:false}));
