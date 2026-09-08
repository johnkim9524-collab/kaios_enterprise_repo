import fs from 'node:fs';
import process from 'node:process';

const SCORECARD='coordination/kidults/kpmo/value-chain-completion-scorecard-v1.json';
const SHA40=/^[0-9a-f]{40}$/;

function eventPayload(){
  const p=process.env.GITHUB_EVENT_PATH;
  if(!p || !fs.existsSync(p)) return {};
  try{return JSON.parse(fs.readFileSync(p,'utf8'));}catch{return {};}
}

function resolveProtectedMainExpectation(){
  const explicit=process.env.KIDULTS_EXPECTED_PROTECTED_MAIN_SHA||'';
  if(explicit) return {sha:explicit,source:'explicit_env',published:true};

  const e=eventPayload();
  const prBase=e?.pull_request?.base?.sha;
  if(SHA40.test(prBase||'')) return {sha:prBase,source:'pull_request.base.sha',published:true};

  const wr=e?.workflow_run;
  if(wr?.head_branch==='main' && SHA40.test(wr?.head_sha||'')) {
    return {sha:wr.head_sha,source:'workflow_run.head_sha',published:true};
  }

  if(process.env.GITHUB_REF==='refs/heads/main') {
    return {sha:process.env.GITHUB_SHA||'',source:'GITHUB_SHA@refs/heads/main',published:true};
  }

  return {sha:'',source:'non_published_branch_context',published:false};
}

function validate(s,expected){
  const errors=[];
  const a=(c,m)=>{if(!c)errors.push(m)};
  const total=Array.isArray(s.dimensions)?s.dimensions.reduce((n,x)=>n+Number(x.weight||0),0):NaN;
  const pass=Array.isArray(s.dimensions)?s.dimensions.filter(x=>x.state==='PASS').reduce((n,x)=>n+Number(x.weight||0),0):NaN;

  a(s.scoring_policy==='ONLY_EVIDENCED_PASS_COUNTS_AS_COMPLETE','Scoring policy must remain ONLY_EVIDENCED_PASS_COUNTS_AS_COMPLETE.');
  a(s.canonical_main_binding==='PROTECTED_MAIN_HEAD_AT_READ','Canonical main binding contract drift.');
  a(SHA40.test(s.protected_main_truth_at_update||''),'protected_main_truth_at_update must be an exact 40-hex SHA.');
  a(total===100,'Weights must total 100.');
  a(s.weights_total===100,'weights_total must remain 100.');
  a(pass===s.evidenced_pass_weight,'Evidenced PASS weight mismatch.');
  a(s.target===100,'Target must remain 100.');
  a(s.production==='HOLD','Production must remain HOLD.');
  a(typeof s.note==='string' && s.note.includes(s.protected_main_truth_at_update),'Scorecard note must carry the same protected-main SHA as the structured binding.');
  a(typeof s.note==='string' && s.note.includes('Production/Public/G5 HOLD'),'Scorecard note must explicitly retain Production/Public/G5 HOLD.');

  if(expected.published){
    a(SHA40.test(expected.sha||''),`Unable to resolve exact protected-main SHA from ${expected.source}.`);
    if(SHA40.test(expected.sha||'')) a(s.protected_main_truth_at_update===expected.sha,`Stale protected-main scorecard binding: scorecard=${s.protected_main_truth_at_update} expected=${expected.sha} source=${expected.source}.`);
  }
  return {errors,total,pass};
}

const scorecard=JSON.parse(fs.readFileSync(SCORECARD,'utf8'));
const expected=resolveProtectedMainExpectation();
const result=validate(scorecard,expected);
if(result.errors.length){for(const e of result.errors)console.error(e);process.exit(1)}

// Regression prevention: stale structured SHA and stale narrative binding must both fail.
if(expected.published && SHA40.test(expected.sha||'')){
  const staleSha=expected.sha==='0000000000000000000000000000000000000000'
    ? '1111111111111111111111111111111111111111'
    : '0000000000000000000000000000000000000000';
  const stale={...scorecard,protected_main_truth_at_update:staleSha};
  if(validate(stale,expected).errors.length===0){console.error('Mutation guard failed: stale structured main binding was accepted.');process.exit(1)}
  const staleNote={...scorecard,note:scorecard.note.replaceAll(scorecard.protected_main_truth_at_update,staleSha)};
  if(validate(staleNote,expected).errors.length===0){console.error('Mutation guard failed: stale narrative main binding was accepted.');process.exit(1)}
}

console.log(JSON.stringify({
  status:'VERIFIED_PASS',
  control:'VALUE_CHAIN_SCORECARD_EXACT_PROTECTED_MAIN_BINDING',
  protected_main_truth_at_update:scorecard.protected_main_truth_at_update,
  expected_protected_main_sha:expected.sha||null,
  expectation_source:expected.source,
  published_context:expected.published,
  evidenced_pass_weight:result.pass,
  target:100,
  production:'HOLD',
  public_release:'HOLD',
  g5:'HOLD'
},null,2));
