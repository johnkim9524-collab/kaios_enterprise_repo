// A byte-exact historical planning input, never live provider/runtime authority.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {readArchive,digest} from '../kpmo/validate-sentinel-producer-content-v1.mjs';
import {canonicalJson} from '../kpmo/lib/canonical-json-v1.mjs';
const repo='johnkim9524-collab/kaios_enterprise_repo';
const source={workflow_run_id:35129257302,artifact_id:10460765552,artifact_name:'kidults-representative-product-foundation-v1',artifact_digest:'sha256:7565f7ed7cfa37ef0cb1f4b00f7f599bc398d93ab44a9101449a314c4150ddee',validated_head:'b76c8e1a42f451f4340d771e5d7d559099aa2977',source_branch:'feat/kidults-phase2-content-data-provider-foundation'};
const archivePath='coordination/kidults/product/capsules/representative-anchor-foundation-10460765552.zip';
const capturePath='coordination/kidults/product/capsules/representative-anchor-foundation-github-capture-v1.json';
const sourceCommit='52c025f07658809956e311dd7e4ff943a4bb116d';
const archiveBlob='792a41055e6db055ef0e222268e0a9a7c12a11cb',captureBlob='2ae2e10596440372db0b26e050c5917d41a3fe67';
const official=['category-representative-product-registry-v1.json','representative-product-evidence-plan-v1.json','representative-product-gap-matrix-v1.json','representative-product-engine-alignment-v1.json','representative-product-source-sufficiency-driver-v1.json','run-manifest.json'];
const check=(ok,code)=>{if(!ok)throw Error('SEALED_ANCHOR_'+code);};
export function readSealedCanonicalAnchor({manifest,repositoryRoot=process.cwd(),repository=repo}){
  check(repository===repo,'REPOSITORY');
  check(Object.keys(manifest).sort().join(',')===['id','record_type','version','status','parent_mission','lane','source','official_input_files','input_counts','governance','production','archive_source'].sort().join(',')
    &&manifest.record_type==='representative_anchor_input_manifest'&&manifest.version==='1.0.0'&&manifest.parent_mission===344&&manifest.lane===1,'MANIFEST_FIELDS');
  check(manifest.id==='representative-anchor-input-manifest-v1'&&manifest.status==='CANONICAL_ACTIVE'&&manifest.production==='HOLD'
    &&canonicalJson(manifest.source)===canonicalJson(source),'ORIGINAL_SOURCE');
  check(canonicalJson(manifest.official_input_files)===canonicalJson(official),'OFFICIAL_FILES');
  check(manifest.input_counts?.categories===8&&manifest.input_counts.collection_scopes===32
    &&manifest.input_counts.named_anchor_products===160&&manifest.input_counts.anchors_per_scope===5
    &&manifest.input_counts.representative_qualified_products===0,'COUNTS');
  check(canonicalJson(manifest.governance)===canonicalJson({artifact_is_immutable_official_input:true,legacy_branch_is_runtime_dependency:false,artifact_may_seed_structural_preflight:true,artifact_may_seed_market_cell_planning:true,artifact_may_seed_evidence_demand_planning:true,artifact_may_self_qualify_collectible:false,artifact_may_self_qualify_representative:false,artifact_may_authorize_source_acquisition:false,artifact_may_authorize_index_or_publication:false}),'GOVERNANCE_FIELDS');
  check(['artifact_may_self_qualify_collectible','artifact_may_self_qualify_representative','artifact_may_authorize_source_acquisition','artifact_may_authorize_index_or_publication'].every(k=>manifest.governance?.[k]===false),'AUTHORITY');
  const expected={kind:'SEALED_GIT_BLOB_V1',source_commit_sha:sourceCommit,path:archivePath,blob_sha:archiveBlob,
    digest:source.artifact_digest,size_in_bytes:56075,capture_path:capturePath,capture_blob_sha:captureBlob,
    authority:'STRUCTURAL_PREFLIGHT_ONLY',github_live_metadata_verified:false};
  check(canonicalJson(manifest.archive_source)===canonicalJson(expected),'CAPSULE_BINDING');
  const root=fs.realpathSync(repositoryRoot),git=(args,binary=false)=>execFileSync('git',['-C',root,...args],{encoding:binary?undefined:'utf8',timeout:5000,maxBuffer:2*1024*1024,stdio:['ignore','pipe','pipe'],env:{...process.env,GIT_NO_LAZY_FETCH:'1',GIT_TERMINAL_PROMPT:'0'}});
  check(fs.realpathSync(git(['rev-parse','--show-toplevel']).trim())===root,'GIT_ROOT');
  const head=git(['rev-parse','HEAD']).trim();check(/^[a-f0-9]{40}$/.test(head),'HEAD');
  try{git(['merge-base','--is-ancestor',sourceCommit,head]);}catch{throw Error('SEALED_ANCHOR_ANCESTRY');}
  const readBound=(relative,blob)=>{
    for(const ref of [sourceCommit,head])check(git(['ls-tree','-z',ref,'--',relative])===`100644 blob ${blob}\t${relative}\0`,'GIT_BLOB_BINDING');
    let filename=root;
    for(const part of relative.split('/')){filename=path.join(filename,part);check(!fs.lstatSync(filename).isSymbolicLink(),'SYMLINK');}
    const stat=fs.lstatSync(filename);check(stat.isFile()&&stat.size<=2*1024*1024,'FILE');
    const committed=git(['cat-file','blob',blob],true),current=fs.readFileSync(filename);
    check(current.equals(committed),'WORKTREE_CHANGED');return current;
  };
  const bytes=readBound(archivePath,archiveBlob);check(bytes.length===56075&&digest(bytes)===source.artifact_digest,'ARCHIVE_DIGEST');
  const capture=JSON.parse(readBound(capturePath,captureBlob));
  check(capture.repository===repo&&canonicalJson(capture.source)===canonicalJson(source)
    &&capture.run?.id===source.workflow_run_id&&capture.run.head_sha===source.validated_head
    &&capture.run.head_branch===source.source_branch&&capture.run.status==='completed'&&capture.run.conclusion==='success'
    &&capture.artifact?.id===source.artifact_id&&capture.artifact.digest===source.artifact_digest&&capture.artifact.expired===false
    &&capture.artifact.workflow_run?.id===source.workflow_run_id&&capture.artifact.workflow_run.head_sha===source.validated_head
    &&Date.parse(capture.observed_at)>=Date.parse(capture.artifact.created_at)&&Date.parse(capture.observed_at)<Date.parse(capture.artifact.expires_at)
    &&capture.archive?.byte_exact_original===true&&capture.archive.blob_sha===archiveBlob
    &&capture.authority==='STRUCTURAL_PREFLIGHT_ONLY'&&capture.qualified_product_count===0
    &&capture.acquisition_authorized===false&&capture.promotion_eligible===false
    &&['production','public','g5'].every(k=>capture[k]==='HOLD'),'CAPTURE');
  const parsed=readArchive(bytes,source.artifact_digest);
  const names=parsed.members.map(m=>m.name).sort(),allowed=[...official,'representative-product-asi-expansion-queue-v1.json'].sort();
  check(canonicalJson(names)===canonicalJson(allowed)&&parsed.members.every(m=>m.encoding==='utf-8'),'ARCHIVE_MEMBERS');
  const values=new Map(parsed.members.map(m=>[m.name,JSON.parse(m.text)]));
  const registry=values.get(official[0]),run=values.get('run-manifest.json');
  check(registry.named_anchor_product_count===160&&registry.representative_qualified_product_count===0
    &&registry.acquisition_authorized===false&&run.named_anchor_products===160&&run.representative_qualified_products===0
    &&run.source_pool_promotions===0&&run.acquisition_authorized===false
    &&[...values.values()].every(v=>v.production==='HOLD'&&v.acquisition_authorized!==true),'PLANNING_ONLY');
  return {bytes,source,sourceCommit,archiveBlob,head,current_source_transport:'SEALED_GIT_BLOB',github_live_metadata_verified:false,
    authority:'STRUCTURAL_PREFLIGHT_ONLY',promotion_eligible:false};
}
