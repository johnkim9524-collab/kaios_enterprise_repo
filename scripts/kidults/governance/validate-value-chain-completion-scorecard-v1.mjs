import fs from 'node:fs';
import process from 'node:process';
import crypto from 'node:crypto';

const SCORECARD='coordination/kidults/kpmo/value-chain-completion-scorecard-v1.json';
const SHA40=/^[0-9a-f]{40}$/;

function eventPayload(){
  const p=process.env.GITHUB_EVENT_PATH;
  if(!p || !fs.existsSync(p)) return {};
  try{return JSON.parse(fs.readFileSync(p,'utf8'));}catch{return {};}
}

function resolveBindingContext(){
  const explicit=process.env.KIDULTS_EXPECTED_PROTECTED_MAIN_SHA||'';
  const e=eventPayload();
  const prBase=e?.pull_request?.base?.sha;
  const wr=e?.workflow_run;

  const sourceExpectation=explicit
    ? {sha:explicit,source:'explicit_env',required:true}
    : SHA40.test(prBase||'')
      ? {sha:prBase,source:'pull_request.base.sha',required:true}
      : {sha:'',source:'no_source_rebind_requested',required:false};

  if(wr?.head_branch==='main' && SHA40.test(wr?.head_sha||'')) {
    return {sourceExpectation,currentExecution:{sha:wr.head_sha,source:'workflow_run.head_sha',protectedMain:true}};
  }

  if(process.env.GITHUB_REF==='refs/heads/main') {
    return {sourceExpectation,currentExecution:{sha:process.env.GITHUB_SHA||'',source:'GITHUB_SHA@refs/heads/main',protectedMain:true}};
  }

  return {sourceExpectation,currentExecution:{sha:process.env.GITHUB_SHA||'',source:'non_protected_branch_context',protectedMain:false}};
}

function validate(s,context){
  const errors=[];
  const a=(c,m)=>{if(!c)errors.push(m)};
  const total=Array.isArray(s.dimensions)?s.dimensions.reduce((n,x)=>n+Number(x.weight||0),0):NaN;
  const pass=Array.isArray(s.dimensions)?s.dimensions.filter(x=>x.state==='PASS').reduce((n,x)=>n+Number(x.weight||0),0):NaN;

  a(s.scoring_policy==='ONLY_EVIDENCED_PASS_COUNTS_AS_COMPLETE','Scoring policy must remain ONLY_EVIDENCED_PASS_COUNTS_AS_COMPLETE.');
  a(s.canonical_main_binding==='SOURCE_PROTECTED_MAIN_AT_UPDATE_PLUS_RUNTIME_COMMIT_AND_BLOB_RECEIPT','Canonical main binding contract drift.');
  a(SHA40.test(s.protected_main_truth_at_update||''),'protected_main_truth_at_update must be an exact 40-hex SHA.');
  a(total===100,'Weights must total 100.');
  a(s.weights_total===100,'weights_total must remain 100.');
  a(pass===s.evidenced_pass_weight,'Evidenced PASS weight mismatch.');
  a(s.target===100,'Target must remain 100.');
  a(s.production==='HOLD','Production must remain HOLD.');
  a(typeof s.note==='string' && s.note.includes(`source protected main ${s.protected_main_truth_at_update}`),'Scorecard note must carry the structured SHA explicitly as source protected-main provenance.');
  a(typeof s.note==='string' && s.note.includes('does not claim to contain its own Git commit SHA'),'Scorecard note must reject impossible static self-SHA semantics.');
  a(typeof s.note==='string' && s.note.includes('Production/Public/G5 HOLD'),'Scorecard note must explicitly retain Production/Public/G5 HOLD.');

  if(context.sourceExpectation.required){
    a(SHA40.test(context.sourceExpectation.sha||''),`Unable to resolve exact source protected-main SHA from ${context.sourceExpectation.source}.`);
    if(SHA40.test(context.sourceExpectation.sha||'')) a(s.protected_main_truth_at_update===context.sourceExpectation.sha,`Stale source protected-main scorecard binding: scorecard=${s.protected_main_truth_at_update} expected=${context.sourceExpectation.sha} source=${context.sourceExpectation.source}.`);
  }
  if(context.currentExecution.protectedMain){
    a(SHA40.test(context.currentExecution.sha||''),`Unable to resolve current protected-main execution SHA from ${context.currentExecution.source}.`);
  }
  return {errors,total,pass};
}

const scorecardBytes=fs.readFileSync(SCORECARD);
const scorecard=JSON.parse(scorecardBytes.toString('utf8'));
const context=resolveBindingContext();
const result=validate(scorecard,context);
const receipt={
  id:'kidults-value-chain-scorecard-runtime-binding-receipt-v1',
  version:'1.0.0',
  state:result.errors.length?'VERIFIED_FAIL':'VERIFIED_PASS',
  control:'VALUE_CHAIN_SCORECARD_SOURCE_AND_RUNTIME_BINDING',
  scorecard_source_protected_main_sha:scorecard.protected_main_truth_at_update||null,
  source_expectation_sha:context.sourceExpectation.sha||null,
  source_expectation_source:context.sourceExpectation.source,
  source_rebind_required:context.sourceExpectation.required,
  observed_repository_sha:SHA40.test(context.currentExecution.sha||'')?context.currentExecution.sha:null,
  observed_repository_sha_source:context.currentExecution.source,
  protected_main_execution:context.currentExecution.protectedMain,
  scorecard_sha256:`sha256:${crypto.createHash('sha256').update(scorecardBytes).digest('hex')}`,
  evidenced_pass_weight:result.pass,
  target:100,
  production:'HOLD',
  public_release:'HOLD',
  g5:'HOLD',
  promotion_eligible:false,
  errors:result.errors
};

const receiptPath=process.env.KIDULTS_SCORECARD_RECEIPT_PATH||'';
if(receiptPath) fs.writeFileSync(receiptPath,`${JSON.stringify(receipt,null,2)}\n`,{mode:0o600});
if(result.errors.length){for(const e of result.errors)console.error(e);console.error(JSON.stringify(receipt,null,2));process.exit(1)}

// Regression prevention: stale structured SHA and stale narrative binding must both fail.
if(context.sourceExpectation.required && SHA40.test(context.sourceExpectation.sha||'')){
  const staleSha=context.sourceExpectation.sha==='0000000000000000000000000000000000000000'
    ? '1111111111111111111111111111111111111111'
    : '0000000000000000000000000000000000000000';
  const stale={...scorecard,protected_main_truth_at_update:staleSha};
  if(validate(stale,context).errors.length===0){console.error('Mutation guard failed: stale structured source-main binding was accepted.');process.exit(1)}
  const staleNote={...scorecard,note:scorecard.note.replaceAll(scorecard.protected_main_truth_at_update,staleSha)};
  if(validate(staleNote,context).errors.length===0){console.error('Mutation guard failed: stale narrative source-main binding was accepted.');process.exit(1)}
}

const invalidRuntime={...context,currentExecution:{sha:'not-a-sha',source:'mutation',protectedMain:true}};
if(validate(scorecard,invalidRuntime).errors.length===0){console.error('Mutation guard failed: invalid protected-main runtime SHA was accepted.');process.exit(1)}
const selfClaim={...scorecard,note:scorecard.note.replace('does not claim to contain its own Git commit SHA','claims to contain its own Git commit SHA')};
if(validate(selfClaim,context).errors.length===0){console.error('Mutation guard failed: static self-SHA claim was accepted.');process.exit(1)}

console.log(JSON.stringify(receipt,null,2));
