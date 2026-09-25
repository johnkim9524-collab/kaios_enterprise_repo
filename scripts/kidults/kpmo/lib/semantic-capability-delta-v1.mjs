import crypto from 'node:crypto';

export class CapabilityDeltaError extends Error {
  constructor(code, detail='') { super(detail ? `${code}:${detail}` : code); this.code=code; }
}
const fail=(code,detail='')=>{throw new CapabilityDeltaError(code,detail)};
const digest=value=>`sha256:${crypto.createHash('sha256').update(String(value)).digest('hex')}`;
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
  if(JSON.stringify(left)!==JSON.stringify(right))fail('CAPABILITY_GUARD_DEPENDENCY_CHANGED',filename);
};

const flattenJson=(value,path='',out=new Map())=>{
  if(value===null||typeof value!=='object') { out.set(path,JSON.stringify(value)); return out; }
  if(Array.isArray(value)) { value.forEach((item,index)=>flattenJson(item,`${path}[${index}]`,out)); return out; }
  for(const key of Object.keys(value).sort()) flattenJson(value[key],path?`${path}.${key}`:key,out);
  return out;
};

const yamlModel=source=>{
  if(typeof source!=='string') fail('CAPABILITY_SOURCE_MISSING');
  if(/\t/.test(source)||/(^|\s)[&*!][A-Za-z0-9_-]+|<<\s*:|:\s*[>|]\s*$/m.test(source)) fail('CAPABILITY_YAML_UNSUPPORTED_SYNTAX');
  const stack=[]; const values=new Map(); const sequenceIndexes=new Map();
  const joined=parts=>parts.reduce((path,part)=>part.startsWith('[')?`${path}${part}`:path?`${path}.${part}`:part,'');
  for(const [index,raw] of source.split('\n').entries()) {
    if(!raw.trim()||isComment(raw)||raw.trim()==='---') continue;
    const match=raw.match(/^( *)(?:(-)\s+)?([^:#][^:]*):(?:\s*(.*))?$/);
    if(!match) {
      if(/^\s*-\s+[^:]+$/.test(raw)) { values.set(`list:${index}`,raw.trim()); continue; }
      fail('CAPABILITY_YAML_UNCLASSIFIED',String(index+1));
    }
    const indent=match[1].length; if(indent%2) fail('CAPABILITY_YAML_INDENT_UNKNOWN',String(index+1));
    const sequenceItem=match[2]==='-';
    const key=match[3].trim().replace(/^['"]|['"]$/g,''); const value=(match[4]??'').trim();
    while(stack.length&&stack.at(-1).indent>=indent) stack.pop();
    if(sequenceItem) {
      const parent=joined(stack.map(x=>x.key));
      const counterKey=`${indent}:${parent}`;
      const itemIndex=sequenceIndexes.get(counterKey)||0;
      sequenceIndexes.set(counterKey,itemIndex+1);
      const itemKey=`[${itemIndex}]`;
      const path=joined([...stack.map(x=>x.key),itemKey,key]); values.set(path,value||'{}');
      stack.push({indent,key:itemKey});
      if(!value) stack.push({indent,key});
    } else {
      const path=joined([...stack.map(x=>x.key),key]); values.set(path,value||'{}');
      if(!value) stack.push({indent,key});
    }
  }
  return values;
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
  const exceptions=new Set(policy.delegated_internal_exact_path_exceptions||[]);
  const prefixes=policy.delegated_internal_path_prefixes||[];
  const evidence=[];
  for(const file of files) {
    const filename=file?.filename;
    if(typeof filename!=='string'||!filename) fail('CAPABILITY_PATH_INVALID');
    if(!prefixes.some(prefix=>filename.startsWith(prefix))&&!exceptions.has(filename)) continue;
    if(typeof file.base_content!=='string'||typeof file.head_content!=='string') fail('CAPABILITY_IMMUTABLE_BLOBS_REQUIRED',filename);
    if(filename.endsWith('.yml')||filename.endsWith('.yaml')) assertWorkflowDelta(file.base_content,file.head_content,filename);
    else if(filename.endsWith('.json')) assertJsonMonotonic(file.base_content,file.head_content,filename);
    else {
      assertScriptGuardDependencies(file.base_content,file.head_content,filename);
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
