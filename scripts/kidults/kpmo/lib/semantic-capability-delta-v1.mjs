import {EXPLICIT_EXECUTION_CONTROLS,classifyApprovalInventoryPath,routeAuthorizationControl} from '../../../governance/lib/approval-policy-routing-v1.mjs';
import {matchesReviewedImmutableTransportRepair} from './reviewed-immutable-transport-repair-v1.mjs';
import crypto from 'node:crypto';
import {delegatedTransitionId,matchesFinalizerReadyEvidenceTransitionFile} from './natural-reserve-transition-exception-v1.mjs';

export class CapabilityDeltaError extends Error {
  constructor(code, detail='') { super(detail ? `${code}:${detail}` : code); this.code=code; }
}
const fail=(code,detail='')=>{throw new CapabilityDeltaError(code,detail)};
const digest=value=>`sha256:${crypto.createHash('sha256').update(String(value)).digest('hex')}`;
const matchesProtectedDiagnosticRepair=(file,policy)=>{
  if(file.filename!=='scripts/kidults/kpmo/run-autonomous-dispatcher-v1.mjs')return false;
  const r=policy.protected_code_repair;
  if(!r)return false;
  const expected=['enabled','executor','scope','primary_and_independent_required','track_kpmo_quorum_required','candidate_policy_authority','transitions'];
  if(Object.keys(r).sort().join(',')!==expected.sort().join(',')||r.enabled!==true
    ||r.executor!=='EXACT_PROTECTED_MAIN'||r.scope!=='REGISTERED_NON_AUTHORIZING_FAILURE_DIAGNOSTICS'
    ||r.primary_and_independent_required!==true||r.track_kpmo_quorum_required!==true
    ||r.candidate_policy_authority!==false||!Array.isArray(r.transitions)||r.transitions.length!==1)fail('CAPABILITY_PROTECTED_REPAIR_POLICY_INVALID');
  const t=r.transitions[0];
  if(Object.keys(t).sort().join(',')!=='base_digest,head_digest,id,path'
    ||t.id!=='DISPATCH_READ_DIAGNOSTICS_V1'||t.path!==file.filename
    ||!/^sha256:[0-9a-f]{64}$/.test(t.base_digest)||!/^sha256:[0-9a-f]{64}$/.test(t.head_digest)
    ||t.base_digest===t.head_digest)fail('CAPABILITY_PROTECTED_REPAIR_POLICY_INVALID');
  return file.status==='modified'&&digest(file.base_content)===t.base_digest&&digest(file.head_content)===t.head_digest;
};
const isComment=line=>/^\s*(#|\/\/|\/\*|\*|<!--)/.test(line);
const riskyValue=/\b(secrets\.|vars\.|id-token|curl\b|wget\b|gh\s+api\b|aws\s|gcloud\s|az\s|terraform\b|kubectl\b|https?:\/\/|configure-aws-credentials|--admin-bypass|force\s*:\s*true)\b/i;
const writeKey=/^(contents|pull-requests|actions|checks|statuses|deployments|packages|issues|repository-projects|security-events)$/;
const failClosedGuard=/\b(fail|throw|assert|deny|forbid|hold|required|quarantine|owner[_-]?reserved|permission|authorization|credential|secret|production|public|g5)\b/i;
const jsIdentifier=/^[A-Za-z_$][\w$]*$/;
const jsKeywords=new Set(['if','else','return','throw','new','const','let','var','function','true','false','null','undefined','await','async','typeof','instanceof','in','of','this','class','extends','switch','case','break','continue','try','catch','finally']);
const hardStopTokens=new Set(['throw','fail','deny','assert','forbid','quarantine']);

// This is intentionally a small, fail-closed structural parser rather than a
// line classifier. It builds the guard predicate -> binding definition graph
// needed for immutable base/head comparison without executing target code.
const tokenizeScript=(source,filename)=>{
  const tokens=[];
  for(let index=0;index<source.length;){
    const char=source[index];
    if(/\s/.test(char)){index+=1;continue}
    if(char==='/'&&source[index+1]==='/'){index=source.indexOf('\n',index+2);if(index<0)break;continue}
    if(char==='/'&&source[index+1]==='*'){const end=source.indexOf('*/',index+2);if(end<0)fail('CAPABILITY_SCRIPT_PARSE_FAILED',`${filename}:comment`);index=end+2;continue}
    if(char==='"'||char==="'"||char==='`'){
      const quote=char;let end=index+1;let escaped=false;
      for(;end<source.length;end+=1){const next=source[end];if(escaped){escaped=false;continue}if(next==='\\'){escaped=true;continue}if(next===quote){end+=1;break}}
      if(end>source.length||source[end-1]!==quote)fail('CAPABILITY_SCRIPT_PARSE_FAILED',`${filename}:string`);
      tokens.push(source.slice(index,end));index=end;continue;
    }
    const identifier=source.slice(index).match(/^[A-Za-z_$][\w$]*/)?.[0];
    if(identifier){tokens.push(identifier);index+=identifier.length;continue}
    const number=source.slice(index).match(/^(?:0[xob][0-9a-f]+|\d+(?:\.\d+)?)/i)?.[0];
    if(number){tokens.push(number);index+=number.length;continue}
    const operator=['===','!==','>>>','**=','=>','==','!=','<=','>=','&&','||','??','?.','++','--','+=','-=','*=','/=','%=','**'].find(value=>source.startsWith(value,index));
    tokens.push(operator||char);index+=(operator||char).length;
  }
  return tokens;
};

const matchingToken=(tokens,start,open,close,filename)=>{
  let depth=0;
  for(let index=start;index<tokens.length;index+=1){if(tokens[index]===open)depth+=1;else if(tokens[index]===close&&--depth===0)return index}
  fail('CAPABILITY_SCRIPT_PARSE_FAILED',`${filename}:${open}`);
};
const tokenText=tokens=>tokens.join(' ');
const identifiers=tokens=>new Set(tokens.filter(token=>jsIdentifier.test(token)&&!jsKeywords.has(token)));

const scriptBindingGraph=(source,filename)=>{
  const tokens=tokenizeScript(source,filename);const bindings=new Map();
  const add=(name,node)=>{const existing=bindings.get(name)||[];existing.push(node);bindings.set(name,existing)};
  for(let index=0;index<tokens.length;index+=1){
    if(tokens[index]==='function'&&jsIdentifier.test(tokens[index+1]||'')){
      const name=tokens[index+1];const brace=tokens.indexOf('{',index+2);
      if(brace<0)fail('CAPABILITY_SCRIPT_PARSE_FAILED',`${filename}:${name}`);
      const end=matchingToken(tokens,brace,'{','}',filename);add(name,tokens.slice(index,end+1));index=end;continue;
    }
    if(['const','let','var'].includes(tokens[index])&&jsIdentifier.test(tokens[index+1]||'')){
      const name=tokens[index+1];if(tokens[index+2]!=='=')continue;
      let end=index+3;let round=0,square=0,curly=0;
      for(;end<tokens.length;end+=1){const token=tokens[end];if(token==='(')round+=1;else if(token===')')round-=1;else if(token==='[')square+=1;else if(token===']')square-=1;else if(token==='{')curly+=1;else if(token==='}')curly-=1;if(token===';'&&round===0&&square===0&&curly===0)break}
      add(name,tokens.slice(index,end+1));index=end;continue;
    }
    if(jsIdentifier.test(tokens[index])&&tokens[index+1]==='='&&tokens[index-1]!=='.'){
      const name=tokens[index];let end=index+2;let round=0,square=0,curly=0;
      for(;end<tokens.length;end+=1){const token=tokens[end];if(token==='(')round+=1;else if(token===')')round-=1;else if(token==='[')square+=1;else if(token===']')square-=1;else if(token==='{')curly+=1;else if(token==='}')curly-=1;if(token===';'&&round===0&&square===0&&curly===0)break}
      add(name,tokens.slice(index,end+1));index=end;
    }
  }
  const guards=[];
  for(let index=0;index<tokens.length;index+=1){
    if(tokens[index]!=='if'||tokens[index+1]!=='(')continue;
    const conditionEnd=matchingToken(tokens,index+1,'(',')',filename);const condition=tokens.slice(index+2,conditionEnd);
    const statementStart=conditionEnd+1;let statementEnd=statementStart;
    if(tokens[statementStart]==='{')statementEnd=matchingToken(tokens,statementStart,'{','}',filename);
    else while(statementEnd<tokens.length&&tokens[statementEnd]!==';')statementEnd+=1;
    const action=tokens.slice(statementStart,Math.min(statementEnd+1,tokens.length));
    if(!action.some(token=>hardStopTokens.has(token)))continue;
    const roots=[...identifiers(condition)];const visited=new Set();const dependency=[];
    const visit=name=>{
      if(visited.has(name))return;visited.add(name);
      const nodes=bindings.get(name)||[];
      dependency.push([name,nodes.map(tokenText).sort()]);
      for(const node of nodes)for(const nested of identifiers(node))if(nested!==name)visit(nested);
    };
    roots.forEach(visit);
    guards.push({condition:tokenText(condition),action:tokenText(action),dependency:dependency.sort(([a],[b])=>a.localeCompare(b))});
  }
  return guards.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
};

const assertScriptGuardDependencies=(before,after,filename)=>{
  const left=scriptBindingGraph(before,filename);const right=scriptBindingGraph(after,filename);
  if(JSON.stringify(left)!==JSON.stringify(right)
    && !matchesFinalizerReadyEvidenceTransitionFile({filename,base_content:before,head_content:after})) fail('CAPABILITY_GUARD_DEPENDENCY_CHANGED',filename);
};

const flattenJson=(value,path='',out=new Map())=>{
  if(value===null||typeof value!=='object') { out.set(path,JSON.stringify(value)); return out; }
  if(Array.isArray(value)) { value.forEach((item,index)=>flattenJson(item,`${path}[${index}]`,out)); return out; }
  for(const key of Object.keys(value).sort()) flattenJson(value[key],path?`${path}.${key}`:key,out);
  return out;
};

const yamlModel=source=>{
  if(typeof source!=='string') fail('CAPABILITY_SOURCE_MISSING');
  if(/\t/.test(source)) fail('CAPABILITY_YAML_UNSUPPORTED_SYNTAX');
  const stack=[]; const values=new Map(); const sequenceIndexes=new Map();
  const joined=parts=>parts.reduce((path,part)=>part.startsWith('[')?`${path}${part}`:path?`${path}.${part}`:part,'');
  const lines=source.split('\n');
  const blockScalar=(header,start,parentIndent)=>{
    if(!/^[>|][+-]?$/.test(header)) return {value:header,end:start};
    const body=[];let end=start;
    while(end+1<lines.length) {
      const next=lines[end+1];
      if(!next.trim()){body.push('');end+=1;continue}
      const bodyIndent=next.match(/^ */)[0].length;
      if(bodyIndent<=parentIndent) break;
      body.push(next.slice(Math.min(bodyIndent,parentIndent+2)));end+=1;
    }
    return {value:`${header}\n${body.join('\n')}`,end};
  };
  for(let index=0;index<lines.length;index+=1) {
    const raw=lines[index];
    if(!raw.trim()||isComment(raw)||raw.trim()==='---') continue;
    // YAML indirection remains unsupported and owner-reserved. Inspect only
    // structural YAML lines: block-scalar bodies are opaque command text and
    // may legitimately contain shell operators such as `!` and `*`.
    if(/(^|\s)[&*!][A-Za-z0-9_-]+|<<\s*:/.test(raw)) fail('CAPABILITY_YAML_UNSUPPORTED_SYNTAX');
    const match=raw.match(/^( *)(?:(-)\s+)?([^:#][^:]*):(?:\s*(.*))?$/);
    if(!match) {
      if(/^\s*-\s+[^:]+$/.test(raw)) { values.set(`list:${index}`,raw.trim()); continue; }
      fail('CAPABILITY_YAML_UNCLASSIFIED',String(index+1));
    }
    const indent=match[1].length; if(indent%2) fail('CAPABILITY_YAML_INDENT_UNKNOWN',String(index+1));
    const sequenceItem=match[2]==='-';
    const key=match[3].trim().replace(/^['"]|['"]$/g,''); let value=(match[4]??'').trim();
    while(stack.length&&stack.at(-1).indent>=indent) stack.pop();
    if(sequenceItem) {
      const parent=joined(stack.map(x=>x.key));
      const counterKey=`${indent}:${parent}`;
      const itemIndex=sequenceIndexes.get(counterKey)||0;
      sequenceIndexes.set(counterKey,itemIndex+1);
      const itemKey=`[${itemIndex}]`;
      const path=joined([...stack.map(x=>x.key),itemKey,key]);
      ({value,end:index}=blockScalar(value,index,indent));
      values.set(path,value||'{}');
      stack.push({indent,key:itemKey});
      if(!value) stack.push({indent,key});
    } else {
      const path=joined([...stack.map(x=>x.key),key]);
      ({value,end:index}=blockScalar(value,index,indent));
      values.set(path,value||'{}');
      if(!value) stack.push({indent,key});
    }
  }
  return values;
};

const derivedApprovalMetadataPaths=new Set([
  'coordination/kidults/governance/approval-policy-file-manifest-v1.json',
  'coordination/kidults/governance/approval-policy-inventory-v1.json',
]);
const normalizedDerivedApprovalMetadata=(source,filename)=>{
  let value; try { value=JSON.parse(source||'{}'); } catch { fail('CAPABILITY_JSON_PARSE_FAILED',filename); }
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
const verifyAuditGrowth=(before,after,filename,files)=>{
  const manifestPath='coordination/kidults/governance/approval-policy-file-manifest-v1.json';
  const manifestFile=filename===manifestPath?{base_content:before,head_content:after}:files.find(f=>f.filename===manifestPath);
  if(!manifestFile)return false;
  let a,b;try{a=JSON.parse(manifestFile.base_content);b=JSON.parse(manifestFile.head_content);}catch{return false;}
  if(!Array.isArray(a.files)||!Array.isArray(b.files)||b.files.length<=a.files.length)return false;
  const reject=()=>fail('CAPABILITY_DERIVED_METADATA_SCOPE_CHANGED',filename);
  const clean=e=>{const c=structuredClone(e);c.git_blob='DERIVED';c.sha256='DERIVED';return c;};
  const paths=b.files.map(e=>e.path);
  if(new Set(paths).size!==paths.length||JSON.stringify(paths)!==JSON.stringify([...paths].sort()))reject();
  const old=new Map(a.files.map(e=>[e.path,e]));
  if(old.size!==a.files.length||a.files.some(e=>!b.files.some(h=>h.path===e.path&&JSON.stringify(clean(e))===JSON.stringify(clean(h)))))reject();
  const additions=b.files.filter(e=>!old.has(e.path));
  for(const e of additions){
    const matches=files.filter(f=>f.filename===e.path);
    if(matches.length!==1||matches[0].base_content!==''||typeof matches[0].head_content!=='string')reject();
    const source=matches[0].head_content,bytes=Buffer.from(source,'utf8');
    if(!EXPLICIT_EXECUTION_CONTROLS.includes(e.path)&&!new RegExp(a.scan.pattern).test(source))reject();
    const blob=crypto.createHash('sha1').update(Buffer.concat([Buffer.from('blob '+bytes.length+'\0'),bytes])).digest('hex');
    if(e.git_blob!==blob||e.sha256!==digest(source)||e.classification!==classifyApprovalInventoryPath(e.path))reject();
    const expected={path:e.path,classification:e.classification,git_blob:blob,sha256:digest(source)};
    if(e.classification==='EXECUTION_AUTHORIZATION_CONTROL'){
      const routing=routeAuthorizationControl(e.path,source);
      if(routing.coverage.mode!=='EXEMPTION')reject();
      expected.authorization_routing=routing;
    }
    if(JSON.stringify(e)!==JSON.stringify(expected))reject();
  }
  if(b.scan?.file_count!==b.files.length||a.scan?.file_count!==a.files.length||b.manifest_sha256!==digest(JSON.stringify(b.files)))reject();
  const left=normalizedDerivedApprovalMetadata(JSON.stringify(a),manifestPath),right=normalizedDerivedApprovalMetadata(JSON.stringify(b),manifestPath);
  right.files=right.files.filter(e=>old.has(e.path));right.scan.file_count=left.scan.file_count;
  if(JSON.stringify(left)!==JSON.stringify(right))reject();
  if(filename!==manifestPath){
    const l=normalizedDerivedApprovalMetadata(before,filename),r=normalizedDerivedApprovalMetadata(after,filename);
    const raw=JSON.parse(after);
    if(raw.manifest_sha256!==b.manifest_sha256||raw.audit?.manifest_sha256!==b.manifest_sha256)reject();
    const controls=additions.filter(e=>e.classification==='EXECUTION_AUTHORIZATION_CONTROL'),routes={};
    for(const e of controls)routes[e.authorization_routing.route]=(routes[e.authorization_routing.route]||0)+1;
    if(r.audit?.approval_related_files_reviewed!==l.audit?.approval_related_files_reviewed+additions.length)reject();
    r.audit.approval_related_files_reviewed=l.audit.approval_related_files_reviewed;
    if(r.audit.routing_coverage.execution_authorization_controls!==l.audit.routing_coverage.execution_authorization_controls+controls.length
      ||r.audit.routing_coverage.exemptions!==l.audit.routing_coverage.exemptions+controls.length)reject();
    r.audit.routing_coverage.execution_authorization_controls=l.audit.routing_coverage.execution_authorization_controls;
    r.audit.routing_coverage.exemptions=l.audit.routing_coverage.exemptions;
    for(const [route,count]of Object.entries(routes)){
      if(r.audit.routing_coverage.route_counts[route]!==(l.audit.routing_coverage.route_counts[route]||0)+count)reject();
      if(route in l.audit.routing_coverage.route_counts)r.audit.routing_coverage.route_counts[route]=l.audit.routing_coverage.route_counts[route];else delete r.audit.routing_coverage.route_counts[route];
    }
    if(JSON.stringify(l)!==JSON.stringify(r))reject();
  }
  return true;
};
// A source revision is audit metadata only when both inventories remain bound
// and every changed content digest is recomputed from the exact changed bytes.
const verifyInventoryRevisionRefresh=(files,filename)=>{
  const mp='coordination/kidults/governance/approval-policy-file-manifest-v1.json';
  const ip='coordination/kidults/governance/approval-policy-inventory-v1.json';
  const mf=files.filter(f=>f.filename===mp),inf=files.filter(f=>f.filename===ip);
  if(mf.length!==1||inf.length!==1)return false;
  let a,b,i,j;try{a=JSON.parse(mf[0].base_content);b=JSON.parse(mf[0].head_content);i=JSON.parse(inf[0].base_content);j=JSON.parse(inf[0].head_content);}catch{return false;}
  if(a.revision===b.revision&&i.audit?.baseline_sha===j.audit?.baseline_sha)return false;
  const bad=()=>fail('CAPABILITY_DERIVED_METADATA_SCOPE_CHANGED',filename);
  if(!/^[0-9a-f]{40}$/.test(a.revision||'')||!/^[0-9a-f]{40}$/.test(b.revision||'')
    ||i.audit?.baseline_sha!==a.revision||j.audit?.baseline_sha!==b.revision)bad();
  if(!Array.isArray(a.files)||!Array.isArray(b.files)||b.files.length<a.files.length)return false;
  if(b.scan?.file_count!==b.files.length||a.scan?.file_count!==a.files.length
    ||b.manifest_sha256!==digest(JSON.stringify(b.files))
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
    if(next.git_blob!==blob||next.sha256!==digest(source[0].head_content))bad();
  }
  if(b.files.length>a.files.length){
    const normalizedFiles=files.map(file=>{
      if(file.filename===mp){const value=structuredClone(b);value.revision=a.revision;return {...file,head_content:JSON.stringify(value)};}
      if(file.filename===ip){const value=structuredClone(j);value.audit.baseline_sha=i.audit.baseline_sha;return {...file,head_content:JSON.stringify(value)};}
      return file;
    });
    const target=normalizedFiles.find(file=>file.filename===filename);
    if(!target||!verifyAuditGrowth(target.base_content,target.head_content,filename,normalizedFiles))bad();
    return true;
  }
  const left=normalizedDerivedApprovalMetadata(JSON.stringify(a),mp),right=normalizedDerivedApprovalMetadata(JSON.stringify(b),mp);
  right.revision=left.revision;
  const il=normalizedDerivedApprovalMetadata(JSON.stringify(i),ip),ir=normalizedDerivedApprovalMetadata(JSON.stringify(j),ip);
  ir.audit.baseline_sha=il.audit.baseline_sha;
  if(JSON.stringify(left)!==JSON.stringify(right)||JSON.stringify(il)!==JSON.stringify(ir))bad();
  return true;
};

const assertDerivedApprovalMetadataDelta=(before,after,filename,files)=>{
  if(verifyInventoryRevisionRefresh(files,filename))return;
  if(verifyAuditGrowth(before,after,filename,files))return;
  const left=normalizedDerivedApprovalMetadata(before,filename);
  const right=normalizedDerivedApprovalMetadata(after,filename);
  if(JSON.stringify(left)!==JSON.stringify(right)) fail('CAPABILITY_DERIVED_METADATA_SCOPE_CHANGED',filename);
};

const autonomousPolicyAuthorityFields=['immutable_source_read_profile','protected_code_repair','owner_reserved_actions','owner_reserved_path_prefixes','owner_reserved_exact_paths','delegated_internal_path_prefixes','owner_reserved_added_patch_patterns','delegated_internal_exact_path_exceptions','delegated_internal_transition_exceptions','scope_classification','semantic_self_governance','approval_quorum','eligible_all_required'];
const assertAutonomousPolicyAuthorityFields=(before,after,filename)=>{
  if(filename!=='coordination/kidults/governance/autonomous-internal-landing-policy-v1.json') return;
  let left,right; try {left=JSON.parse(before||'{}');right=JSON.parse(after||'{}')} catch {fail('CAPABILITY_JSON_PARSE_FAILED',filename)}
  for(const key of autonomousPolicyAuthorityFields) if(JSON.stringify(left[key])!==JSON.stringify(right[key])) fail('CAPABILITY_AUTHORITY_POLICY_CHANGED',filename+':'+key);
};

const assertJsonMonotonic=(before,after,filename)=>{
  let left,right; try { left=flattenJson(JSON.parse(before||'{}')); right=flattenJson(JSON.parse(after||'{}')); }
  catch { fail('CAPABILITY_JSON_PARSE_FAILED',filename); }
  for(const [path,value] of left) {
    if(!right.has(path)) fail('CAPABILITY_GUARD_REMOVED',`${filename}:${path}`);
    if(right.get(path)!==value) fail('CAPABILITY_EXISTING_VALUE_CHANGED',`${filename}:${path}`);
  }
  for(const [path,value] of right) if(!left.has(path)&&riskyValue.test(`${path}:${value}`)) fail('CAPABILITY_EXPANSION',`${filename}:${path}`);
};

const assertWorkflowDelta=(before,after,filename)=>{
  const left=yamlModel(before||''); const right=yamlModel(after||'');
  for(const [path,value] of left) {
    const sensitive=/^(on|permissions|jobs\.[^.]+\.(if|environment|permissions|secrets)|jobs\.[^.]+\.steps\.)/.test(path)||riskyValue.test(`${path}:${value}`);
    if(sensitive&&(!right.has(path)||right.get(path)!==value)) fail('CAPABILITY_GUARD_WEAKENED',`${filename}:${path}`);
  }
  for(const [path,value] of right) {
    if(left.has(path)&&left.get(path)===value) continue;
    if(/^on(?:\.|$)/.test(path)||/\.environment$/.test(path)||/\.secrets(?:\.|$)/.test(path)||riskyValue.test(`${path}:${value}`)) fail('CAPABILITY_EXPANSION',`${filename}:${path}`);
    const permission=path.match(/(?:^|\.)permissions\.([^.]+)$/);
    if(permission&&writeKey.test(permission[1])&&/^write$/i.test(value)) fail('CAPABILITY_PERMISSION_EXPANSION',`${filename}:${path}`);
  }
};

export const evaluateSemanticCapabilityDelta=({files,policy})=>{
  if(!Array.isArray(files)||!policy) fail('CAPABILITY_INPUT_INVALID');
  const transitionId = delegatedTransitionId({files, policy});
  if (transitionId) {
    return {
      state:'SEMANTIC_CAPABILITY_DELTA_PASS',
      exception:transitionId,
      evidence:files.map(file=>({filename:file.filename,transition:'EXACT_REVIEWED_REPLACEMENT'})),
    };
  }
  const exceptions=new Set(policy.delegated_internal_exact_path_exceptions||[]);
  const prefixes=policy.delegated_internal_path_prefixes||[];
  const evidence=[];
  for(const file of files) {
    const filename=file?.filename;
    if(typeof filename!=='string'||!filename) fail('CAPABILITY_PATH_INVALID');
    if(!prefixes.some(prefix=>filename.startsWith(prefix))&&!exceptions.has(filename)) continue;
    if(typeof file.base_content!=='string'||typeof file.head_content!=='string') fail('CAPABILITY_IMMUTABLE_BLOBS_REQUIRED',filename);
    if(matchesProtectedDiagnosticRepair(file,policy)){evidence.push({filename,transition:'REGISTERED_PROTECTED_DIAGNOSTIC_REPAIR',base_digest:digest(file.base_content),head_digest:digest(file.head_content),authority_created:false});continue;}
    if(matchesReviewedImmutableTransportRepair(file)){evidence.push({filename,transition:'EXACT_REVIEWED_IMMUTABLE_TRANSPORT_REPAIR',base_digest:digest(file.base_content),head_digest:digest(file.head_content)});continue;}
    if(filename.endsWith('.yml')||filename.endsWith('.yaml')) assertWorkflowDelta(file.base_content,file.head_content,filename);
    else if(derivedApprovalMetadataPaths.has(filename)&&isDerivedApprovalMetadataShape(file.base_content,filename)&&isDerivedApprovalMetadataShape(file.head_content,filename)) assertDerivedApprovalMetadataDelta(file.base_content,file.head_content,filename,files);
    else if(filename.endsWith('.json')) { assertAutonomousPolicyAuthorityFields(file.base_content,file.head_content,filename); assertJsonMonotonic(file.base_content,file.head_content,filename); }
    else {
      // Markdown is prose, including apostrophes and fenced examples. Do not
      // interpret it as JavaScript. The text guard and capability checks below
      // still apply, as does the separately computed independent verifier.
      if(!filename.endsWith('.md')) assertScriptGuardDependencies(file.base_content,file.head_content,filename);
      const before=file.base_content.split('\n').filter(line=>line.trim()&&!isComment(line));
      const after=new Set(file.head_content.split('\n').filter(line=>line.trim()&&!isComment(line)));
      const removedGuard=before.find(line=>!after.has(line)&&failClosedGuard.test(line));
      if(removedGuard) fail('CAPABILITY_GUARD_REMOVED',filename);
      if(riskyValue.test(file.head_content)&&!riskyValue.test(file.base_content)) fail('CAPABILITY_EXPANSION',filename);
    }
    evidence.push({filename,base_digest:digest(file.base_content),head_digest:digest(file.head_content)});
  }
  return {state:'SEMANTIC_CAPABILITY_DELTA_PASS',evidence};
};
