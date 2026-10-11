import {test} from 'node:test';
import assert from 'node:assert/strict';
import {evaluateSemanticCapabilityDelta} from '../../../scripts/kidults/kpmo/lib/semantic-capability-delta-v1.mjs';
const policy={delegated_internal_path_prefixes:['scripts/'],delegated_internal_exact_path_exceptions:[]};
const check=(base,head=base)=>evaluateSemanticCapabilityDelta({policy,files:[{filename:'scripts/guard.mjs',status:'modified',base_content:base,head_content:head}]});
test('primary regex brace/class/escaped slash literals are not code delimiters',()=>{
  for(const literal of [String.raw`/\$\{\{[^}]*secrets/i`,String.raw`/[{}()\[\]\/]/g`,String.raw`/a\/b/`,String.raw`/\/\*not a comment\*\//`]){
    const source=`const rule=${literal}; function validate(value){if(rule.test(value))throw new Error('HOLD');}`;
    assert.equal(check(source).state,'SEMANTIC_CAPABILITY_DELTA_PASS');
    assert.throws(()=>check(source,source.replace("throw new Error('HOLD')","return true")),/CAPABILITY_GUARD_DEPENDENCY_CHANGED|CAPABILITY_GUARD_REMOVED/);
  }
});
test('primary regex predicate changes remain guard changes',()=>{
  const source=String.raw`const rule=/\$\{\{[^}]*secrets/i; function validate(value){if(rule.test(value))throw new Error('HOLD');}`;
  assert.throws(()=>check(source,source.replace('secrets','public')),/CAPABILITY_GUARD_DEPENDENCY_CHANGED/);
});
test('primary division and division assignment are distinct from regular expressions',()=>{
  for(const expression of ['amount / 2','(amount + 1) / 2','amount /= 2','object.return / 2','object.if() / 2','({value:2}).value / 2','{} / 2']){
    const source=`function validate(amount){const value=${expression};if(value<1)throw new Error('HOLD');}`;
    assert.equal(check(source).state,'SEMANTIC_CAPABILITY_DELTA_PASS');
  }
});
test('primary malformed regex fails closed',()=>{
  for(const literal of ['/unterminated','/[unterminated/','/a/gg','/a/z','/a/uv','/a/v','/(/','/a/flags1'])
    assert.throws(()=>check(`const rule=${literal}; if(rule)throw new Error('HOLD');`),/CAPABILITY_SCRIPT_PARSE_FAILED/);
});
test('primary supports regex after a control statement or statement block',()=>{
  for(const prefix of ['if(flag)','if(flag){const x=1;}']){
    const source=String.raw`${prefix} /if\(fake\{throw/.test(value);if(!flag)throw new Error('HOLD');`;
    assert.equal(check(source).state,'SEMANTIC_CAPABILITY_DELTA_PASS');
  }
});
test('primary ignores fake guards inside strings, comments, regex and template text',()=>{
  for(const source of [
    String.raw`const r=/if\(fake\{throw/;if(!r.test(value))throw new Error('HOLD');`,
    'const text="if(fake(";if(!text)throw new Error("HOLD");',
    '/* if(fake {throw */ const text=1; // if(unbalanced(\nif(!text)throw new Error("HOLD");',
    'const text=`if(fake{ ${value / 2} ${`nested ${/[{}]/.test(value)}`}`;if(!text)throw new Error("HOLD");',
  ])assert.equal(check(source).state,'SEMANTIC_CAPABILITY_DELTA_PASS');
});
test('primary keeps executable template interpolation guards and their dependencies',()=>{
  const before='const enabled=true;\nconst output=`${(()=>{if(!enabled)throw new Error("HOLD");return 1;})()}`;';
  assert.equal(check(before).state,'SEMANTIC_CAPABILITY_DELTA_PASS');
  assert.throws(()=>check(before,before.replace('enabled=true','enabled=false')),/CAPABILITY_GUARD_DEPENDENCY_CHANGED/);
  assert.throws(()=>check(before,before.replace('if(!enabled)','if(enabled)')),/CAPABILITY_GUARD_DEPENDENCY_CHANGED/);
});
test('primary preserves literal whitespace and regex comment-looking predicate bytes',()=>{
  for(const [source,before,after] of [
    ['if(value!=="a  b")throw new Error("HOLD");','a  b','a b'],
    [String.raw`if(!/https:\/\/safe/.test(value))throw new Error('HOLD');`,'safe','evil'],
  ])assert.throws(()=>check(source,source.replace(before,after)),/CAPABILITY_GUARD_DEPENDENCY_CHANGED/);
});
test('primary unsupported or unterminated lexical constructs remain fail closed',()=>{
  for(const source of ['const t=`${value;','const text="unclosed;','if(flag){throw new Error("HOLD");','const x=1; /* unclosed'])
    assert.throws(()=>check(source),/CAPABILITY_SCRIPT_PARSE_FAILED/);
});
