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
const verifyAutonomousPolicyAuthorityFields=(before,after,filename)=>{
  if(filename!=='coordination/kidults/governance/autonomous-internal-landing-policy-v1.json') return;
  let left,right; try {left=JSON.parse(before||'{}');right=JSON.parse(after||'{}')} catch {deny('INDEPENDENT_JSON_PARSE_FAILED',filename)}
  for(const key of autonomousPolicyAuthorityFields) if(JSON.stringify(left[key])!==JSON.stringify(right[key])) deny('INDEPENDENT_AUTHORITY_POLICY_CHANGED',filename+':'+key);
};

// Independent structural recomputation. Unlike the primary token graph, this
// walks balanced source spans and reconstructs predicate bindings directly
// from immutable source text. Unsupported or ambiguous balance fails closed.
// Independent lexical spans: opaque literal bytes stay in the comparison,
// while only executable text participates in structural searches. Template
// expressions are executable; their surrounding template text is opaque.
const independentScriptLayout=(source,filename)=>{
  const visible=source.split(''),parts=[];let index=0;
  const fail=()=>deny('INDEPENDENT_SCRIPT_PARSE_FAILED',`${filename}:offset-${index}`);
  const emit=(start,end,opaque=false,comment=false)=>{
    if(!comment)parts.push(source.slice(start,end));
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
  const scan=interpolation=>{let expression=true,previous='',stack=[];
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
      if(word){index+=word.length;emit(start,index);const property=previous==='.'||previous==='?.';expression=!property&&/^(return|throw|case|delete|void|typeof|new|in|instanceof|yield|await|else|do)$/.test(word);previous=property?'property':word;continue;}
      const number=source.slice(index).match(/^(?:0[xob][0-9a-f_]+|(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:e[+-]?[\d_]+)?n?)/i)?.[0];
      if(number){index+=number.length;emit(start,index);expression=false;previous='literal';continue;}
      if(char==='}'&&interpolation&&stack.length===0){index+=1;emit(start,index,true);return;}
      if('([{'.includes(char)){const control=char==='('&&/^(if|while|for|with|switch|catch)$/.test(previous);const block=char==='{'&&(!expression||/^(else|try|finally|do|=>|;|\)|\}|)$/.test(previous)||(previous==='{'&&stack.at(-1)?.block));stack.push({char,control,block});index+=1;emit(start,index);expression=true;previous=char;continue;}
      if(')]}'.includes(char)){const frame=stack.pop();if(!frame||'([{'.indexOf(frame.char)!==')]}'.indexOf(char))fail();index+=1;emit(start,index);expression=frame.control||frame.block;previous=char;continue;}
      const op=['===','!==','>>>','**=','=>','==','!=','<=','>=','&&','||','??','?.','++','--','+=','-=','*=','%=','**','<<','>>','&&=','||=','??='].find(value=>source.startsWith(value,index));
      index+=op?.length||1;emit(start,index);if(op!=='++'&&op!=='--')expression=char!=='.';previous=op||char;
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
  while((functionMatch=functionPattern.exec(visible))){const brace=visible.indexOf('{',functionMatch.index);if(brace<0)deny('INDEPENDENT_SCRIPT_PARSE_FAILED',`${filename}:${name}`);const end=balancedEnd(source,brace,'{','}',filename,visible);found.push(source.slice(functionMatch.index,end+1));functionPattern.lastIndex=end+1}
  return [...new Set(found.map(normalizedScript))].sort();
};
const independentGuardGraph=(source,filename)=>{
  const guards=[];const ifPattern=/(?<![.\w$])if\s*\(/g;let match;const visible=independentScriptLayout(source,filename).visible;
  while((match=ifPattern.exec(visible))){
    const open=visible.indexOf('(',match.index);const conditionEnd=balancedEnd(source,open,'(',')',filename,visible);const condition=source.slice(open+1,conditionEnd);
    let actionStart=conditionEnd+1;while(/\s/.test(source[actionStart]||''))actionStart+=1;
    const actionEnd=source[actionStart]==='{'?balancedEnd(source,actionStart,'{','}',filename,visible):statementEnd(source,actionStart,filename,visible);
    const action=source.slice(actionStart,actionEnd+1);if(!stopAction.test(independentScriptLayout(action,filename).visible)){ifPattern.lastIndex=conditionEnd+1;continue}
    const visited=new Set(),dependency=[];
    const visit=name=>{if(visited.has(name))return;visited.add(name);const definitions=sourceDefinitions(source,name,filename,visible);dependency.push([name,definitions]);for(const definition of definitions)for(const nested of namesIn(definition))if(nested!==name)visit(nested)};
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
