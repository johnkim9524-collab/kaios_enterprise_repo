import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const PILOT_PATH='coordination/kidults/source-intelligence/capsules/bounded-live-pilot-9290027789.json';
const DIGEST='f5f9c6eda96e1d2fae8b665b3ac903b1e924e05ad09db3a56f143f5b956de3d4';
export function verifyPinnedPilot(bytes){
  if(!Buffer.isBuffer(bytes)||bytes.length!==37808||createHash('sha256').update(bytes).digest('hex')!==DIGEST)throw Error('PILOT_EXACT_BYTES_MISMATCH');
  const d=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  if(d.id!=='kidults-product-linked-bounded-live-discovery-pilot-v2'||d.candidate_count!==2||d.candidates.length!==2||d.acquisition_authorized!==false||d.content_acquired!==false||d.production!=='HOLD'||d.candidates.some(c=>c.acquisition_authorized!==false||c.production!=='HOLD'))throw Error('PILOT_NON_AUTHORIZING_SCOPE_INVALID');
  return {id:'kidults-preflight-historical-pilot-restore-v1',state:'VERIFIED_HISTORICAL_PLANNING_INPUT',original_artifact_id:9290027789,original_archive_sha256:'sha256:c35e091c2b1b19a4240c161a4839efd4823c4a14ecea1412a55151a9edf5f821',decoded_member_sha256:'sha256:'+DIGEST,source_transport:'COMMITTED_GIT_JSON',github_live_metadata_verified:false,original_run_binding_verified:false,runtime_authority_created:false,acquisition_authorized:false,production:'HOLD'};
}
export function restorePilot({root=process.cwd(),output='input/bounded-live-discovery.json'}={}){
  const p=path.join(root,PILOT_PATH),stat=fs.lstatSync(p);if(!stat.isFile()||stat.isSymbolicLink())throw Error('PILOT_REGULAR_FILE_REQUIRED');
  const b=fs.readFileSync(p),receipt=verifyPinnedPilot(b);
  const committed=execFileSync('git',['-C',root,'show','HEAD:'+PILOT_PATH],{maxBuffer:65536,timeout:5000,env:{...process.env,GIT_NO_LAZY_FETCH:'1',GIT_TERMINAL_PROMPT:'0'}});
  verifyPinnedPilot(committed);if(!b.equals(committed))throw Error('PILOT_WORKTREE_DRIFT');
  fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,b);return receipt;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(restorePilot({output:process.argv[2]||'input/bounded-live-discovery.json'}),null,2));
