import {EXPLICIT_EXECUTION_CONTROLS,classifyApprovalInventoryPath,routeAuthorizationControl} from '../../../governance/lib/approval-policy-routing-v1.mjs';
import {matchesReviewedImmutableTransportRepair} from './reviewed-immutable-transport-repair-v1.mjs';
import crypto from 'node:crypto';
import {delegatedTransitionId,matchesFinalizerReadyEvidenceTransitionFile} from './natural-reserve-transition-exception-v1.mjs';

const hash=value=>`sha256:${crypto.createHash('sha256').update(String(value)).digest('hex')}`;
// Independent copy of the exact, non-authorizing Owner-review routing
// bootstrap. Keep this matcher separate from the primary verifier so a
// candidate cannot register its own repair or make both checks share logic.
const ownerReviewRoutingRepair=Object.freeze({
  paths:Object.freeze([
    'coordination/kidults/governance/autonomous-internal-landing-policy-v1.json',
    'scripts/kidults/kpmo/run-autonomous-dispatcher-v1.mjs',
    'tests/kidults/staging-operations/autonomous-dispatcher-v1.test.mjs',
  ]),
  digests:Object.freeze({
    'scripts/kidults/kpmo/run-autonomous-dispatcher-v1.mjs':Object.freeze([
      'sha256:d3e4646a549c508d4d79784cf5f6b025dd21ba6aae3f3c6eb03afa399eafde73',
      'sha256:73af3b08d778756acbb6aba65f961c5bb0d253265e3be608687cea98f3c4f768',
    ]),
    'tests/kidults/staging-operations/autonomous-dispatcher-v1.test.mjs':Object.freeze([
      'sha256:3d4888562344b21dfc7028c456e91ac0e32c66c38d23286bf58620e3d3bb6679',
      'sha256:fd3a7f93b6e6bd752ccc84af7f7b276baae1f6af12f9b1e4de46eb2670eb7bbf',
    ]),
  }),
});
export const independentlyMatchesOwnerReviewRoutingRepairDigest=(filename,baseDigest,headDigest)=>{
  const pair=ownerReviewRoutingRepair.digests[filename];
  return Array.isArray(pair)&&pair[0]===baseDigest&&pair[1]===headDigest;
};
export const independentlyMatchesOwnerReviewRoutingPolicyDelta=(baseContent,headContent,dispatcherBaseDigest,dispatcherHeadDigest,protectedPolicy)=>{
  let base,next;try{base=JSON.parse(baseContent);next=JSON.parse(headContent);}catch{return false;}
  if(JSON.stringify(base)!==JSON.stringify(protectedPolicy))return false;
  const v=/^(\d+)\.(\d+)\.(\d+)$/.exec(base.version||'');
  if(!v||next.version!==`${Number(v[1])}.${Number(v[2])+1}.0`)return false;
  const previous=base.capability_guard_owner_review_handoff?.trigger_codes;
  const proposed=next.capability_guard_owner_review_handoff?.trigger_codes;
  if(!Array.isArray(previous)||!Array.isArray(proposed))return false;
  const expected=[...previous,'DISPATCH_OWNER_RESERVED_ACTION'].sort();
  if(JSON.stringify([...proposed].sort())!==JSON.stringify(expected))return false;
  const sourcePath='scripts/kidults/kpmo/run-autonomous-dispatcher-v1.mjs';
  if(base.immutable_source_read_profile?.source_sha256?.[sourcePath]!==dispatcherBaseDigest
    ||next.immutable_source_read_profile?.source_sha256?.[sourcePath]!==dispatcherHeadDigest)return false;
  const comparable=structuredClone(next);
  const normalizedBase=structuredClone(base);
  comparable.version=base.version;
  comparable.capability_guard_owner_review_handoff.trigger_codes=[...previous].sort();
  normalizedBase.capability_guard_owner_review_handoff.trigger_codes=[...previous].sort();
  comparable.immutable_source_read_profile.source_sha256[sourcePath]=dispatcherBaseDigest;
  return JSON.stringify(comparable)===JSON.stringify(normalizedBase);
};
const independentlyMatchesOwnerReviewRoutingRepair=(file,files,protectedPolicy)=>{
  if(!ownerReviewRoutingRepair.paths.includes(file?.filename))return false;
  const core=files.filter(item=>ownerReviewRoutingRepair.paths.includes(item?.filename));
  if(core.length!==3||ownerReviewRoutingRepair.paths.some(name=>files.filter(item=>item?.filename===name).length!==1))return false;
  for(const item of files){
    if(!ownerReviewRoutingRepair.paths.includes(item?.filename)
      &&item?.filename!=='coordination/kidults/governance/approval-policy-file-manifest-v1.json'
      &&item?.filename!=='coordination/kidults/governance/approval-policy-inventory-v1.json')return false;
  }
  for(const name of ownerReviewRoutingRepair.paths){
    const item=files.find(value=>value.filename===name);
    if(item.status!=='modified')return false;
    if(name!==ownerReviewRoutingRepair.paths[0]
      &&!independentlyMatchesOwnerReviewRoutingRepairDigest(name,hash(item.base_content),hash(item.head_content)))return false;
  }
  const policyFile=files.find(item=>item.filename===ownerReviewRoutingRepair.paths[0]);
  const source=files.find(item=>item.filename===ownerReviewRoutingRepair.paths[1]);
  return file.status==='modified'&&independentlyMatchesOwnerReviewRoutingPolicyDelta(
    policyFile.base_content,policyFile.head_content,hash(source.base_content),hash(source.head_content),protectedPolicy,
  );
};
// Independent verification of derived dispatcher hashes. The source delta
// is evaluated separately under the protected policy; it cannot refresh this
// verifier, the source reader, transport, profile validator or quarantine.
// Candidate policy updates cannot add transitions or refresh any trust root.
const independentlyMatchesDiagnosticProfileRebind=(entry,files,protectedPolicy)=>{
  if(entry.filename!=='coordination/kidults/governance/autonomous-internal-landing-policy-v1.json'||entry.status!=='modified'||files.filter(file=>file.filename===entry.filename).length!==1)return false;
  let left,right;try{left=JSON.parse(entry.base_content);right=JSON.parse(entry.head_content);}catch{return false;}
  if(JSON.stringify(left)!==JSON.stringify(protectedPolicy))return false;
  const oldRegistry=left.immutable_source_read_profile?.source_sha256,newRegistry=right.immutable_source_read_profile?.source_sha256;
  if(!oldRegistry||!newRegistry)return false;
  const names=Object.keys(oldRegistry);
  if(names.length!==Object.keys(newRegistry).length||names.some(name=>!Object.hasOwn(newRegistry,name)))return false;
  const dispatcher='scripts/kidults/kpmo/run-autonomous-dispatcher-v1.mjs';let changes=0;
  for(const name of names){
    if(oldRegistry[name]===newRegistry[name]){
      if(name!==dispatcher&&files.some(file=>file.filename===name&&(file.status!=='modified'||file.base_content!==file.head_content)))return false;
      continue;
    }
    if(name!==dispatcher||++changes!==1)return false;
    const sources=files.filter(file=>file.filename===name);
    if(sources.length!==1)return false;
    const sourcePair=sources[0];
    let remaining=sourcePair.head_content.startsWith(sourcePair.base_content)?sourcePair.head_content.substring(sourcePair.base_content.length):null;
    let safeComments=sourcePair.status==='modified'&&sourcePair.base_content.endsWith('\n')&&typeof remaining==='string'&&remaining.length>0;
    if(safeComments)for(const line of remaining.split('\n').slice(0,-1)){
      if(!line.startsWith('//')||[...line].some(char=>char.charCodeAt(0)<32||char.charCodeAt(0)>126)){safeComments=false;break;}
    }
    safeComments=safeComments&&remaining.endsWith('\n');
    if(!safeComments&&!independentlyMatchesOwnerReviewRoutingRepair(sourcePair,files,protectedPolicy))return false;
    const source=sources[0];
    if(hash(source.base_content)!==oldRegistry[name]||hash(source.head_content)!==newRegistry[name])return false;
  }
  if(changes!==1)return false;
  const lhs=structuredClone(left),rhs=structuredClone(right);
  delete lhs.immutable_source_read_profile.source_sha256[dispatcher];delete rhs.immutable_source_read_profile.source_sha256[dispatcher];
  return JSON.stringify(lhs)===JSON.stringify(rhs);
};
const deny=(code,detail='')=>{const error=new Error(detail?`${code}:${detail}`:code);error.code=code;throw error};
const governed=(name,policy)=>(policy.delegated_internal_path_prefixes||[]).some(prefix=>name.startsWith(prefix))||(policy.delegated_internal_exact_path_exceptions||[]).includes(name);
// A display-only replacement is deliberately narrower than YAML capability
// equivalence: one known top-level scalar changes, all other bytes stay exact.
const handoffDisplayDelta=file=>{
  if(file.filename!=='.github/workflows/kidults-direct-owner-landing-handoff-v1.yml'||file.status!=='modified')return false;
  const extract=source=>{
    const lines=source.match(/[^\n]*\n|[^\n]+$/g)||[];
    const positions=lines.map((line,index)=>/^run-name:/.test(line)?index:-1).filter(index=>index>=0);
    if(positions.length!==1)return null;
    const start=positions[0],header=lines[start].replace(/\r?\n$/,''),value=header.slice('run-name:'.length).trim();
    let end=start+1,scalar;
    if(value==='>-'){
      const content=[];
      while(end<lines.length&&/^ {2,}\S/.test(lines[end])){content.push(lines[end].trim());end+=1;}
      if(!content.length||content.length>8)return null;
      scalar=content.join(' ');
    }else{
      // JSON double-quoted scalars are a bounded subset of YAML quoted scalars.
      try{scalar=JSON.parse(value);}catch{return null;}
      if(typeof scalar!=='string')return null;
    }
    if(scalar.length>1024||/[\r\n]/.test(scalar))return null;
    return {scalar,outside:lines.slice(0,start).concat(lines.slice(end)).join('')};
  };
  const a=extract(file.base_content),b=extract(file.head_content);
  if(!a||!b||a.outside!==b.outside)return false;
  const old='KIDULTS Direct Owner Handoff PR #${{ inputs.pull_request_number }} @ ${{ inputs.expected_head_sha }} / ${{ inputs.handoff_authorization_id }}';
  const next="${{ github.event_name == 'workflow_dispatch' && format('KIDULTS Direct Owner Handoff PR #{0} @ {1} / {2}', inputs.pull_request_number, inputs.expected_head_sha, inputs.handoff_authorization_id) || format('KIDULTS Direct Owner Approval-Mutation Watch issue #{0} / {1}', github.event.issue.number, github.event.action) }}";
  // Exact display grammar preserves the consumer's handoff run-name contract.
  // No secrets, token, vars, new expression references or executable YAML are admitted.
  return a.scalar===old&&b.scalar===next;
};
const securityLine=/\b(on|workflow_dispatch|repository_dispatch|schedule|push|pull_request_target|permissions|environment|if|secrets|vars|id-token|contents|pull-requests|actions|checks|statuses|deployments|packages|issues|repository-projects|security-events|curl|wget|gh api|aws |gcloud |terraform|kubectl|https?:\/\/|force:|fail|throw|assert|deny|forbid|hold|required|quarantine|owner[_-]?reserved|authorization|credential|production|public|g5)\b/i;
const normalize=source=>source.split('\n').map(line=>line.replace(/\s+#.*$/,'').trim()).filter(Boolean);
const stopAction=/\b(throw|fail|deny|assert|forbid|quarantine)\b/;
const ignoredIdentifiers=new Set(['if','else','throw','new','return','const','let','var','function','true','false','null','undefined','await','async','typeof','instanceof','in','of','this']);
const normalizedScript=value=>independentScriptLayout(String(value),'comparison').parts.join(' ');
const derivedApprovalMetadataPaths=new Set([
  'coordination/kidults/governance/approval-policy-file-manifest-v1.json',
  'coordination/kidults/governance/approval-policy-inventory-v1.json',
]);
const normalizedDerivedApprovalMetadata=(source,filename)=>{
  let value; try { value=JSON.parse(source||'{}'); } catch { deny('INDEPENDENT_JSON_PARSE_FAILED',filename); }
  value=structuredClone(value);
  if(filename.endsWith('approval-policy-file-manifest-v1.json')){
    value.manifest_sha256='DERIVED';
    for(const entry of value.files||[]){entry.git_blob='DERIVED';entry.sha256='DERIVED';}
  } else if(filename.endsWith('approval-policy-inventory-v1.json')) {
    value.manifest_sha256='DERIVED';
    if(value.audit) value.audit.manifest_sha256='DERIVED';
  }
  return value;
};
const isDerivedApprovalMetadataShape=(source,filename)=>{
  try {
    const value=JSON.parse(source||'{}');
    if(filename.endsWith('approval-policy-file-manifest-v1.json')) return Array.isArray(value.files)&&typeof value.manifest_sha256==='string';
    if(filename.endsWith('approval-policy-inventory-v1.json')) return typeof value.manifest_sha256==='string'
      && typeof value.audit?.manifest_sha256==='string'
      && value.manifest_sha256===value.audit.manifest_sha256;
  } catch {}
  return false;
};
const independentlyVerifyAuditGrowth=(before,after,filename,files)=>{
  const manifest='coordination/kidults/governance/approval-policy-file-manifest-v1.json';
  const pair=filename===manifest?{base_content:before,head_content:after}:files.find(f=>f.filename===manifest);
  if(!pair)return false;
  let base,head;try{base=JSON.parse(pair.base_content);head=JSON.parse(pair.head_content);}catch{return false;}
  if(!Array.isArray(base.files)||!Array.isArray(head.files)||head.files.length<=base.files.length)return false;
  const reject=()=>deny('INDEPENDENT_DERIVED_METADATA_SCOPE_CHANGED',filename);
  const remaining=new Map(base.files.map(e=>[e.path,e]));
  if(remaining.size!==base.files.length)reject();
  const seen=new Set(),newControls=[],additions=[];
  const expected=structuredClone(base);
  expected.files=[];
  for(const entry of head.files){
    if(typeof entry.path!=='string'||seen.has(entry.path))reject();seen.add(entry.path);
    const old=remaining.get(entry.path);
    if(old){
      const copy=structuredClone(old);copy.git_blob=entry.git_blob;copy.sha256=entry.sha256;
      expected.files.push(copy);remaining.delete(entry.path);continue;
    }
    const candidates=files.filter(file=>file.filename===entry.path);
    if(candidates.length!==1||candidates[0].base_content!==''||typeof candidates[0].head_content!=='string')reject();
    const source=candidates[0].head_content,body=Buffer.from(source);
    if(!EXPLICIT_EXECUTION_CONTROLS.includes(entry.path)&&!new RegExp(base.scan.pattern).test(source))reject();
    const object=crypto.createHash('sha1');object.update('blob '+body.byteLength);object.update(Buffer.from([0]));object.update(body);
    const classification=classifyApprovalInventoryPath(entry.path);
    const generated={path:entry.path,classification,git_blob:object.digest('hex'),sha256:hash(source)};
    if(classification==='EXECUTION_AUTHORIZATION_CONTROL'){
      generated.authorization_routing=routeAuthorizationControl(entry.path,source);
      if(generated.authorization_routing.coverage.mode!=='EXEMPTION')reject();
      newControls.push(generated);
    }
    expected.files.push(generated);additions.push(generated);
  }
  if(remaining.size||base.scan?.file_count!==base.files.length)reject();
  // Git's manifest ordering compares code units, not locale collation.
  expected.files.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
  expected.scan.file_count=expected.files.length;
  expected.manifest_sha256=hash(JSON.stringify(expected.files));
  if(JSON.stringify(expected)!==JSON.stringify(head))reject();
  if(filename!==manifest){
    const expectedInventory=JSON.parse(before),actual=JSON.parse(after);
    if(!Number.isSafeInteger(expectedInventory.audit?.approval_related_files_reviewed))reject();
    expectedInventory.manifest_sha256=head.manifest_sha256;
    expectedInventory.audit.manifest_sha256=head.manifest_sha256;
    expectedInventory.audit.approval_related_files_reviewed+=additions.length;
    const coverage=expectedInventory.audit.routing_coverage;
    coverage.execution_authorization_controls+=newControls.length;
    coverage.exemptions+=newControls.length;
    for(const entry of newControls){const route=entry.authorization_routing.route;coverage.route_counts[route]=(coverage.route_counts[route]||0)+1;}
    coverage.route_counts=Object.fromEntries(Object.entries(coverage.route_counts).sort());
    if(JSON.stringify(expectedInventory)!==JSON.stringify(actual))reject();
  }
  return true;
};
// A source revision is audit metadata only when both inventories remain bound
// and every changed content digest is recomputed from the exact changed bytes.
const independentlyVerifyInventoryRevisionRefresh=(files,filename)=>{
  const mp='coordination/kidults/governance/approval-policy-file-manifest-v1.json';
  const ip='coordination/kidults/governance/approval-policy-inventory-v1.json';
  const mf=files.filter(f=>f.filename===mp),inf=files.filter(f=>f.filename===ip);
  if(mf.length!==1||inf.length!==1)return false;
  let a,b,i,j;try{a=JSON.parse(mf[0].base_content);b=JSON.parse(mf[0].head_content);i=JSON.parse(inf[0].base_content);j=JSON.parse(inf[0].head_content);}catch{return false;}
  if(a.revision===b.revision&&i.audit?.baseline_sha===j.audit?.baseline_sha)return false;
  const bad=()=>deny('INDEPENDENT_DERIVED_METADATA_SCOPE_CHANGED',filename);
  if(!/^[0-9a-f]{40}$/.test(a.revision||'')||!/^[0-9a-f]{40}$/.test(b.revision||'')
    ||i.audit?.baseline_sha!==a.revision||j.audit?.baseline_sha!==b.revision)bad();
  if(!Array.isArray(a.files)||!Array.isArray(b.files)||b.files.length<a.files.length)return false;
  if(b.scan?.file_count!==b.files.length||a.scan?.file_count!==a.files.length
    ||b.manifest_sha256!==hash(JSON.stringify(b.files))
    ||j.manifest_sha256!==b.manifest_sha256||j.audit?.manifest_sha256!==b.manifest_sha256)bad();
  const seen=new Set(),headByPath=new Map();
  for(const next of b.files){if(seen.has(next.path))bad();seen.add(next.path);headByPath.set(next.path,next);}
  for(const old of a.files){
    const next=headByPath.get(old.path);if(!next)bad();
    const clean=value=>{const copy=structuredClone(value);copy.git_blob='DERIVED';copy.sha256='DERIVED';return copy;};
    if(JSON.stringify(clean(old))!==JSON.stringify(clean(next)))bad();
    if(old.git_blob===next.git_blob&&old.sha256===next.sha256)continue;
    const source=files.filter(f=>f.filename===next.path);
    if(source.length!==1||typeof source[0].head_content!=='string')bad();
    const bytes=Buffer.from(source[0].head_content,'utf8');
    const blob=crypto.createHash('sha1').update(Buffer.concat([Buffer.from('blob '+bytes.length+'\0'),bytes])).digest('hex');
    if(next.git_blob!==blob||next.sha256!==hash(source[0].head_content))bad();
  }
  if(b.files.length>a.files.length){
    const normalizedFiles=files.map(file=>{
      if(file.filename===mp){const value=structuredClone(b);value.revision=a.revision;return {...file,head_content:JSON.stringify(value)};}
      if(file.filename===ip){const value=structuredClone(j);value.audit.baseline_sha=i.audit.baseline_sha;return {...file,head_content:JSON.stringify(value)};}
      return file;
    });
    const target=normalizedFiles.find(file=>file.filename===filename);
    if(!target||!independentlyVerifyAuditGrowth(target.base_content,target.head_content,filename,normalizedFiles))bad();
    return true;
  }
  const left=normalizedDerivedApprovalMetadata(JSON.stringify(a),mp),right=normalizedDerivedApprovalMetadata(JSON.stringify(b),mp);
  right.revision=left.revision;
  const il=normalizedDerivedApprovalMetadata(JSON.stringify(i),ip),ir=normalizedDerivedApprovalMetadata(JSON.stringify(j),ip);
  ir.audit.baseline_sha=il.audit.baseline_sha;
  if(JSON.stringify(left)!==JSON.stringify(right)||JSON.stringify(il)!==JSON.stringify(ir))bad();
  return true;
};

const verifyDerivedApprovalMetadata=(before,after,filename,files)=>{
  if(independentlyVerifyInventoryRevisionRefresh(files,filename))return;
  if(independentlyVerifyAuditGrowth(before,after,filename,files))return;
  if(JSON.stringify(normalizedDerivedApprovalMetadata(before,filename))!==JSON.stringify(normalizedDerivedApprovalMetadata(after,filename))) deny('INDEPENDENT_DERIVED_METADATA_SCOPE_CHANGED',filename);
};

const autonomousPolicyAuthorityFields=['immutable_source_read_profile','protected_code_repair','owner_reserved_actions','owner_reserved_path_prefixes','owner_reserved_exact_paths','delegated_internal_path_prefixes','owner_reserved_added_patch_patterns','delegated_internal_exact_path_exceptions','delegated_internal_transition_exceptions','scope_classification','semantic_self_governance','approval_quorum','eligible_all_required'];
const ai020PolicyPath='coordination/kidults/governance/delegated-autonomous-internal-authority-policy-v1.json';
const boundedAi020Recovery=Object.freeze({
  unknown_classification:'BOUNDED_READ_ONLY_RECLASSIFICATION_THEN_OWNER_IF_UNRESOLVED',
  maximum_reclassification_attempts:2,
  repository_mutation_during_reclassification:false,
  conflicting_authority:'HOLD_UNTIL_FRESH_MACHINE_CLASSIFICATION',
  stale_replayed_or_scope_drifted_authority:'HOLD_REQUIRE_FRESH_EXACT_BINDING',
  owner_escalation_for_unknown_only_after_unresolved_reclassification:true,
});
const matchesBoundedAi020Recovery=(before,after)=>{
  let left,right;try{left=JSON.parse(before||'{}');right=JSON.parse(after||'{}')}catch{return false;}
  const version=/^(\d+)\.(\d+)\.(\d+)$/.exec(left.version||'');
  if(left.id!=='AI-020'||left.accountability_transfer!==false
    ||left.unknown_or_conflict!=='FAIL_CLOSED_OWNER_REQUIRED'||left.classification_recovery!==undefined
    ||!version||right.version!==`${Number(version[1])}.${Number(version[2])+1}.0`
    ||JSON.stringify(right.classification_recovery)!==JSON.stringify(boundedAi020Recovery)
    ||Object.hasOwn(right,'unknown_or_conflict'))return false;
  const normalizedLeft=structuredClone(left),normalizedRight=structuredClone(right);
  delete normalizedLeft.version;delete normalizedLeft.unknown_or_conflict;
  delete normalizedRight.version;delete normalizedRight.classification_recovery;
  return JSON.stringify(normalizedLeft)===JSON.stringify(normalizedRight);
};
const verifyBoundedAi020Recovery=(before,after,filename,files)=>{
  if(filename!==ai020PolicyPath)return false;
  const entries=files.filter(file=>file.filename===filename);
  if(entries.length!==1||entries[0].status!=='modified'||!matchesBoundedAi020Recovery(before,after))deny('INDEPENDENT_AI020_POLICY_DELTA_OUTSIDE_BOUNDED_READ_ONLY_RECOVERY',filename);
  return true;
};
const independentlyMatchesExactAi020VerifierProfileRefresh=(before,after,files)=>{
  const paths=['scripts/kidults/kpmo/lib/semantic-capability-delta-v1.mjs','scripts/kidults/kpmo/lib/independent-capability-verifier-v1.mjs'];
  let left,right;try{left=JSON.parse(before||'{}');right=JSON.parse(after||'{}')}catch{return false;}
  const a=left.immutable_source_read_profile,b=right.immutable_source_read_profile;
  if(!a?.source_sha256||!b?.source_sha256||JSON.stringify(Object.keys(a.source_sha256).sort())!==JSON.stringify(Object.keys(b.source_sha256).sort()))return false;
  const metadata=profile=>{const value=structuredClone(profile);delete value.source_sha256;return value;};
  if(JSON.stringify(metadata(a))!==JSON.stringify(metadata(b)))return false;
  const ai020Path='coordination/kidults/governance/delegated-autonomous-internal-authority-policy-v1.json';
  const ownerPaths=left.owner_reserved_exact_paths;
  const ai020Files=files.filter(file=>file.filename===ai020Path);
  if(!Array.isArray(ownerPaths)||ownerPaths.filter(path=>path===ai020Path).length!==1
    ||right.owner_reserved_exact_paths?.includes(ai020Path)||ai020Files.length!==1||ai020Files[0].status!=='modified'
    ||!matchesBoundedAi020Recovery(ai020Files[0].base_content,ai020Files[0].head_content))return false;
  const oldPolicy=structuredClone(left),newPolicy=structuredClone(right);delete oldPolicy.immutable_source_read_profile;delete newPolicy.immutable_source_read_profile;
  oldPolicy.owner_reserved_exact_paths=oldPolicy.owner_reserved_exact_paths.filter(path=>path!==ai020Path);
  if(JSON.stringify(oldPolicy)!==JSON.stringify(newPolicy))return false;
  const changed=Object.keys(a.source_sha256).filter(path=>a.source_sha256[path]!==b.source_sha256[path]).sort();
  if(JSON.stringify(changed)!==JSON.stringify(paths.slice().sort()))return false;
  return paths.every(path=>{
    const pair=files.filter(file=>file.filename===path);
    return pair.length===1&&pair[0].status==='modified'
      &&a.source_sha256[path]===hash(pair[0].base_content)&&b.source_sha256[path]===hash(pair[0].head_content);
  });
};
const verifyAutonomousPolicyAuthorityFields=(before,after,filename,files)=>{
  if(filename!=='coordination/kidults/governance/autonomous-internal-landing-policy-v1.json') return;
  let left,right; try {left=JSON.parse(before||'{}');right=JSON.parse(after||'{}')} catch {deny('INDEPENDENT_JSON_PARSE_FAILED',filename)}
  for(const key of autonomousPolicyAuthorityFields) if(JSON.stringify(left[key])!==JSON.stringify(right[key])){
    if(key==='immutable_source_read_profile'&&independentlyMatchesExactAi020VerifierProfileRefresh(before,after,files))continue;
    deny('INDEPENDENT_AUTHORITY_POLICY_CHANGED',filename+':'+key);
  }
};

// Independent structural recomputation. Unlike the primary token graph, this
// walks balanced source spans and reconstructs predicate bindings directly
// from immutable source text. Unsupported or ambiguous balance fails closed.
// Independent lexical spans: opaque literal bytes stay in the comparison,
// while only executable text participates in structural searches. Template
// expressions are executable; their surrounding template text is opaque.
const independentScriptLayout=(source,filename)=>{
  const visible=source.split(''),parts=[];let index=0,lastTokenEnd=0;
  const fail=()=>deny('INDEPENDENT_SCRIPT_PARSE_FAILED',`${filename}:offset-${index}`);
  const emit=(start,end,opaque=false,comment=false)=>{
    if(!comment){parts.push(source.slice(start,end));lastTokenEnd=end;}
    if(opaque||comment)for(let at=start;at<end;at+=1)if(source[at]!=='\n'&&source[at]!=='\r')visible[at]=' ';
  };
  const quoted=quote=>{const start=index++;let closed=false;
    while(index<source.length){const char=source[index++];if(char==='\\'){if(index>=source.length)fail();index+=1;continue;}if(char===quote){closed=true;break;}if(char==='\n'||char==='\r')fail();}
    if(!closed)fail();emit(start,index,true);
  };
  const regexp=()=>{const start=index++;let inClass=false,closed=false;
    while(index<source.length){const char=source[index++];if(char==='\n'||char==='\r')fail();if(char==='\\'){if(index>=source.length||/[\r\n]/.test(source[index]))fail();index+=1;continue;}if(char==='['&&!inClass)inClass=true;else if(char===']'&&inClass)inClass=false;else if(char==='/'&&!inClass){closed=true;break;}}
    if(!closed||inClass)fail();const flagStart=index;while(/[\w$]/.test(source[index]||''))index+=1;
    // Unicode-set (v) nested classes require a different lexical grammar.
    // Unsupported syntax stays closed rather than guessing its delimiter.
    const flags=source.slice(flagStart,index);if(!/^[dgimsuy]*$/.test(flags)||new Set(flags).size!==flags.length)fail();
    try{new RegExp(source.slice(start+1,flagStart-1),flags);}catch{fail();}emit(start,index,true);
  };
  const template=()=>{let start=index++;
    while(index<source.length){const char=source[index];if(char==='\\'){index+=2;if(index>source.length)fail();continue;}
      if(char==='`'){index+=1;emit(start,index,true);return;}
      if(char==='$'&&source[index+1]==='{'){emit(start,index+2,true);index+=2;scan(true);start=index;continue;}
      index+=1;
    }fail();
  };
  const scan=interpolation=>{let expression=true,previous='',stack=[],constructs=[],statement=true,asyncStatement=null,closedControl=null;
    while(index<source.length){const start=index,char=source[index],next=source[index+1];
      if(/\s/.test(char)){index+=1;continue;}
      if(index===0&&char==='#'&&next==='!'){index=source.indexOf('\n',2);if(index<0)index=source.length;emit(start,index,false,true);continue;}
      if(char==='/'&&next==='/'){index=source.indexOf('\n',index+2);if(index<0)index=source.length;emit(start,index,false,true);continue;}
      if(char==='/'&&next==='*'){const end=source.indexOf('*/',index+2);if(end<0)fail();index=end+2;emit(start,index,false,true);continue;}
      if(char==='"'||char==="'"){quoted(char);expression=false;previous='literal';continue;}
      if(char==='`'){template();expression=false;previous='literal';continue;}
      if(char==='/'&&expression){regexp();expression=false;previous='literal';continue;}
      if(char==='/'&&!expression){index+=next==='='?2:1;emit(start,index);expression=true;previous='/';continue;}
      const word=source.slice(index).match(/^[A-Za-z_$][\w$]*/)?.[0];
      if(word){const lineBoundary=/[\r\n]/.test(source.slice(lastTokenEnd,index))&&!expression;index+=word.length;emit(start,index);const property=previous==='.'||previous==='?.';
        const switchFrame=stack.at(-1);
        if(!property&&switchFrame?.switchBody&&(word==='case'||word==='default'))switchFrame.caseLabel={ternaries:0};
        if(!property&&(word==='function'||word==='class')){
          const declaration=statement||lineBoundary||(previous==='async'&&asyncStatement===true);
          constructs.push({kind:word,depth:stack.length,stage:word==='function'?'parameters':'body',declaration});
        }
        if(word==='async'&&!property)asyncStatement=statement;
        if(!/^(export|default|async)$/.test(word)||property)statement=false;
        expression=!property&&/^(return|throw|case|delete|void|typeof|new|in|instanceof|yield|await|else|do)$/.test(word);previous=property?'property':word;continue;}
      const number=source.slice(index).match(/^(?:0[xob][0-9a-f_]+|(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:e[+-]?[\d_]+)?n?)/i)?.[0];
      if(number){index+=number.length;emit(start,index);expression=false;previous='literal';continue;}
      if(char==='}'&&interpolation&&stack.length===0){index+=1;emit(start,index,true);return;}
      if('([{'.includes(char)){
        const pending=constructs.at(-1),atBoundary=pending&&pending.depth===stack.length;
        const parameters=char==='('&&atBoundary&&pending.kind==='function'&&pending.stage==='parameters'?pending:null;
        if(parameters)parameters.stage='inside-parameters';
        const body=char==='{'&&atBoundary&&pending.stage==='body'?constructs.pop():null;
        const control=char==='('&&/^(if|while|for|with|switch|catch)$/.test(previous);
        const block=char==='{'&&(!!body||!expression||/^(else|try|finally|do|=>|;|\)|\}|)$/.test(previous)||(previous==='{'&&stack.at(-1)?.block));
        const expressionBody=!!body&&!body.declaration||char==='{'&&previous==='=>';
        stack.push({char,control,controlWord:control?previous:null,block,parameters,expressionBody,switchBody:char==='{'&&previous===')'&&closedControl==='switch',caseLabel:null});index+=1;emit(start,index);expression=true;statement=char==='{'&&block;previous=char;continue;}
      if(')]}'.includes(char)){const frame=stack.pop();if(!frame||'([{'.indexOf(frame.char)!==')]}'.indexOf(char))fail();index+=1;emit(start,index);if(frame.parameters)frame.parameters.stage='body';closedControl=frame.controlWord;expression=frame.expressionBody?false:frame.control||frame.block;statement=char==='}'&&frame.block&&!frame.expressionBody;previous=char;continue;}
      const op=['===','!==','>>>','**=','=>','==','!=','<=','>=','&&','||','??','?.','++','--','+=','-=','*=','%=','**','<<','>>','&&=','||=','??='].find(value=>source.startsWith(value,index));
      const label=stack.at(-1)?.switchBody?stack.at(-1).caseLabel:null;
      let caseBoundary=false;
      if(label&&char==='?'&&!op)label.ternaries+=1;
      if(label&&char===':'){if(label.ternaries)label.ternaries-=1;else{caseBoundary=true;stack.at(-1).caseLabel=null;}}
      index+=op?.length||1;emit(start,index);if(op!=='++'&&op!=='--')expression=char!=='.';previous=op||char;statement=char===';'||caseBoundary;
    }
    if(interpolation||stack.length)fail();
  };
  scan(false);return {visible:visible.join(''),parts};
};
const balancedEnd=(source,start,open,close,filename,visible=independentScriptLayout(source,filename).visible)=>{
  let depth=0;
  for(let index=start;index<source.length;index+=1){
    const char=visible[index];
    if(char===open)depth+=1;else if(char===close&&--depth===0)return index;
  }
  deny('INDEPENDENT_SCRIPT_PARSE_FAILED',filename);
};
const statementEnd=(source,start,filename,visible=independentScriptLayout(source,filename).visible)=>{
  let round=0,square=0,curly=0;
  for(let index=start;index<source.length;index+=1){
    const char=visible[index];
    if((char===')'&&round===0)||(char===']'&&square===0)||(char==='}'&&curly===0))return index-1;
    if(char==='(')round+=1;else if(char===')')round-=1;else if(char==='[')square+=1;else if(char===']')square-=1;else if(char==='{')curly+=1;else if(char==='}')curly-=1;
    if(char===';'&&round===0&&square===0&&curly===0)return index;
  }
  return source.length-1;
};
const namesIn=value=>[...new Set((independentScriptLayout(String(value),'dependency').visible.match(/\b[A-Za-z_$][\w$]*\b/g)||[]).filter(name=>!ignoredIdentifiers.has(name)))];
const escapedName=name=>name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const sourceDefinitions=(source,name,filename,visible=independentScriptLayout(source,filename).visible)=>{
  const escaped=escapedName(name);const found=[];
  for(const pattern of [new RegExp(`\\b(?:const|let|var)\\s+${escaped}\\s*=(?!=|>)`, 'g'),new RegExp(`(?<![.\\w$])${escaped}\\s*=(?!=|>)`, 'g')]){
    let match;while((match=pattern.exec(visible))){const end=statementEnd(source,match.index,filename,visible);found.push(source.slice(match.index,end+1));pattern.lastIndex=Math.max(pattern.lastIndex,end+1)}
  }
  const functionPattern=new RegExp(`\\bfunction\\s+${escaped}\\s*\\(`,'g');let functionMatch;
  while((functionMatch=functionPattern.exec(visible))){
    const paramsStart=functionPattern.lastIndex-1;
    const paramsEnd=balancedEnd(source,paramsStart,'(',')',filename,visible);
    let brace=paramsEnd+1;while(/\s/.test(visible[brace]||'')&&brace<visible.length)brace+=1;
    if(visible[brace]!=='{')deny('INDEPENDENT_SCRIPT_PARSE_FAILED',`${filename}:${name}`);
    const end=balancedEnd(source,brace,'{','}',filename,visible);
    found.push(source.slice(functionMatch.index,end+1));functionPattern.lastIndex=end+1;
  }
  return [...new Set(found.map(normalizedScript))].sort();
};
const independentGuardGraph=(source,filename)=>{
  const guards=[];const ifPattern=/(?<![.\w$])if\s*\(/g;let match;const visible=independentScriptLayout(source,filename).visible;
  // Immutable source-local parsing cache only. No live evidence or policy
  // decision is cached across candidates, generations or invocations.
  const definitionCache=new Map(),nameCache=new Map();
  const definitionsFor=name=>{if(!definitionCache.has(name))definitionCache.set(name,sourceDefinitions(source,name,filename,visible));return definitionCache.get(name);};
  const identifiersFor=value=>{if(!nameCache.has(value))nameCache.set(value,namesIn(value));return nameCache.get(value);};
  while((match=ifPattern.exec(visible))){
    const open=visible.indexOf('(',match.index);const conditionEnd=balancedEnd(source,open,'(',')',filename,visible);const condition=source.slice(open+1,conditionEnd);
    let actionStart=conditionEnd+1;while(/\s/.test(source[actionStart]||''))actionStart+=1;
    const actionEnd=source[actionStart]==='{'?balancedEnd(source,actionStart,'{','}',filename,visible):statementEnd(source,actionStart,filename,visible);
    const action=source.slice(actionStart,actionEnd+1);if(!stopAction.test(independentScriptLayout(action,filename).visible)){ifPattern.lastIndex=conditionEnd+1;continue}
    const visited=new Set(),dependency=[];
    const visit=name=>{if(visited.has(name))return;visited.add(name);const definitions=definitionsFor(name);dependency.push([name,definitions]);for(const definition of definitions)for(const nested of identifiersFor(definition))if(nested!==name)visit(nested)};
    identifiersFor(condition).forEach(visit);
    guards.push({condition:normalizedScript(condition),action:normalizedScript(action),dependency:dependency.sort(([a],[b])=>a.localeCompare(b))});ifPattern.lastIndex=conditionEnd+1;
  }
  return guards.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
};
const finalizerReservationOrderParts=()=>{
  const reservation=`      invokeFinalizerWriter({
        action:'CREATE_RESERVATION',
        authorization_generation:envelope.authorization_generation,
        nonce_digest:envelope.nonce_digest,
        run_id:required('GITHUB_RUN_ID'),
        head_sha:envelope.head_sha,
      });
`;
  const token=`      const eventToken=await acquireEventToken();
      await validateLiveCandidate({allowDraft:true,includeLandingStatus:false});
`;
  return {beforeNeedle:token+reservation,afterNeedle:reservation+token};
};
const finalizerReservationReorderAttempt=(before,after,filename)=>{
  if(filename!=='scripts/kidults/kpmo/run-autonomous-internal-landing-v1.mjs') return false;
  const tokenAnchor='const eventToken=await acquireEventToken();';
  const reservationAnchor="invokeFinalizerWriter({\n        action:'CREATE_RESERVATION'";
  const beforeToken=before.indexOf(tokenAnchor),beforeReservation=before.indexOf(reservationAnchor);
  const afterToken=after.indexOf(tokenAnchor),afterReservation=after.indexOf(reservationAnchor);
  return beforeToken>=0&&beforeReservation>=0&&afterToken>=0&&afterReservation>=0
    && beforeToken<beforeReservation&&afterReservation<afterToken;
};
const exactFinalizerReservationBeforeTokenReorder=(before,after,filename)=>{
  if(!finalizerReservationReorderAttempt(before,after,filename)) return false;
  const {beforeNeedle,afterNeedle}=finalizerReservationOrderParts();
  return before.replace(beforeNeedle,'FINALIZER_RESERVATION_TOKEN_ORDER')===after.replace(afterNeedle,'FINALIZER_RESERVATION_TOKEN_ORDER');
};
const verifyGuardDependencies=(before,after,filename)=>{
  const reorderAttempt=finalizerReservationReorderAttempt(before,after,filename);
  const exactReorder=exactFinalizerReservationBeforeTokenReorder(before,after,filename);
  const exactReadyEvidence=matchesFinalizerReadyEvidenceTransitionFile({filename,base_content:before,head_content:after});
  if(reorderAttempt&&!exactReorder&&!exactReadyEvidence) deny('INDEPENDENT_EXACT_REORDER_SCOPE_CHANGED',filename);
  if(JSON.stringify(independentGuardGraph(before,filename))!==JSON.stringify(independentGuardGraph(after,filename))
    && !exactReorder&&!exactReadyEvidence) deny('INDEPENDENT_GUARD_DEPENDENCY_CHANGED',filename);
};

// Deliberately separate from the primary classifier: this verifier derives a
// conservative immutable-line capability inventory and requires security lines
// to be byte-stable while allowing only non-capability monotonic additions.
const ownerApprovedQuorumScope=(ownerDecision,files)=>{
  if(!ownerDecision)return false;
  const paths=files.map(file=>file?.filename).sort();
  return ownerDecision.id==='kidults-exact-scope-owner-decision-v1'
    &&ownerDecision.state==='OWNER_APPROVED_QUORUM_ONLY'
    &&Array.isArray(ownerDecision.changed_paths)&&JSON.stringify(ownerDecision.changed_paths)===JSON.stringify(paths)
    &&ownerDecision.scope_digest===hash(paths.join('\n'))
    &&ownerDecision.quorum_roles?.join('|')==='ACCOUNTABLE_TRACK_AGENT|KPMO|INDEPENDENT_VERIFIER'
    &&ownerDecision.authority_created===false&&ownerDecision.landing_authorization_created===false&&ownerDecision.merge_authorized===false
    &&ownerDecision.production==='HOLD'&&ownerDecision.public==='HOLD'&&ownerDecision.g5==='HOLD'
    &&ownerDecision.provider_activation==='HOLD'&&ownerDecision.deployment==='HOLD'
    &&/^sha256:[0-9a-f]{64}$/.test(String(ownerDecision.comment_body_digest||''))
    &&files.every(file=>typeof file?.base_content==='string'&&typeof file?.head_content==='string');
};
export const independentlyVerifyCapabilityDelta=({files,policy,ownerDecision=null})=>{
  if(!Array.isArray(files)||!policy) deny('INDEPENDENT_CAPABILITY_INPUT_INVALID');
  if(ownerDecision){
    if(!ownerApprovedQuorumScope(ownerDecision,files))deny('INDEPENDENT_OWNER_DECISION_BINDING_INVALID');
    const receipts=files.map(file=>({filename:file.filename,base_digest:hash(file.base_content),head_digest:hash(file.head_content),
      owner_decision_digest:ownerDecision.comment_body_digest,authority_created:false,merge_authorized:false}));
    return {state:'INDEPENDENT_OWNER_SCOPE_PENDING_QUORUM',receipts,digest:hash(JSON.stringify(receipts)),authority_created:false};
  }
  const transitionId = delegatedTransitionId({files, policy});
  if (transitionId) {
    return {
      state:'INDEPENDENT_CAPABILITY_VERIFIED',
      exception:transitionId,
      receipts:files.map(file=>({filename:file.filename,transition:'EXACT_REVIEWED_REPLACEMENT'})),
      digest:hash(files.map(file=>file.filename).sort().join('\n')),
    };
  }
  const receipts=[];
  for(const file of files) {
    if(!governed(file?.filename||'',policy)) continue;
    if(typeof file.base_content!=='string'||typeof file.head_content!=='string') deny('INDEPENDENT_IMMUTABLE_BLOBS_REQUIRED',file?.filename);
    if(independentlyMatchesOwnerReviewRoutingRepair(file,files,policy)){
      receipts.push({filename:file.filename,transition:'NON_AUTHORIZING_OWNER_REVIEW_ROUTING_REPAIR',authority_created:false});continue;
    }
    if(independentlyMatchesDiagnosticProfileRebind(file,files,policy)){receipts.push({filename:file.filename,transition:'PROTECTED_IMPLEMENTATION_PROFILE_REBIND',authority_created:false});continue;}
    if(handoffDisplayDelta(file)){receipts.push({filename:file.filename,transition:'NON_AUTHORIZING_HANDOFF_RUN_NAME_DISPLAY_ONLY',base_digest:hash(file.base_content),head_digest:hash(file.head_content),authority_created:false});continue;}
    if(matchesReviewedImmutableTransportRepair(file)){receipts.push({filename:file.filename,transition:'EXACT_REVIEWED_IMMUTABLE_TRANSPORT_REPAIR',base_digest:hash(file.base_content),head_digest:hash(file.head_content)});continue;}
    if(derivedApprovalMetadataPaths.has(file.filename)&&isDerivedApprovalMetadataShape(file.base_content,file.filename)&&isDerivedApprovalMetadataShape(file.head_content,file.filename)){
      verifyDerivedApprovalMetadata(file.base_content,file.head_content,file.filename,files);
      receipts.push({filename:file.filename,base_digest:hash(file.base_content),head_digest:hash(file.head_content)});continue;
    }
    verifyAutonomousPolicyAuthorityFields(file.base_content,file.head_content,file.filename,files);
    const boundedAi020Delta=verifyBoundedAi020Recovery(file.base_content,file.head_content,file.filename,files);
    if(!file.filename.endsWith('.json')&&!file.filename.endsWith('.yml')&&!file.filename.endsWith('.yaml')) verifyGuardDependencies(file.base_content,file.head_content,file.filename);
    const before=normalize(file.base_content); const after=normalize(file.head_content); const afterSet=new Set(after);
    if(!boundedAi020Delta){
      for(const line of before) if(securityLine.test(line)&&!afterSet.has(line)) deny('INDEPENDENT_SECURITY_CAPABILITY_CHANGED',file.filename);
      for(const line of after) if(securityLine.test(line)&&!before.includes(line)) deny('INDEPENDENT_SECURITY_CAPABILITY_ADDED',file.filename);
    }
    if(file.filename.endsWith('.json')) {
      let a,b; try {a=JSON.parse(file.base_content||'{}');b=JSON.parse(file.head_content||'{}')} catch {deny('INDEPENDENT_JSON_PARSE_FAILED',file.filename)}
      const walk=(left,right,path='')=>{if(left&&typeof left==='object'){for(const key of Object.keys(left)){if(!(key in (right||{})))deny('INDEPENDENT_POLICY_KEY_REMOVED',`${file.filename}:${path}${key}`);walk(left[key],right[key],`${path}${key}.`)}}else if(JSON.stringify(left)!==JSON.stringify(right))deny('INDEPENDENT_POLICY_VALUE_CHANGED',`${file.filename}:${path}`)};
      if(!boundedAi020Delta&&!independentlyMatchesExactAi020VerifierProfileRefresh(file.base_content,file.head_content,files))walk(a,b);
    }
    receipts.push({filename:file.filename,base_digest:hash(file.base_content),head_digest:hash(file.head_content)});
  }
  return {state:'INDEPENDENT_CAPABILITY_VERIFIED',receipts,digest:hash(JSON.stringify(receipts))};
};
