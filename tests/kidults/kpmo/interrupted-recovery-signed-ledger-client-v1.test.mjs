import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createInterruptedRecoverySignedLedgerClient,createInterruptedRecoveryAwsTransport,recoveryTransportDiagnostic} from '../../../scripts/kidults/kpmo/lib/interrupted-recovery-signed-ledger-client-v1.mjs';
import {canonicalJson,sha256} from '../../../scripts/kidults/kpmo/lib/canonical-json-v1.mjs';
const repo='johnkim9524-collab/kaios_enterprise_repo',source='e'.repeat(40),key='arn:aws:kms:ap-northeast-2:528314240275:key/key-1',now=Date.parse('2026-10-11T00:01:00Z');
function fixture(role='FINALIZER'){
 const request={id:'kidults-interrupted-reservation-postmerge-request-v1',version:'1.0.0',repository:repo,repository_id:'1281328888',pull_request:42,
   base_sha:'a'.repeat(40),head_sha:'b'.repeat(40),head_tree_sha:'c'.repeat(40),merge_sha:'d'.repeat(40),source_sha:source,original_run_id:'100',original_run_attempt:1,
   original_generation:'pr-42-original-generation',nonce_digest:'sha256:'+'f'.repeat(64),issued_at:'2026-10-11T00:00:00Z',expires_at:'2026-10-11T00:20:00Z',production:'HOLD',public:'HOLD',g5:'HOLD',provider_activation:'HOLD'};
 const f={request,calls:[],response:{ok:true,state:'RESERVED'},metadata:{StatusCode:200},identity:{Account:'528314240275',Arn:`arn:aws:sts::528314240275:assumed-role/kidults-autonomous-${role==='FINALIZER'?'finalizer':'kpmo'}-staging-role/run-400`}};
 f.env={GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:repo,GITHUB_REPOSITORY_ID:'1281328888',GITHUB_REF:'refs/heads/main',GITHUB_SHA:source,GITHUB_WORKFLOW_SHA:source,
 GITHUB_RUN_ID:'400',GITHUB_RUN_ATTEMPT:'1',GITHUB_EVENT_NAME:'repository_dispatch',GITHUB_WORKFLOW_REF:`${repo}/.github/workflows/kidults-autonomous-kpmo-authorization-v1.yml@refs/heads/main`,KIDULTS_AUTONOMOUS_SIGNING_KEY_ARN:key};
 f.aws=async args=>{f.calls.push(args);if(args[0]==='sts')return f.identity;
 if(args[0]==='kms'){f.digest=fs.readFileSync(args[args.indexOf('--message')+1].slice(8));return {KeyId:key,SigningAlgorithm:'ECDSA_SHA_256',Signature:Buffer.from('signature').toString('base64')};}
 assert.equal(args[0],'lambda');assert.equal(args[args.indexOf('--function-name')+1],'kidults-autonomous-ledger-writer-staging');
 f.envelope=JSON.parse(args[args.indexOf('--payload')+1]).envelope;assert.deepEqual(f.digest,Buffer.from(sha256(canonicalJson(f.envelope)).slice(7),'hex'));
 fs.writeFileSync(args.at(-1),JSON.stringify(f.response));return f.metadata;};
 f.client=()=>createInterruptedRecoverySignedLedgerClient({role,signingKeyArn:key,sourceSha:source,env:f.env,aws:f.aws,now:()=>now});return f;
}
test('generic finalizer signs exact engine input without replacing original owner',async()=>{const f=fixture(),c=await f.client();await c.claim({request:f.request,run_id:'400',expected_revision:0,lease_seconds:120});assert.equal(f.envelope.action,'CLAIM_MERGED_RECOVERY');assert.equal(f.envelope.request.original_run_id,'100');assert.equal(f.envelope.run_attempt,1);assert.deepEqual(f.calls.map(x=>x[0]),['sts','kms','lambda']);});
test('expired history can be read but cannot claim fresh authority',async()=>{const f=fixture();f.request.expires_at='2026-10-11T00:00:30Z';const c=await f.client();await c.read({request:f.request,run_id:'400'});await assert.rejects(c.claim({request:f.request,run_id:'400',expected_revision:0,lease_seconds:120}),/EXPIRED/);assert.equal(f.calls.filter(x=>x[0]==='lambda').length,1);});
for(const [name,mutate] of [
 ['admin profile',f=>f.env.AWS_PROFILE='admin'],['default profile',f=>f.env.AWS_DEFAULT_PROFILE='admin'],
 ['rerun',f=>f.env.GITHUB_RUN_ATTEMPT='2'],['manual event',f=>f.env.GITHUB_EVENT_NAME='workflow_dispatch'],
 ['foreign workflow',f=>f.env.GITHUB_WORKFLOW_REF='foreign'],['source drift',f=>f.env.GITHUB_SHA='a'.repeat(40)],
 ['unregistered key',f=>f.env.KIDULTS_AUTONOMOUS_SIGNING_KEY_ARN=key+'other'],['admin identity',f=>f.identity.Arn='arn:aws:sts::528314240275:assumed-role/admin/session'],
])test('reject '+name+' before KMS',async()=>{const f=fixture();mutate(f);await assert.rejects(f.client());assert.equal(f.calls.filter(x=>x[0]==='kms').length,0);});
test('run impersonation and quarantined operation never sign',async()=>{const f=fixture(),c=await f.client();await assert.rejects(c.read({request:f.request,run_id:'401'}),/EXECUTION_BINDING/);f.request.pull_request=1677;await assert.rejects(c.read({request:f.request,run_id:'400'}),/QUARANTINE/);assert.equal(f.calls.filter(x=>x[0]==='kms').length,0);});
test('role cannot perform finalizer CAS; finalizer cannot approve',async()=>{const f=fixture('KPMO'),c=await f.client();await assert.rejects(c.supersede({request:f.request,run_id:'400'}),/FINALIZER_REQUIRED/);const g=fixture();await assert.rejects((await g.client()).createApproval({request:g.request,evidence:{source_sha:source}}),/APPROVAL_ROLE/);});
test('ambiguous Lambda failure invokes once only',async()=>{const f=fixture(),c=await f.client();f.metadata.FunctionError='Unhandled';await assert.rejects(c.consume({request:f.request,run_id:'400',revision:1,terminal:{}}),/NO_RETRY/);assert.equal(f.calls.filter(x=>x[0]==='lambda').length,1);});
test('failed writer read preserves safe cause and hash before private response deletion',async()=>{
 const f=fixture('KPMO'),c=await f.client();f.metadata.FunctionError='Unhandled';
 f.response={errorType:'ValueError',errorMessage:'INTERRUPTED_RECOVERY_FAILURE_TERMINAL_NULL_ONLY',stackTrace:['private stack secret'],payload:'private secret'};
 let caught;try{await c.readFailureContext({request:f.request});}catch(e){caught=e;}
 assert.match(caught.message,/TRANSPORT_UNKNOWN_NO_RETRY/);const d=caught.recovery_transport_diagnostic;
 assert.equal(d.operation,'READ_FAILED_ASSURANCE_TERMINAL_CONTEXT');assert.equal(d.status_code,200);assert.equal(d.function_error,'Unhandled');
 assert.equal(d.error_type,'ValueError');assert.equal(d.writer_error_code,f.response.errorMessage);
 assert.equal(d.response_sha256,sha256(Buffer.from(JSON.stringify(f.response))));
 assert.equal(d.retry_authorized,false);assert.equal(d.actual_authority_granted,false);
 assert.equal(JSON.stringify(d).includes('private'),false);assert.equal(JSON.stringify(d).includes('signature'),false);
 const invocation=f.calls.find(x=>x[0]==='lambda');assert.equal(fs.existsSync(invocation.at(-1)),false);
 assert.equal(f.calls.filter(x=>x[0]==='lambda').length,2);
 assert.equal(caught.recovery_reconciliation.state,'READBACK_FAILED');
 assert.equal(caught.recovery_reconciliation.transport_diagnostic.operation,'READ_MERGED_RECOVERY_CONTEXT');
});
test('AWS failure classification never retains resource, account or error message',async()=>{
 const f=fixture(),c=await f.client();f.metadata.FunctionError='Handled';f.response={errorType:'ClientError',errorMessage:'An error occurred (AccessDeniedException) when calling the GetItem operation: private resource secret'};
 let caught;try{await c.read({request:f.request,run_id:'400'});}catch(e){caught=e;}
 const d=caught.recovery_transport_diagnostic;assert.equal(d.aws_error_code,'AccessDeniedException');assert.equal(d.writer_error_code,null);
 assert.equal(JSON.stringify(d).includes('private'),false);assert.equal(JSON.stringify(d).includes('GetItem'),false);
});
test('unregistered error strings and function metadata are never copied',async()=>{
 const f=fixture(),c=await f.client();f.metadata={StatusCode:503,FunctionError:'private metadata'};
 f.response={errorType:'private type',errorMessage:'INTERRUPTED_RECOVERY_SIGNATURE secret'};
 let caught;try{await c.read({request:f.request,run_id:'400'});}catch(e){caught=e;}
 const d=caught.recovery_transport_diagnostic;assert.equal(d.status_code,503);assert.equal(d.function_error,null);assert.equal(d.error_type,null);assert.equal(d.writer_error_code,null);assert.equal(JSON.stringify(d).includes('secret'),false);
});
test('CLI invocation failure has a safe diagnostic without a second invoke',async()=>{
 const f=fixture(),original=f.aws;f.aws=async args=>{if(args[0]==='lambda'){f.calls.push(args);throw new Error('private stderr signature secret');}return original(args);};
 const c=await f.client();let caught;try{await c.read({request:f.request,run_id:'400'});}catch(e){caught=e;}
 assert.equal(caught.message,'INTERRUPTED_CLIENT_TRANSPORT_UNKNOWN_NO_RETRY');assert.equal(caught.recovery_transport_diagnostic.response_state,'UNAVAILABLE');
 assert.equal(JSON.stringify(caught.recovery_transport_diagnostic).includes('secret'),false);assert.equal(f.calls.filter(x=>x[0]==='lambda').length,1);
});
test('actual recovery CLI catch retains diagnostic artifact and remains nonzero',()=>{
 const root=process.cwd(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'recovery-hold-regression-'));
 try{
  const expected=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
  const gitDir=execFileSync('git',['rev-parse','--absolute-git-dir'],{encoding:'utf8'}).trim();
  const diagnostic={id:'kidults-interrupted-recovery-transport-diagnostic-v1',status_code:200,function_error:'Unhandled',writer_error_code:'INTERRUPTED_RECOVERY_FAILURE_TERMINAL_NULL_ONLY',retry_authorized:false,actual_authority_granted:false,promotion_eligible:false};
  const reconciliation={id:'kidults-original-reservation-read-only-reconciliation-v1',state:'READ_ONLY_CONTEXT_OBSERVED_NOT_TERMINAL_VERIFIED',writer_context_state:'ORIGINAL_CORE_CONSUMED_ARCHIVE_RECONCILIATION_REQUIRED',write_performed:false,write_authorized:false,original_consumption_reissued:false,actual_authority_granted:false,promotion_eligible:false};
  const stub=`export const recoveryNativeGet=()=>{throw Error('UNEXPECTED_GET')}; export const verifyFailureAssuranceParent=()=>{throw Error('UNEXPECTED_PARENT')}; export async function verifyInterruptedRecoveryNativeTrigger(){const e=new Error('INTERRUPTED_CLIENT_TRANSPORT_UNKNOWN_NO_RETRY');e.recovery_transport_diagnostic=${JSON.stringify(diagnostic)};e.recovery_reconciliation=${JSON.stringify(reconciliation)};throw e;}`;
  const stubUrl='data:text/javascript,'+encodeURIComponent(stub);
  const loader=path.join(dir,'trusted-test-loader.mjs');
  fs.writeFileSync(loader,`export async function resolve(specifier,context,nextResolve){if(specifier.endsWith('/interrupted-recovery-native-trigger-v1.mjs'))return {url:${JSON.stringify(stubUrl)},shortCircuit:true};return nextResolve(specifier,context);}`);
  const env={...process.env,GITHUB_SHA:expected,GIT_DIR:gitDir};delete env.NODE_OPTIONS;
  const result=spawnSync(process.execPath,['--loader',pathToFileURL(loader).href,path.join(root,'scripts/kidults/kpmo/run-interrupted-terminal-recovery-v1.mjs')],{cwd:dir,env,encoding:'utf8',timeout:30000});
  assert.equal(result.status,1);assert.match(result.stderr,/INTERRUPTED_CLIENT_TRANSPORT_UNKNOWN_NO_RETRY/);
  const receipt=JSON.parse(fs.readFileSync(path.join(dir,'out/postmerge-terminal-recovery-v1/interrupted-hold.json')));
  assert.equal(receipt.state,'HOLD');assert.equal(receipt.promotion_eligible,false);assert.deepEqual(receipt.transport_diagnostic,diagnostic);
  assert.deepEqual(receipt.read_only_reconciliation,reconciliation);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('malformed, oversized and symlink responses never escape bounded diagnostic',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'recovery-response-bounds-'));
 try{
  const output=path.join(dir,'response.json'),input={metadata:{StatusCode:200,FunctionError:'Unhandled'},output,envelope:{action:'READ_FAILED_ASSURANCE_TERMINAL_CONTEXT'},sourceSha:source,role:'KPMO',runId:'400'};
  fs.writeFileSync(output,'malformed private content');let d=recoveryTransportDiagnostic(input);assert.equal(d.response_state,'BOUNDED_BYTES');assert.equal(d.error_type,null);assert.equal(JSON.stringify(d).includes('private'),false);
  const invalidUtf8=Buffer.from([0xff,0xfe,0x80]);fs.writeFileSync(output,invalidUtf8);d=recoveryTransportDiagnostic(input);assert.equal(d.response_sha256,'sha256:'+createHash('sha256').update(invalidUtf8).digest('hex'));
  fs.writeFileSync(output,'x'.repeat(131073));d=recoveryTransportDiagnostic(input);assert.equal(d.response_state,'REJECTED_FILE');assert.equal(d.response_sha256,null);
  fs.unlinkSync(output);const secret=path.join(dir,'secret');fs.writeFileSync(secret,'private');fs.symlinkSync(secret,output);
  d=recoveryTransportDiagnostic(input);assert.equal(d.response_state,'REJECTED_FILE');assert.equal(d.response_sha256,null);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('fresh source drift rejects but read-only historical request remains bound',async()=>{const f=fixture(),c=await f.client();f.request.source_sha='a'.repeat(40);await assert.rejects(c.claim({request:f.request,run_id:'400',expected_revision:0,lease_seconds:120}),/SOURCE_BINDING/);await c.read({request:f.request,run_id:'400'});assert.equal(f.envelope.request.source_sha,'a'.repeat(40));});
test('actual subprocess contract overrides ambient CLI retries and bounds network timeouts',()=>{
 let calls=0;
 const transport=createInterruptedRecoveryAwsTransport({env:{AWS_MAX_ATTEMPTS:'9',AWS_RETRY_MODE:'adaptive'},execute:(command,args,options)=>{
   calls++;assert.equal(command,'aws');assert.equal(options.env.AWS_MAX_ATTEMPTS,'1');assert.equal(options.env.AWS_RETRY_MODE,'standard');
   assert.equal(args[args.indexOf('--cli-connect-timeout')+1],'5');assert.equal(args[args.indexOf('--cli-read-timeout')+1],'20');assert.equal(options.timeout,30000);
   throw new Error('ambiguous HTTP outcome');
 }});
 assert.throws(()=>transport(['lambda','invoke']),/ambiguous HTTP outcome/);assert.equal(calls,1);
});

function reconciliationFixture({firstMetadata={StatusCode:200,FunctionError:'Unhandled'},firstResponse={errorType:'ValueError',errorMessage:'INTERRUPTED_RECOVERY_FAILURE_TERMINAL_NULL_ONLY'},context={ok:true,state:'ORIGINAL_CORE_CONSUMED_ARCHIVE_RECONCILIATION_REQUIRED',write_performed:false}}={}){
 const f=fixture('KPMO'),originalAws=f.aws;f.actions=[];
 f.aws=async args=>{
  if(args[0]==='lambda'){
   const action=JSON.parse(args[args.indexOf('--payload')+1]).envelope.action;f.actions.push(action);
   f.metadata=action==='READ_FAILED_ASSURANCE_TERMINAL_CONTEXT'?firstMetadata:{StatusCode:200};
   f.response=action==='READ_FAILED_ASSURANCE_TERMINAL_CONTEXT'?firstResponse:context;
  }
  return originalAws(args);
 };
 return f;
}
test('exact failed row guard performs one distinct read and still throws original failure without approval or consume',async()=>{
 const f=reconciliationFixture({context:{ok:true,state:'ORIGINAL_CORE_CONSUMED_ARCHIVE_RECONCILIATION_REQUIRED',write_performed:false,
   approval:{signature_b64:'private signature'},terminal:{payload:'private terminal'},merge_sha:'private field'}}),c=await f.client();
 let caught;try{await c.readFailureContext({request:f.request});}catch(e){caught=e;}
 assert.equal(caught.message,'INTERRUPTED_CLIENT_TRANSPORT_UNKNOWN_NO_RETRY');
 assert.equal(caught.recovery_transport_diagnostic.operation,'READ_FAILED_ASSURANCE_TERMINAL_CONTEXT');
 assert.deepEqual(f.actions,['READ_FAILED_ASSURANCE_TERMINAL_CONTEXT','READ_MERGED_RECOVERY_CONTEXT']);
 const r=caught.recovery_reconciliation;
 assert.equal(r.state,'READ_ONLY_CONTEXT_OBSERVED_NOT_TERMINAL_VERIFIED');
 assert.equal(r.writer_context_state,'ORIGINAL_CORE_CONSUMED_ARCHIVE_RECONCILIATION_REQUIRED');
 assert.equal(r.write_performed,false);assert.equal(r.write_authorized,false);assert.equal(r.actual_authority_granted,false);
 assert.equal(r.original_consumption_reissued,false);assert.equal(r.promotion_eligible,false);assert.equal(r.retry_authorized,false);
 assert.equal(JSON.stringify(r).includes('private'),false);assert.equal(JSON.stringify(r).includes('signature'),false);
 assert.equal(r.original_run_id,f.request.original_run_id);
});
for(const [name,mutate] of [
 ['different status',x=>x.firstMetadata.StatusCode=202],['handled error',x=>x.firstMetadata.FunctionError='Handled'],
 ['different error type',x=>x.firstResponse.errorType='KeyError'],['different writer code',x=>x.firstResponse.errorMessage='INTERRUPTED_RECOVERY_CONFIG'],
])test('no reconciliation read for '+name,async()=>{
 const input={firstMetadata:{StatusCode:200,FunctionError:'Unhandled'},firstResponse:{errorType:'ValueError',errorMessage:'INTERRUPTED_RECOVERY_FAILURE_TERMINAL_NULL_ONLY'}};
 mutate(input);const f=reconciliationFixture(input),c=await f.client();let caught;
 try{await c.readFailureContext({request:f.request});}catch(e){caught=e;}
 assert.equal(caught.recovery_reconciliation,undefined);assert.deepEqual(f.actions,['READ_FAILED_ASSURANCE_TERMINAL_CONTEXT']);
});
test('same error on another operation never performs follow-up read',async()=>{
 const f=fixture('KPMO');f.metadata={StatusCode:200,FunctionError:'Unhandled'};
 f.response={errorType:'ValueError',errorMessage:'INTERRUPTED_RECOVERY_FAILURE_TERMINAL_NULL_ONLY'};
 let caught;try{await(await f.client()).readContext({request:f.request});}catch(e){caught=e;}
 assert.equal(caught.recovery_reconciliation,undefined);assert.equal(f.calls.filter(x=>x[0]==='lambda').length,1);
});
for(const context of [{ok:true,state:'COMPLETE_VERIFIED',write_performed:false},{ok:true,state:'CONSUMED',write_performed:true},{ok:true,state:'RESERVED'}])
 test('reject unverified readback '+JSON.stringify(context),async()=>{
  const f=reconciliationFixture({context}),c=await f.client();let caught;try{await c.readFailureContext({request:f.request});}catch(e){caught=e;}
  assert.equal(caught.recovery_reconciliation.state,'READBACK_UNVERIFIED');assert.equal(caught.recovery_reconciliation.writer_context_state,null);
  assert.equal(caught.recovery_reconciliation.write_performed,null);assert.equal(caught.recovery_reconciliation.actual_authority_granted,false);
  assert.deepEqual(f.actions,['READ_FAILED_ASSURANCE_TERMINAL_CONTEXT','READ_MERGED_RECOVERY_CONTEXT']);
 });
