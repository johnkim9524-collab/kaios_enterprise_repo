import {test,after} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {execFileSync,spawnSync} from 'node:child_process';
import {readSealedCanonicalAnchor} from '../../../scripts/kidults/supply-chain/sealed-canonical-anchor-v1.mjs';
const root=process.cwd(),manifest=JSON.parse(fs.readFileSync('coordination/kidults/product/representative-anchor-input-manifest-v1.json'));
const parent=fs.mkdtempSync(path.join(os.tmpdir(),'sealed-anchor-tests-')),clone=path.join(parent,'checkout');
execFileSync('git',['clone','--shared','--no-checkout',root,clone],{stdio:'pipe'});
execFileSync('git',['-C',clone,'sparse-checkout','init','--cone'],{stdio:'pipe'});execFileSync('git',['-C',clone,'sparse-checkout','set','coordination/kidults/product/capsules'],{stdio:'pipe'});
execFileSync('git',['-C',clone,'checkout','--detach','52c025f07658809956e311dd7e4ff943a4bb116d'],{stdio:'pipe'});
after(()=>fs.rmSync(parent,{recursive:true,force:true}));
const read=m=>readSealedCanonicalAnchor({manifest:m,repositoryRoot:clone});
test('real original ZIP restores from committed ancestor without GitHub API or token',()=>{const r=read(manifest);assert.equal(r.bytes.length,56075);assert.equal(r.github_live_metadata_verified,false);assert.equal(r.authority,'STRUCTURAL_PREFLIGHT_ONLY');assert.equal(r.promotion_eligible,false);});
for(const [name,mutate] of [
 ['foreign original run',m=>m.source.workflow_run_id++],['foreign original artifact',m=>m.source.artifact_id++],['foreign original head',m=>m.source.validated_head='a'.repeat(40)],
 ['other source branch',m=>m.source.source_branch='main'],['borrowed digest',m=>m.source.artifact_digest='sha256:'+'0'.repeat(64)],
 ['arbitrary capsule path',m=>m.archive_source.path='/tmp/archive.zip'],['parent traversal',m=>m.archive_source.path='../archive.zip'],['unknown transport',m=>m.archive_source.kind='OTHER'],
 ['unbound source commit',m=>m.archive_source.source_commit_sha='a'.repeat(40)],['unbound blob',m=>m.archive_source.blob_sha='a'.repeat(40)],['extra capsule authority',m=>m.archive_source.promotion_eligible=true],
 ['live proof claim',m=>m.archive_source.github_live_metadata_verified=true],['duplicate official file',m=>m.official_input_files.push(m.official_input_files[0])],
 ['qualified products',m=>m.input_counts.representative_qualified_products=1],['named product expansion',m=>m.input_counts.named_anchor_products=161],
 ['collection acquisition',m=>m.governance.artifact_may_authorize_source_acquisition=true],['self qualification',m=>m.governance.artifact_may_self_qualify_representative=true],
 ['publication',m=>m.governance.artifact_may_authorize_index_or_publication=true],['production release',m=>m.production='RELEASE'],
 ['unknown authority field',m=>m.provider_activation=true],['unknown governance field',m=>m.governance.provider_activation=true]
])test('sealed planning input rejects '+name,()=>{const m=structuredClone(manifest);mutate(m);assert.throws(()=>read(m),/SEALED_ANCHOR/);});
test('changed working archive is rejected and never used as a new original',()=>{const p=path.join(clone,manifest.archive_source.path),b=fs.readFileSync(p);try{fs.writeFileSync(p,Buffer.alloc(b.length));assert.throws(()=>read(manifest),/WORKTREE_CHANGED/);}finally{fs.writeFileSync(p,b);}});
test('symlink archive is rejected even when target contains the exact bytes',()=>{const p=path.join(clone,manifest.archive_source.path),b=fs.readFileSync(p),target=path.join(parent,'borrowed.zip');try{fs.writeFileSync(target,b);fs.unlinkSync(p);fs.symlinkSync(target,p);assert.throws(()=>read(manifest),/SYMLINK/);}finally{fs.unlinkSync(p);fs.writeFileSync(p,b);}});
test('changed capture metadata is rejected before historical facts can be rewritten',()=>{const p=path.join(clone,manifest.archive_source.capture_path),b=fs.readFileSync(p);try{fs.writeFileSync(p,'{"promotion_eligible":true}');assert.throws(()=>read(manifest),/WORKTREE_CHANGED/);}finally{fs.writeFileSync(p,b);}});
test('a checkout predating the capsule cannot claim its source ancestry',()=>{const old=execFileSync('git',['-C',clone,'rev-parse','HEAD^'],{encoding:'utf8'}).trim();try{execFileSync('git',['-C',clone,'checkout','--detach',old],{stdio:'pipe'});assert.throws(()=>read(manifest),/ANCESTRY/);}finally{execFileSync('git',['-C',clone,'checkout','--detach',manifest.archive_source.source_commit_sha],{stdio:'pipe'});}});
test('real restore CLI is offline, byte-exact, and makes no live/qualified/runtime authority claim',()=>{
 const guard=path.join(parent,'no-network.mjs');fs.writeFileSync(guard,"globalThis.fetch=()=>{throw Error('UNEXPECTED_NETWORK')};");
 const output=path.join(parent,'restored.zip'),receipt=path.join(parent,'receipt.json'),env={...process.env,GITHUB_REPOSITORY:'johnkim9524-collab/kaios_enterprise_repo',GH_TOKEN:'invalid-expired-token',GITHUB_TOKEN:'invalid-expired-token'};
 const result=spawnSync(process.execPath,['--import',guard,'scripts/kidults/supply-chain/restore-canonical-anchor-artifact-v1.mjs',output,receipt],{cwd:root,env,encoding:'utf8'});assert.equal(result.status,0,result.stderr);
 const r=JSON.parse(fs.readFileSync(receipt));assert.equal(r.github_live_metadata_verified,false);assert.equal(r.exact_run_bound,false);assert.equal(r.exact_artifact_bound,false);assert.equal(r.exact_git_source_bound,true);assert.equal(r.representative_qualified_products,0);assert.equal(r.acquisition_authorized,false);assert.equal(r.promotion_eligible,false);assert.equal(r.original_artifact_current_availability,'NOT_OBSERVED');
 assert.deepEqual(fs.readFileSync(output),fs.readFileSync(manifest.archive_source.path));
 const extracted=path.join(parent,'extracted');execFileSync('python3',['-c','import sys,zipfile;zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])',output,extracted]);
 const validation=spawnSync(process.execPath,['scripts/kidults/supply-chain/validate-canonical-anchor-extracted-v1.mjs',extracted],{cwd:root,env,encoding:'utf8'});assert.equal(validation.status,0,validation.stderr);assert.equal(JSON.parse(validation.stdout).official_file_count,6);
});
test('malformed selected capsule fails without an HTTP fallback or output overwrite',()=>{
 const invalid=path.join(parent,'invalid-manifest.json'),m=structuredClone(manifest);m.archive_source.kind='INVALID';fs.writeFileSync(invalid,JSON.stringify(m));
 const output=path.join(parent,'preserved.zip');fs.writeFileSync(output,'preserved');const guard=path.join(parent,'no-network.mjs');fs.writeFileSync(guard,"globalThis.fetch=()=>{throw Error('UNEXPECTED_NETWORK')};");
 const result=spawnSync(process.execPath,['--import',guard,'scripts/kidults/supply-chain/restore-canonical-anchor-artifact-v1.mjs',output],{cwd:root,env:{...process.env,KIDULTS_ANCHOR_MANIFEST:invalid},encoding:'utf8'});assert.equal(result.status,1);assert.match(result.stderr,/SEALED_ANCHOR_CAPSULE_BINDING/);assert.equal(fs.readFileSync(output,'utf8'),'preserved');assert.equal(result.stderr.includes('UNEXPECTED_NETWORK'),false);
});

test('a real shallow checkout fails closed; full filtered history restores the same sealed input',()=>{
 const shallow=path.join(parent,'shallow'),oldHead=execFileSync('git',['-C',clone,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
 try{
  const tree=execFileSync('git',['-C',clone,'rev-parse','HEAD^{tree}'],{encoding:'utf8'}).trim();let head=oldHead;
  for(let i=0;i<20;i++)head=execFileSync('git',['-C',clone,'-c','user.name=fixture','-c','user.email=fixture@example.invalid','commit-tree',tree,'-p',head],{input:'bounded future history fixture\n',encoding:'utf8'}).trim();
  execFileSync('git',['-C',clone,'update-ref','HEAD',head],{stdio:'pipe'});execFileSync('git',['-C',clone,'config','uploadpack.allowFilter','true'],{stdio:'pipe'});execFileSync('git',['-C',clone,'config','uploadpack.allowReachableSHA1InWant','true'],{stdio:'pipe'});
  execFileSync('git',['clone','--depth','16','--filter=blob:none','--no-checkout','file://'+clone,shallow],{stdio:'pipe'});
  execFileSync('git',['-C',shallow,'sparse-checkout','init','--cone'],{stdio:'pipe'});execFileSync('git',['-C',shallow,'sparse-checkout','set','coordination/kidults/product/capsules'],{stdio:'pipe'});execFileSync('git',['-C',shallow,'checkout','--detach',head],{stdio:'pipe'});
  assert.throws(()=>readSealedCanonicalAnchor({manifest,repositoryRoot:shallow}),/ANCESTRY/);
  execFileSync('git',['-C',shallow,'fetch','--unshallow','--filter=blob:none','origin'],{stdio:'pipe'});
  const r=readSealedCanonicalAnchor({manifest,repositoryRoot:shallow});assert.equal(r.bytes.length,56075);assert.equal(r.github_live_metadata_verified,false);assert.equal(r.promotion_eligible,false);
 }finally{execFileSync('git',['-C',clone,'update-ref','HEAD',oldHead],{stdio:'pipe'});}
});
test('all actual anchor consumers and the independent Foundation job preserve graph with bounded blob transfer',()=>{
 const output=execFileSync('python3',['-c',`import pathlib,yaml,json
paths=[p for p in pathlib.Path('.github/workflows').glob('*.yml') if 'restore-canonical-anchor-artifact-v1.mjs' in p.read_text()]
seen=[]
for p in paths:
 d=yaml.safe_load(p.read_text())
 for name,j in d['jobs'].items():
  if any('restore-canonical-anchor-artifact-v1.mjs' in s.get('run','') for s in j.get('steps',[])):
   s=next(s for s in j['steps'] if s.get('uses','').startswith('actions/checkout@'));w=s['with']
   assert w['fetch-depth']==0 and w['filter']=='blob:none' and w['persist-credentials'] is False
   assert 'token' not in w and 'allow-unsafe-pr-checkout' not in w
   seen.append(str(p))
d=yaml.safe_load(pathlib.Path('.github/workflows/ci-validation.yml').read_text())
foundation=next(j for j in d['jobs'].values() if j.get('name')=='Validate KAIOS Foundation')
w=next(s for s in foundation['steps'] if s.get('uses','').startswith('actions/checkout@'))['with']
assert w['fetch-depth']==0 and w['filter']=='blob:none' and w['persist-credentials'] is False
print(json.dumps(seen))`],{cwd:root,encoding:'utf8'});assert.equal(JSON.parse(output).length,11);
});
