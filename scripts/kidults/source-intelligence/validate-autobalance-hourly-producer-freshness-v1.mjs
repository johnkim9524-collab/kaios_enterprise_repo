#!/usr/bin/env node
import fs from 'node:fs';
import process from 'node:process';

const DEFAULT_POLICY='coordination/kidults/governance/management-control-tower-contract-v1.json';
const SHA=/^[0-9a-f]{40}$/;
const POSITIVE=/^[1-9][0-9]*$/;
const fail=(code)=>{throw new Error(code);};

function parseTime(value,code){
  const text=String(value||'');
  const ms=Date.parse(text);
  if(!Number.isFinite(ms))fail(code);
  return {text,ms};
}

export function freshnessSloMinutes(policy){
  const value=policy?.refresh_contract?.freshness_slo_minutes;
  if(!Number.isInteger(value)||value<=0||value>24*60)fail('AUTOBALANCE_FRESHNESS_SLO_INVALID');
  return value;
}

export function evaluateAutobalanceProducerFreshness({created_at,observed_at,source_sha,run_id},policy){
  if(!SHA.test(String(source_sha||'')))fail('AUTOBALANCE_PRODUCER_SHA_INVALID');
  if(!POSITIVE.test(String(run_id||'')))fail('AUTOBALANCE_PRODUCER_RUN_ID_INVALID');
  const created=parseTime(created_at,'AUTOBALANCE_PRODUCER_CREATED_AT_INVALID');
  const observed=parseTime(observed_at,'AUTOBALANCE_FRESHNESS_OBSERVED_AT_INVALID');
  const slo=freshnessSloMinutes(policy);
  const ageMs=observed.ms-created.ms;
  if(ageMs<0)fail('AUTOBALANCE_PRODUCER_FUTURE_TIMESTAMP');
  const ageSeconds=Math.floor(ageMs/1000);
  const ceilingSeconds=slo*60;
  if(ageSeconds>ceilingSeconds)fail(`AUTOBALANCE_PRODUCER_STALE:${ageSeconds}:${ceilingSeconds}`);
  return {
    id:'kidults-autobalance-hourly-producer-freshness-v1',
    state:'VERIFIED_PASS',
    source_sha,
    run_id:Number(run_id),
    producer_created_at:created.text,
    observed_at:observed.text,
    producer_age_seconds:ageSeconds,
    producer_age_minutes:Number((ageSeconds/60).toFixed(3)),
    freshness_slo_minutes:slo,
    freshness_ceiling_seconds:ceilingSeconds,
    artifact_download_authorized_by_freshness:true,
    promotion_eligible:false,
    public:'HOLD',
    production:'HOLD',
    g5:'HOLD'
  };
}

function arg(name){
  const i=process.argv.indexOf(name);
  if(i<0||!process.argv[i+1])fail(`ARG_MISSING:${name}`);
  return process.argv[i+1];
}

function selfTest(){
  const policy={refresh_contract:{freshness_slo_minutes:90}};
  const base={source_sha:'a'.repeat(40),run_id:'7'};
  const exact=evaluateAutobalanceProducerFreshness({...base,created_at:'2026-09-04T00:00:00Z',observed_at:'2026-09-04T01:30:00Z'},policy);
  if(exact.producer_age_seconds!==5400||exact.freshness_slo_minutes!==90)fail('SELF_TEST_90M_BOUNDARY');
  const cases=[
    [{...base,created_at:'2026-09-04T00:00:00Z',observed_at:'2026-09-04T01:30:01Z'},'AUTOBALANCE_PRODUCER_STALE'],
    [{...base,created_at:'2026-09-04T01:30:01Z',observed_at:'2026-09-04T01:30:00Z'},'AUTOBALANCE_PRODUCER_FUTURE_TIMESTAMP'],
    [{...base,created_at:'not-a-time',observed_at:'2026-09-04T01:00:00Z'},'AUTOBALANCE_PRODUCER_CREATED_AT_INVALID'],
    [{...base,created_at:'2026-09-04T00:00:00Z',observed_at:'not-a-time'},'AUTOBALANCE_FRESHNESS_OBSERVED_AT_INVALID'],
  ];
  for(const [input,code] of cases){let rejected=false;try{evaluateAutobalanceProducerFreshness(input,policy);}catch(error){rejected=String(error.message).startsWith(code);}if(!rejected)fail(`SELF_TEST_MUTATION_NOT_REJECTED:${code}`);}
  for(const bad of [0,-1,1441,'90']){let rejected=false;try{freshnessSloMinutes({refresh_contract:{freshness_slo_minutes:bad}});}catch{rejected=true;}if(!rejected)fail('SELF_TEST_POLICY_WEAKENING');}
  console.log(JSON.stringify({suite:'KIDULTS_AUTOBALANCE_HOURLY_PRODUCER_FRESHNESS_V1',state:'VERIFIED_PASS',positive:1,negative:8,slo_minutes:90}));
}

function main(){
  if(process.argv.includes('--self-test'))return selfTest();
  const policy=JSON.parse(fs.readFileSync(process.argv.includes('--policy')?arg('--policy'):DEFAULT_POLICY,'utf8'));
  const result=evaluateAutobalanceProducerFreshness({
    created_at:arg('--created-at'),
    observed_at:arg('--observed-at'),
    source_sha:arg('--source-sha'),
    run_id:arg('--run-id')
  },policy);
  const output=arg('--output');
  fs.writeFileSync(output,`${JSON.stringify(result,null,2)}\n`);
  console.log(JSON.stringify(result));
}

try{main();}catch(error){console.error(String(error?.message||error));process.exit(1);}
