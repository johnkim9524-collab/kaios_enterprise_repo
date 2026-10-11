import test from 'node:test';
import assert from 'node:assert/strict';
import {independentlyVerifyCapabilityDelta} from '../../../scripts/kidults/kpmo/lib/independent-capability-verifier-v1.mjs';

const policy={delegated_internal_path_prefixes:['scripts/'],delegated_internal_exact_path_exceptions:[]};
const verify=(before,after=before)=>independentlyVerifyCapabilityDelta({policy,files:[{
  filename:'scripts/example.mjs',status:'modified',base_content:before,head_content:after,
}]});
const pass=source=>assert.equal(verify(source).state,'INDEPENDENT_CAPABILITY_VERIFIED');
const reject=(before,after)=>assert.throws(()=>verify(before,after),error=>/^INDEPENDENT_(GUARD_DEPENDENCY_CHANGED|SECURITY_CAPABILITY_CHANGED|SECURITY_CAPABILITY_ADDED)$/.test(error.code));

test('canonical generation regex and unchanged default-parameter dependencies remain readable',()=>pass(String.raw`#!/usr/bin/env node
function validate(run=null){if(run&&run!==1)throw new Error('INVALID');return /\$\{\{[^}]*secrets/i.test('text');}
if(validate())throw new Error('DENIED');`));

for(const [label,source] of [
  ['escaped delimiter and brace class',String.raw`const matches=x=>/[\]{}()/]+\/suffix/i.test(x);if(matches(value))throw new Error('DENIED');`],
  ['division and division assignment',`let ratio=total / count;ratio /= 2;if(ratio<1)throw new Error('DENIED');`],
  ['regex after control parenthesis',`if(flag) /[{}]/.test(value);if(!flag)throw new Error('DENIED');`],
  ['regex after statement block',`if(flag){const x=1;} /[{}]/.test(value);if(!flag)throw new Error('DENIED');`],
  ['division after object expression',`const ratio=({value:2}).value / 2;const quotient={} / 2;if(ratio<1)throw new Error('DENIED');`],
  ['division after keyword property',`const ratio=object.return / 2;const other=object.if() / 2;if(ratio<1)throw new Error('DENIED');`],
  ['comments with fake guards',`/* if(fake){ throw fail; } */ const x=1; // if(unbalanced(\nif(x<0)throw new Error('DENIED');`],
  ['literal fake if and unmatched punctuation',String.raw`const label='if(fake(';const sample=/if\(fake\{throw/;if(!sample.test(label))throw new Error('DENIED');`],
  ['template text and nested interpolation','const tag=`if(fake{ ${(()=>{const r=/[{}]/;return r.test(value);})()} ${`nested ${value / 2}`}`;if(!tag)throw new Error("DENIED");'],
])test('identity comparison supports '+label,()=>pass(source));

test('actual guard removal stays denied',()=>reject(`if(!allowed)throw new Error('DENIED');`,`const value=1;`));
test('regex predicate changes stay denied',()=>{
  const before=String.raw`const accepted=/^safe\/path$/;if(!accepted.test(path))throw new Error('DENIED');`;
  reject(before,before.replace('^safe','^.*'));
});
test('literal comment delimiters cannot hide regex predicate changes',()=>{
  const before=String.raw`if(!/https:\/\/safe/.test(value))throw new Error('DENIED');`;
  reject(before,before.replace('safe','evil'));
});
test('template interpolation guard mutation stays denied',()=>{
  const before='const rendered=`${(()=>{if(!allowed)throw new Error("DENIED");return value;})()}`;';
  reject(before,before.replace('!allowed','allowed'));
});
test('string whitespace in predicate is significant',()=>{
  const before='if(value!=="a  b")throw new Error("DENIED");';
  reject(before,before.replace('a  b','a b'));
});
for(const source of [
  'const r=/unterminated;', 'const r=/[unterminated/;', 'const r=/ok/ii;',
  'const r=/ok/uv;', 'const s="unterminated;', 'const t=`${value;',
  'const r=/(/;', 'const r=/[a&&b]/v;',
  'const x=1; /* unclosed', 'if(flag){throw new Error("DENIED");',
])test('unsupported or malformed lexical source fails closed: '+source,()=>assert.throws(()=>verify(source),error=>error.code==='INDEPENDENT_SCRIPT_PARSE_FAILED'));

for(const source of [
  'const ratio=function(){} / 2;',
  'const ratio=function named(){} / 2;',
  'const ratio=async function named(){} / 2;',
  'const ratio=function* named(){} / 2;',
  'const ratio=async function* named(){} / 2;',
  'const ratio=class {} / 2;',
  'const ratio=class Named extends Parent {} / 2;',
  'const ratio=()=>{};const value=ratio / 2;',
  'function declared(){} /[{}]/.test(value);',
  'async function declared(){} /[{}]/.test(value);',
  'function* declared(){} /[{}]/.test(value);',
  'class Declared {} /[{}]/.test(value);',
  'export default function declared(){} /[{}]/.test(value);',
  'const outer=function(a=function inner(){} / 2,b={}){function nested(){} /[{}]/.test(value);} / 2;',
  'const outer=function(a=class Named {} / 2){return function(){} / 2;} / 2;',
  'const text=`${function(){} / 2} ${class {} / 2}`;',
  'const outer=class extends (function(){} / 2) {} / 2;',
])test('expression body close preserves slash context: '+source,()=>pass(source));

for(const source of [
  'const ratio=function(){if(!allowed)throw new Error("DENIED");} / 2;',
  'const ratio=class {method(){if(!allowed)throw new Error("DENIED");}} / 2;',
  'const outer=function(a=function(){if(!allowed)throw new Error("DENIED");} / 2){} / 2;',
])test('expression division cannot hide executable guards: '+source,()=>reject(source,source.replace('!allowed','allowed')));

test('regex following declaration remains significant in protected predicate',()=>{
  const source='function declared(){} if(!/^safe$/.test(value))throw new Error("DENIED");';
  reject(source,source.replace('^safe$','.*'));
});

for(const source of [String.raw`const x=1
function f(){} /if\(fake\{throw/.test(value);`,String.raw`const x=1
class C{} /if\(fake\{throw/.test(value);`])test('ASI declaration boundary preserves opaque regex: '+source,()=>pass(source));

for(const source of [
  String.raw`switch(kind){case condition ? 1 : 2: class C{} /if\(fake\{throw/.test(value);break;default:class D{} /if\(fake\{throw/.test(value);}`,
  String.raw`switch(kind){case 1:function f(){} /if\(fake\{throw/.test(value);break;default:function g(){} /if\(fake\{throw/.test(value);}`,
])test('switch clause declaration boundary preserves opaque regex: '+source,()=>pass(source));
