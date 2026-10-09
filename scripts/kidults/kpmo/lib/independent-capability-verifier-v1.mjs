import {EXPLICIT_EXECUTION_CONTROLS,classifyApprovalInventoryPath,routeAuthorizationControl} from '../../../governance/lib/approval-policy-routing-v1.mjs';
import {matchesReviewedImmutableTransportRepair} from './reviewed-immutable-transport-repair-v1.mjs';
import crypto from 'node:crypto';
import {delegatedTransitionId,matchesFinalizerReadyEvidenceTransitionFile} from './natural-reserve-transition-exception-v1.mjs';

const hash=value=>`sha256:${crypto.createHash('sha256').update(String(value)).digest('hex')}`;
const independentlyMatchesProtectedRepair=(file,policy)=>{
  const path='scripts/kidults/kpmo/run-autonomous-dispatcher-v1.mjs';
  if(file.filename!==path||!policy.protected_code_repair)return false;
  const rule=policy.protected_code_repair;
  const keys=new Set(['enabled','executor','scope','primary_and_independent_required','track_kpmo_quorum_required','candidate_policy_authority','transitions']);
  if(Object.keys(rule).length!==keys.size||Object.keys(rule).some(k=>!keys.has(k))
    ||rule.enabled!==true||rule.executor!=='EXACT_PROTECTED_MAIN'||rule.scope!=='REGISTERED_NON_AUTHORIZING_FAILURE_DIAGNOSTICS'
    ||rule.primary_and_independent_required!==true||rule.track_kpmo_quorum_required!==true||rule.candidate_policy_authority!==false
    ||!Array.isArray(rule.transitions)||rule.transitions.length!==1)deny('INDEPENDENT_PROTECTED_REPAIR_POLICY_INVALID');
  const entry=rule.transitions[0],names=Object.keys(entry).sort();
  if(names.length!==4||names.some((name,i)=>name!==['base_digest','head_digest','id','path'][i])
    ||entry.id!=='DISPATCH_READ_DIAGNOSTICS_V1'||entry.path!==path
    ||typeof entry.base_digest!=='string'||typeof entry.head_digest!=='string'
    ||![entry.base_digest,entry.head_digest].every(d=>/^sha256:[a-f0-9]{64}$/.test(d))||entry.base_digest===entry.head_digest)deny('INDEPENDENT_PROTECTED_REPAIR_POLICY_INVALID');
  if(file.status!=='modified')return false;
  return crypto.createHash('sha256').update(file.base_content,'utf8').digest('hex')===entry.base_digest.substring(7)
    &&crypto.createHash('sha256').update(file.head_content,'utf8').digest('hex')===entry.head_digest.substring(7);
};
const deny=(code,detail='')=>{const error=new Error(detail?`${code}:${detail}`:code);error.code=code;throw error};
const governed=(name,policy)=>(policy.delegated_internal_path_prefixes||[]).some(prefix=>name.startsWith(prefix))||(policy.delegated_internal_exact_path_exceptions||[]).includes(name);
const securityLine=/\b(on|workflow_dispatch|repository_dispatch|schedule|push|pull_request_target|permissions|environment|if|secrets|vars|id-token|contents|pull-requests|actions|checks|statuses|deployments|packages|issues|repository-projects|security-events|curl|wget|gh api|aws |gcloud |terraform|kubectl|https?:\/\/|force:|fail|throw|assert|deny|forbid|hold|required|quarantine|owner[_-]?reserved|authorization|credential|production|public|g5)\b/i;
const normalize=source=>source.split('\n').map(line=>line.replace(/\s+#.*$/,'').trim()).filter(Boolean);
const stopAction=/\b(throw|fail|deny|assert|forbid|quarantine)\b/;
const ignoredIdentifiers=new Set(['if','else','throw','new','return','const','let','var','function','true','false','null','undefined','await','async','typeof','instanceof','in','of','this']);
const normalizedScript=value=>String(value).replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'').replace(/\s+/g,' ').trim();
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
const verifyDerivedApprovalMetadata=(before,after,filename,files)=>{
  if(independentlyVerifyAuditGrowth(before,after,filename,files))return;
  if(JSON.stringify(normalizedDerivedApprovalMetadata(before,filename))!==JSON.stringify(normalizedDerivedApprovalMetadata(after,filename))) deny('INDEPENDENT_DERIVED_METADATA_SCOPE_CHANGED',filename);
};

const autonomousPolicyAuthorityFields=['protected_code_repair','owner_reserved_actions','owner_reserved_path_prefixes','owner_reserved_exact_paths','delegated_internal_path_prefixes','owner_reserved_added_patch_patterns','delegated_internal_exact_path_exceptions','delegated_internal_transition_exceptions','scope_classification','semantic_self_governance','approval_quorum','eligible_all_required'];
const verifyAutonomousPolicyAuthorityFields=(before,after,filename)=>{
  if(filename!=='coordination/kidults/governance/autonomous-internal-landing-policy-v1.json') return;
  let left,right; try {left=JSON.parse(before||'{}');right=JSON.parse(after||'{}')} catch {deny('INDEPENDENT_JSON_PARSE_FAILED',filename)}
  for(const key of autonomousPolicyAuthorityFields) if(JSON.stringify(left[key])!==JSON.stringify(right[key])) deny('INDEPENDENT_AUTHORITY_POLICY_CHANGED',filename+':'+key);
};

// Independent structural recomputation. Unlike the primary token graph, this
// walks balanced source spans and reconstructs predicate bindings directly
// from immutable source text. Unsupported or ambiguous balance fails closed.
const balancedEnd=(source,start,open,close,filename)=>{
  let depth=0,quote='',escaped=false,lineComment=false,blockComment=false;
  for(let index=start;index<source.length;index+=1){
    const char=source[index],next=source[index+1];
    if(lineComment){if(char==='\n')lineComment=false;continue}
    if(blockComment){if(char==='*'&&next==='/'){blockComment=false;index+=1}continue}
    if(quote){if(escaped){escaped=false;continue}if(char==='\\'){escaped=true;continue}if(char===quote)quote='';continue}
    if(char==='/'&&next==='/'){lineComment=true;index+=1;continue}
    if(char==='/'&&next==='*'){blockComment=true;index+=1;continue}
    if(char==='"'||char==="'"||char==='`'){quote=char;continue}
    if(char===open)depth+=1;else if(char===close&&--depth===0)return index;
  }
  deny('INDEPENDENT_SCRIPT_PARSE_FAILED',filename);
};
const statementEnd=(source,start,filename)=>{
  let round=0,square=0,curly=0,quote='',escaped=false;
  for(let index=start;index<source.length;index+=1){
    const char=source[index];
    if(quote){if(escaped){escaped=false;continue}if(char==='\\'){escaped=true;continue}if(char===quote)quote='';continue}
    if(char==='"'||char==="'"||char==='`'){quote=char;continue}
    if(char==='(')round+=1;else if(char===')')round-=1;else if(char==='[')square+=1;else if(char===']')square-=1;else if(char==='{')curly+=1;else if(char==='}')curly-=1;
    if(char===';'&&round===0&&square===0&&curly===0)return index;
  }
  return source.length-1;
};
const namesIn=value=>[...new Set((String(value).match(/\b[A-Za-z_$][\w$]*\b/g)||[]).filter(name=>!ignoredIdentifiers.has(name)))];
const escapedName=name=>name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const sourceDefinitions=(source,name,filename)=>{
  const escaped=escapedName(name);const found=[];
  for(const pattern of [new RegExp(`\\b(?:const|let|var)\\s+${escaped}\\s*=`, 'g'),new RegExp(`(?<![.\\w$])${escaped}\\s*=`, 'g')]){
    let match;while((match=pattern.exec(source))){const end=statementEnd(source,match.index,filename);found.push(source.slice(match.index,end+1));pattern.lastIndex=Math.max(pattern.lastIndex,end+1)}
  }
  const functionPattern=new RegExp(`\\bfunction\\s+${escaped}\\s*\\(`,'g');let functionMatch;
  while((functionMatch=functionPattern.exec(source))){const brace=source.indexOf('{',functionMatch.index);if(brace<0)deny('INDEPENDENT_SCRIPT_PARSE_FAILED',`${filename}:${name}`);const end=balancedEnd(source,brace,'{','}',filename);found.push(source.slice(functionMatch.index,end+1));functionPattern.lastIndex=end+1}
  return [...new Set(found.map(normalizedScript))].sort();
};
const independentGuardGraph=(source,filename)=>{
  const guards=[];const ifPattern=/\bif\s*\(/g;let match;
  while((match=ifPattern.exec(source))){
    const open=source.indexOf('(',match.index);const conditionEnd=balancedEnd(source,open,'(',')',filename);const condition=source.slice(open+1,conditionEnd);
    let actionStart=conditionEnd+1;while(/\s/.test(source[actionStart]||''))actionStart+=1;
    const actionEnd=source[actionStart]==='{'?balancedEnd(source,actionStart,'{','}',filename):statementEnd(source,actionStart,filename);
    const action=source.slice(actionStart,actionEnd+1);if(!stopAction.test(normalizedScript(action))){ifPattern.lastIndex=conditionEnd+1;continue}
    const visited=new Set(),dependency=[];
    const visit=name=>{if(visited.has(name))return;visited.add(name);const definitions=sourceDefinitions(source,name,filename);dependency.push([name,definitions]);for(const definition of definitions)for(const nested of namesIn(definition))if(nested!==name)visit(nested)};
    namesIn(condition).forEach(visit);
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
export const independentlyVerifyCapabilityDelta=({files,policy})=>{
  if(!Array.isArray(files)||!policy) deny('INDEPENDENT_CAPABILITY_INPUT_INVALID');
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
    if(independentlyMatchesProtectedRepair(file,policy)){receipts.push({filename:file.filename,transition:'REGISTERED_PROTECTED_DIAGNOSTIC_REPAIR',base_digest:hash(file.base_content),head_digest:hash(file.head_content),authority_created:false});continue;}
    if(matchesReviewedImmutableTransportRepair(file)){receipts.push({filename:file.filename,transition:'EXACT_REVIEWED_IMMUTABLE_TRANSPORT_REPAIR',base_digest:hash(file.base_content),head_digest:hash(file.head_content)});continue;}
    if(derivedApprovalMetadataPaths.has(file.filename)&&isDerivedApprovalMetadataShape(file.base_content,file.filename)&&isDerivedApprovalMetadataShape(file.head_content,file.filename)){
      verifyDerivedApprovalMetadata(file.base_content,file.head_content,file.filename,files);
      receipts.push({filename:file.filename,base_digest:hash(file.base_content),head_digest:hash(file.head_content)});continue;
    }
    verifyAutonomousPolicyAuthorityFields(file.base_content,file.head_content,file.filename);
    if(!file.filename.endsWith('.json')&&!file.filename.endsWith('.yml')&&!file.filename.endsWith('.yaml')) verifyGuardDependencies(file.base_content,file.head_content,file.filename);
    const before=normalize(file.base_content); const after=normalize(file.head_content); const afterSet=new Set(after);
    for(const line of before) if(securityLine.test(line)&&!afterSet.has(line)) deny('INDEPENDENT_SECURITY_CAPABILITY_CHANGED',file.filename);
    for(const line of after) if(securityLine.test(line)&&!before.includes(line)) deny('INDEPENDENT_SECURITY_CAPABILITY_ADDED',file.filename);
    if(file.filename.endsWith('.json')) {
      let a,b; try {a=JSON.parse(file.base_content||'{}');b=JSON.parse(file.head_content||'{}')} catch {deny('INDEPENDENT_JSON_PARSE_FAILED',file.filename)}
      const walk=(left,right,path='')=>{if(left&&typeof left==='object'){for(const key of Object.keys(left)){if(!(key in (right||{})))deny('INDEPENDENT_POLICY_KEY_REMOVED',`${file.filename}:${path}${key}`);walk(left[key],right[key],`${path}${key}.`)}}else if(JSON.stringify(left)!==JSON.stringify(right))deny('INDEPENDENT_POLICY_VALUE_CHANGED',`${file.filename}:${path}`)};
      walk(a,b);
    }
    receipts.push({filename:file.filename,base_digest:hash(file.base_content),head_digest:hash(file.head_content)});
  }
  return {state:'INDEPENDENT_CAPABILITY_VERIFIED',receipts,digest:hash(JSON.stringify(receipts))};
};
